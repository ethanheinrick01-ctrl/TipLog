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
  const systemPrompt = `You are an expert at reading Toast POS washout/cashout slips from Mike Anderson's Seafood.

## TIP SHARING SECTION (most important — read carefully)

The TIP SHARING section has rows like this:
  ROLE NAME | percentage description | DOLLAR AMOUNT

Extract ONLY the dollar amount from the rightmost column for each role. DO NOT sum rows together.

Examples from real Toast slips:

Example 1 (day shift):
  Busser | 1.50% of Food | $8.35
  Runner | 1.50% of Food | $8.35
  Bar | 8% of NA Bar | $0.32
  Oysters | 8% of Oysters | $2.08
  → busser: 8.35, runner: 8.35, bar: 0.32, oyster: 2.08

Example 2 (evening shift):
  Busser | 1.50% of Food | $14.79
  Runner | 1.50% of Food | $14.79
  Bar | 8% of Beer, Liquor, NA Beverage | $14.30
  Bar Wine | 8% of Beer, Liquor, NA Beverage | (blank — treat as $0 or omit)
  Oysters | 8% of Oysters | $3.67
  → busser: 14.79, runner: 14.79, bar: 14.30, oyster: 3.67

Example 3 (evening shift — Bar and Oysters totaled differently):
  Busser | 1.50% of Food | $14.79
  Runner | 1.50% of Food | $14.79
  Bar | 8% of Beer, Liquor, NA Beverage | $47.55
  Oysters | 8% of Oysters | $3.67
  → busser: 14.79, runner: 14.79, bar: 47.55, oyster: 3.67
  (Note: $47.55 is the correct bar value as-printed on this slip)

## KEY RULES FOR TIP SHARING:
1. Extract each dollar amount DIRECTLY from the rightmost column — do NOT compute or recompute
2. If a row has a blank dollar amount, treat it as 0 or omit the key
3. If "Bar" and "Bar Wine" appear as separate rows, sum their dollar amounts into bar
4. Possible roles (use these exact keys): busser, runner, bar, oyster, expo, host, foodRunner, support, other
5. The "Total" row at the bottom is the sum — do NOT use it as any individual category value

## OTHER SECTIONS:
- TIPS & FEES EARNED: tipsCredit (non-cash), tipsCash, tipsWithheld (3% employer tax already deducted)
- SALES & TAXES SUMMARY: sales total, covers count
- Header: date (YYYY-MM-DD), clockIn, clockOut

## RETURN FORMAT:
Return a JSON object with:
- date, clockIn, clockOut, tipsCredit, tipsCash, tipsWithheld, sales, covers
- tipOutByCategory: {busser, runner, bar, oyster, expo, host, foodRunner, support, other}
- success: true

Return ONLY valid JSON, no markdown fences, no explanation.`

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
