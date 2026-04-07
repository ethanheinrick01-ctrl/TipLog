import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AdminSignup = {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  confirmed: boolean;
  shiftsTotal: number;
  shiftsLast7d: number;
  shiftsLast30d: number;
  lastActivity?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Extract user token from custom header (anon key goes in Authorization for gateway)
    const token = req.headers.get("x-user-token") ?? "";
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing user token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Parse JWT payload to get user ID (JWT structure: header.payload.signature)
    let userId: string | null = null;
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        userId = payload.sub ?? null;
      }
    } catch {
      // ignore parse errors
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Invalid token format" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Fetch user via admin API using the userId from JWT
    const { data: userData, error: userErr } = await admin.auth.admin.getUserById(userId);

    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const user = userData.user;

    const adminEmails = (Deno.env.get("ADMIN_EMAILS") ?? "ethanheinrick01@gmail.com")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const requesterEmail = (user.email ?? "").toLowerCase();
    if (!adminEmails.includes(requesterEmail)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const allUsers: any[] = [];
    let page = 1;
    const perPage = 200;

    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const batch = data?.users ?? [];
      allUsers.push(...batch);
      if (batch.length < perPage) break;
      page += 1;
    }

    const { data: profiles } = await admin.from("users").select("id,name,email");
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    const { data: shifts } = await admin.from("shifts").select("userId,createdAt,updatedAt");
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const shiftStats = new Map<string, { total: number; d7: number; d30: number; last: number | null }>();

    for (const s of shifts ?? []) {
      const userId = s.userId as string;
      const ts = +new Date(s.updatedAt ?? s.createdAt ?? Date.now());
      const prev = shiftStats.get(userId) ?? { total: 0, d7: 0, d30: 0, last: null };
      prev.total += 1;
      if (now - ts <= 7 * dayMs) prev.d7 += 1;
      if (now - ts <= 30 * dayMs) prev.d30 += 1;
      if (!prev.last || ts > prev.last) prev.last = ts;
      shiftStats.set(userId, prev);
    }

    const users: AdminSignup[] = allUsers
      .map((u) => {
        const stats = shiftStats.get(u.id) ?? { total: 0, d7: 0, d30: 0, last: null };
        return {
          id: u.id,
          email: u.email ?? "",
          name: profileMap.get(u.id)?.name ?? u.user_metadata?.name ?? "",
          createdAt: u.created_at,
          confirmed: !!u.email_confirmed_at,
          shiftsTotal: stats.total,
          shiftsLast7d: stats.d7,
          shiftsLast30d: stats.d30,
          lastActivity: stats.last ? new Date(stats.last).toISOString() : null,
        };
      })
      .sort((a, b) => {
        const ta = a.lastActivity ? +new Date(a.lastActivity) : 0;
        const tb = b.lastActivity ? +new Date(b.lastActivity) : 0;
        return tb - ta;
      });

    return new Response(JSON.stringify({ users }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
