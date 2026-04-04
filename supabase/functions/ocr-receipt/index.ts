import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ToastReceiptData {
  date?: string;
  clockIn?: string;
  clockOut?: string;
  tipsCredit?: number;
  tipsCash?: number;
  tipsWithheld?: number; // 3% employer tax
  sales?: number;
  covers?: number;
  tipOutByCategory?: Record<string, number>;
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

  // Build GPT-4o vision prompt for Toast washout slips
  const systemPrompt = `You are an expert at reading Toast POS washout/cashout slips. 
Extract all financial data from the receipt image and return a JSON object with these fields:
- date: YYYY-MM-DD string (from the slip header)
- clockIn: HH:MM string (24h, from header)
- clockOut: HH:MM string (24h, from header)
- tipsCredit: number (total credit card / "non-cash" tips)
- tipsCash: number (cash tips declared, can be 0)
- tipsWithheld: number (3% employer tax amount shown as "Tips withheld" — usually 3% of tips, can be 0)
- sales: number (total net sales from the sales summary section)
- covers: number (total guest count if visible, otherwise 0)
- tipOutByCategory: object with keys like busser, runner, bar, oyster, expo, host, foodRunner, support, other — each a dollar amount (can be 0 or missing)
- success: boolean (true if you found enough data to be useful)

Rules:
- If a field cannot be determined, use null (not 0 for unknown strings)
- tipOutByCategory values should be DOLLARS (not percentages) — extract the actual dollar amount owed per category
- Look in the "TIP SHARING / TIP-OUTS" section for tip-out amounts
- Look in "TIPS & FEES EARNED" section for tip totals and 3% withheld
- Look in "SALES & TAXES SUMMARY" for sales total and category breakdowns
- If tipsWithheld is listed as a % (like "3%"), compute the dollar amount from the tip total
- Return ONLY valid JSON, no markdown fences, no explanation`;

  const userPrompt = "Extract all numbers and financial data from this Toast washout slip.";

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
        model: "gpt-4o",
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

    let parsed: ToastReceiptData;
    try {
      // Strip any markdown code fences
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
