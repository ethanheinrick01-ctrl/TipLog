import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedShift {
  date: string;       // YYYY-MM-DD
  clockIn: string;    // HH:MM 24h
  clockOut: string;   // HH:MM 24h
  position: string;   // e.g. "Server", "Bartender"
  notes?: string;
}

interface HotSchedulesData {
  employeeName?: string;
  weekOf?: string;    // YYYY-MM-DD of Monday
  shifts: ParsedShift[];
  rawText?: string;
  success: boolean;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return new Response(JSON.stringify({ success: false, error: "OPENAI_API_KEY not set" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  let body: { images: string[] } | null = null;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Invalid JSON body" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const { images } = body ?? { images: [] };
  if (!images.length) {
    return new Response(JSON.stringify({ success: false, error: "No images provided" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }

  const systemPrompt = `You are an expert at reading HotSchedules shift calendars.
HotSchedules typically shows a weekly view with:
- Employee name at top
- Days of the week (Mon–Sun) as columns
- Shift blocks showing time range and position/role
- "Week of" date at the top

Extract ALL shifts from this schedule and return a JSON object with:
- employeeName: string (the employee's name shown on the schedule)
- weekOf: string (YYYY-MM-DD of the Monday of this schedule week)
- shifts: array of objects, each with:
  - date: YYYY-MM-DD
  - clockIn: HH:MM (24h format — convert from AM/PM if needed)
  - clockOut: HH:MM (24h format)
  - position: string (Server, Bartender, Host, etc.)
- success: true

Rules:
- If a shift shows "6a–2p" convert to clockIn="06:00", clockOut="14:00"
- Dates are often shown as just day names (Mon, Tue...) — combine with the "Week of" date to get YYYY-MM-DD
- If multiple shifts appear on the same day, include each one separately
- If a day has no shift, omit it (don't include empty entries)
- Return ONLY valid JSON, no markdown fences, no explanation`;

  const userPrompt = "Extract all shifts from this HotSchedules weekly view.";

  try {
    const contents = images.map((base64: string) => ({
      type: "image_url" as const,
      image_url: { url: `data:image/jpeg;base64,${base64}` },
    }));

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        // Use gpt-4o-mini for cost efficiency on simple schedule images
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: [{ type: "text", text: userPrompt }, ...contents] },
        ],
        max_tokens: 2048,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ success: false, error: `OpenAI error: ${err}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content ?? "";

    let parsed: HotSchedulesData;
    try {
      const cleaned = rawText.replace(/```json\s*/i, "").replace(/```\s*/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to parse GPT response", rawText }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    return new Response(JSON.stringify({ ...parsed, success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
