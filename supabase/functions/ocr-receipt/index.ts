import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

/** Normalise a GPT role string to a known tipOutByCategory key. */
function normaliseRole(role: string): string | null {
  const r = role.toLowerCase().trim();
  // Explicitly reject total/subtotal rows so they never pollute category buckets
  if (r === 'total' || r === 'subtotal' || r.startsWith('total ')) return null;
  if (r.includes('busser')) return 'busser';
  if (r.includes('runner')) return 'runner';
  if (r.includes('bar') && !r.includes('wine')) return 'bar';
  if (r.includes('oyster')) return 'oyster';
  if (r.includes('expo')) return 'expo';
  if (r.includes('host')) return 'host';
  if (r.includes('food')) return 'foodRunner';
  if (r.includes('support')) return 'support';
  return 'other';
}

/** Convert 12h time ("10:30 AM", "2:48 PM") to 24h ("10:30", "14:48"). */
function to24h(time: string): string {
  if (!time) return time;
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return time;
  let h = parseInt(m[1]), min = m[2];
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
}

/**
 * Map GPT's output schema to the ToastReceiptData interface.
 * GPT likes returning its own schema — this ensures the app always gets
 * the fields it expects regardless of what GPT outputs.
 */
function mapGptToReceiptData(gpt: any): ToastReceiptData {
  // ── tipOutByCategory ──────────────────────────────────────────
  const tipOut: Record<string, number> = {
    busser: 0, runner: 0, bar: 0, oyster: 0,
    expo: 0, host: 0, foodRunner: 0, support: 0, other: 0,
  };

  // Format 1: direct tipOutByCategory object — what the prompt actually asks GPT to return
  if (gpt.tipOutByCategory && typeof gpt.tipOutByCategory === 'object' && !Array.isArray(gpt.tipOutByCategory)) {
    for (const [role, val] of Object.entries(gpt.tipOutByCategory)) {
      const key = normaliseRole(role);
      if (key === null) continue; // skip total/subtotal rows
      const amt = parseFloat(String(val));
      if (!isNaN(amt)) tipOut[key] = (tipOut[key] ?? 0) + amt;
    }
  }

  // Format 2: tipSharingEntries array (legacy / alternate GPT schema)
  const entries = Array.isArray(gpt.tipSharingEntries) ? gpt.tipSharingEntries : [];
  for (const entry of entries) {
    const key = normaliseRole(entry.role ?? '');
    if (key === null) continue; // skip total/subtotal rows
    const amt = parseFloat(entry.amount);
    if (!isNaN(amt)) tipOut[key] = (tipOut[key] ?? 0) + amt;
  }

  // ── Covers: sum all quantities in categoryBreakdown ────────────
  let covers = 0;
  const cat = gpt.categoryBreakdown ?? {};
  for (const val of Object.values(cat)) {
    if (typeof val === 'number') covers += val;
  }

  // ── Field mapping (handles multiple GPT schema variants) ───────
  // Trust raw GPT fields; fall back to 0 only when truly absent
  const tipsCredit = gpt.tipsCredit ?? gpt.creditTips ?? 0;
  const tipsCash   = gpt.tipsCash   ?? gpt.cashTipsDeclared ?? 0;
  const sales      = gpt.sales      ?? gpt.totalNetSales   ?? 0;

  return {
    date:        gpt.shiftDate ?? gpt.date,
    clockIn:     to24h(gpt.clockIn ?? ''),
    clockOut:    to24h(gpt.clockOut ?? ''),
    tipsCredit:  parseFloat(tipsCredit) || 0,
    tipsCash:    parseFloat(tipsCash)   || 0,
    tipsWithheld: parseFloat(gpt.tipsWithheld) || 0,
    sales:       parseFloat(sales)      || 0,
    covers,
    tipOutByCategory: tipOut,
    success: true,
  };
}
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

  // ── Dynamic date context ────────────────────────────────────────────────
  const today = new Date();
  const currentYear = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayISO = `${currentYear}-${mm}-${dd}`;

  // Build GPT-4o vision prompt for Toast washout slips
  const systemPrompt = `You are an expert at reading Toast POS washout/cashout slips from Mike Anderson's Seafood.

## DATE RULES (critical):
- Today is ${todayISO}. The current year is ${currentYear}.
- Toast slips show dates like "4/4/2026, 2:53 PM" or "04/04/2026"
- ALWAYS use ${currentYear} as the year unless the slip clearly shows a different year
- Return date as YYYY-MM-DD — e.g. "4/4/2026" → "${currentYear}-04-04"
- NEVER return a year before 2025 — if you're unsure, use ${currentYear}

## SHIFT DATE vs. PRINT TIMESTAMP (critical — read carefully):
Toast slips contain TWO different dates that must NOT be confused:
1. SHIFT DATE — appears in the slip header near the employee name, position, and clock-in/out times. This is the date the shift actually occurred. USE THIS DATE.
2. PRINT TIMESTAMP — appears in the bottom-right corner or footer, formatted like "4/4/2026, 2:11 PM". This is when the receipt was physically printed (often the next morning after a closing shift). IGNORE THIS DATE for the "date" field.

Rule: ALWAYS use the shift date from the header, NOT the print timestamp from the footer.
If the slip header shows the shift was on 4/3/2026 but the footer shows "Printed: 4/4/2026, 2:11 PM", return date: "${currentYear}-04-03".
The clockIn and clockOut fields confirm which date is the shift date — they always belong to the shift date, not the print date.

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

Example 3 (evening shift with Bar and Bar Wine separate):
  Busser | 1.50% of Food | $14.79
  Runner | 1.50% of Food | $14.79
  Bar | 8% of Beer, Liquor, NA Beverage | $14.30
  Bar Wine | 8% of Wine | $0.00
  Oysters | 8% of Oysters | $3.67
  Total | | $47.55
  → busser: 14.79, runner: 14.79, bar: 14.30, oyster: 3.67
  (The $47.55 is the TOTAL row — it is NEVER assigned to Bar or any other category)

## KEY RULES FOR TIP SHARING:
1. Extract each dollar amount DIRECTLY from the rightmost column — do NOT compute or recompute
2. If a row has a blank dollar amount, treat it as 0 or omit the key
3. If "Bar" and "Bar Wine" appear as separate rows, sum their dollar amounts into bar
4. Possible roles (use these exact keys): busser, runner, bar, oyster, expo, host, foodRunner, support, other
5. The "Total" row at the bottom is the sum of all rows — NEVER assign it to Bar or any other role
6. CRITICAL: The last dollar amount in the TIP SHARING section is always the running Total — it will be larger than any individual row. Do NOT assign it to any category.

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
    const contents = images.map((imageInput: string) => ({
      type: "image_url" as const,
      image_url: {
        url: imageInput.startsWith("data:")
          ? imageInput
          : `data:image/jpeg;base64,${imageInput}`,
      },
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

    let gptResult: any;
    try {
      // Strip any markdown code fences
      const cleaned = rawText.replace(/```json\s*/i, "").replace(/```\s*/g, "").trim();
      gptResult = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Couldn't read a valid Toast cashout from that image. Try a clearer full screenshot/photo.",
          rawText,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Map GPT's output schema to ToastReceiptData
    const parsed = mapGptToReceiptData(gptResult);

    return new Response(JSON.stringify({ ...parsed, success: true, rawText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
