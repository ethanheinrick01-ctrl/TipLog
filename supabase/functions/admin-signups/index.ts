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
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Gateway auth for this function should use anon key in Authorization header.
    // End-user JWT is forwarded separately so we can validate admin identity here.
    const forwardedUserToken = req.headers.get("x-user-token") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const authBearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const token = forwardedUserToken || authBearer;
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

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const {
      data: { user },
      error: authErr,
    } = await admin.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

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

    const users: AdminSignup[] = allUsers
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        name: profileMap.get(u.id)?.name ?? u.user_metadata?.name ?? "",
        createdAt: u.created_at,
        confirmed: !!u.email_confirmed_at,
      }))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

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
