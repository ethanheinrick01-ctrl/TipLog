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
  weekOf?: string;     // YYYY-MM-DD of Monday (may be absent — HotSchedules doesn't always show it)
  shifts: ParsedShift[];
  rawText?: string;
  success: boolean;
  error?: string;
}

// ─── Time normalisation ───────────────────────────────────────────────────────

/** Convert any time string to 24h HH:MM.
 *  Handles: "10:00 AM", "10:00am", "10:00a", "10a", "10:00", "10", "4:45 PM", "4:45pm"
 *  Also handles ranges: "10a-2p" → ["10:00","14:00"]
 */
function normaliseTime(input: string): string {
  if (!input) return "";
  const s = input.trim();

  // Range: "10a-2p" / "10:00am-2:00pm" / "10:00 AM - 2:00 PM"
  const range = s.match(/^(\d{1,2}(?::\d{2})?(?:\s*[ap]\.?m?\.?)?)\s*[-–]\s*(\d{1,2}(?::\d{2})?(?:\s*[ap]\.?m?\.?)?)$/i);
  if (range) {
    return `${normaliseTime(range[1])}–${normaliseTime(range[2])}`;
  }

  // Strip trailing period and whitespace
  const clean = s.replace(/[ap]\.?m?\.?$/i, "").trim();
  const parts = clean.split(":");
  let h = parseInt(parts[0]);
  const min = parts[1] ? parts[1].padStart(2, "0") : "00";

  const isPM = /\s*p\.?m?\.?$/i.test(s) || /p$/i.test(s);
  const isAM = /\s*a\.?m?\.?$/i.test(s) || /a$/i.test(s);

  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;

  return `${String(h).padStart(2, "0")}:${min}`;
}

/** Split a range like "10:00–14:00" into [clockIn, clockOut] */
function splitRange(range: string): [string, string] {
  const parts = range.split("–");
  return [parts[0]?.trim() ?? "", parts[1]?.trim() ?? ""];
}

// ─── Date normalisation ───────────────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan: "01", january: "01",
  feb: "02", february: "02",
  mar: "03", march: "03",
  apr: "04", april: "04",
  may: "05",
  jun: "06", june: "06",
  jul: "07", july: "07",
  aug: "08", august: "08",
  sep: "09", sept: "09", september: "09",
  oct: "10", october: "10",
  nov: "11", november: "11",
  dec: "12", december: "12",
};

const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Parse a HotSchedules date string into YYYY-MM-DD.
 *  Handles: "2026-04-04" (ISO), "Apr 4", "Apr 4, 2026", "April 4", "Sat, Apr 4"
 *  Year defaults to 2026 if not present.
 */
function normaliseDate(dateStr: string, defaultYear = 2026): string {
  const d = (dateStr ?? "").toLowerCase().replace(/,/g, "").trim();

  // ISO format: "2026-04-04"
  const iso = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const y = iso[1];
    const m = iso[2].padStart(2, "0");
    const day = iso[3].padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Human format: "apr 4" / "sat, apr 4" / "april 4, 2026"
  const m = d.match(/(\w+)\.?\s+(\d{1,2})(?:\s+(\d{4}))?/);
  if (!m) return `${defaultYear}-??-??`;

  const monthStr = m[1];
  const day = m[2].padStart(2, "0");
  const year = m[3] ?? String(defaultYear);
  const mm = MONTH_MAP[monthStr] ?? "??";
  return `${year}-${mm}-${day}`;
}

// ─── GPT response mapping ─────────────────────────────────────────────────────

/**
 * Map GPT's various output schemas to a consistent HotSchedulesData shape.
 * Handles:
 * - Various field names (shifts vs schedule vs entries vs days)
 * - Various date formats (YYYY-MM-DD, "Apr 4", "Sat Apr 4")
 * - Various time formats (12h, 24h, ranges)
 * - Only includes shifts that have a non-empty position
 */
function mapGptToScheduleData(gpt: any): HotSchedulesData {
  // Determine the current year from GPT's output if possible
  const sampleDate = JSON.stringify(gpt).match(/\b(202[5-9]|203\d)\b/);
  const defaultYear = sampleDate ? parseInt(sampleDate[0]) : 2026;

  // ── Collect all possible shift arrays ───────────────────────────────────
  const rawShifts: any[] = [];

  const arrays = [
    gpt.shifts,
    gpt.schedule,
    gpt.entries,
    gpt.days,
    gpt.data?.shifts,
    gpt.shiftsList,
  ];
  for (const arr of arrays) {
    if (Array.isArray(arr)) rawShifts.push(...arr);
  }

  // ── Normalise each shift ────────────────────────────────────────────────
  const seen = new Set<string>();
  const shifts: ParsedShift[] = [];

  for (const shift of rawShifts) {
    if (!shift || typeof shift !== "object") continue;

    // Position must exist and be non-empty
    const position = (shift.position ?? shift.role ?? shift.job ?? shift.title ?? "").trim();
    if (!position) continue;

    // Parse date
    const dateRaw =
      shift.date ??
      shift.day ??
      shift.dateStr ??
      shift.dateString ??
      shift.shiftDate ??
      "";
    const date = normaliseDate(dateRaw, defaultYear);
    if (date.includes("??")) continue; // unparseable date — skip

    // Parse time — GPT often returns clockIn/clockOut as separate fields
    const timeRaw =
      shift.timeRange ??
      shift.time ??
      shift.hours ??
      (shift.clockIn && shift.clockOut
        ? `${shift.clockIn}–${shift.clockOut}`
        : shift.clockIn ??
        "");
    const timeRange = normaliseTime(timeRaw);
    const [clockIn, clockOut] = splitRange(timeRange);

    if (!clockIn || !clockOut) continue;

    // Deduplicate by date+time+position
    const key = `${date}|${clockIn}|${clockOut}|${position}`;
    if (seen.has(key)) continue;
    seen.add(key);

    shifts.push({ date, clockIn, clockOut, position });
  }

  return {
    employeeName: gpt.employeeName ?? gpt.name ?? gpt.employee ?? "",
    weekOf: gpt.weekOf,
    shifts,
    success: true,
  };
}

// ─── Edge function handler ────────────────────────────────────────────────────

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

  // ── Dynamic date computation ──────────────────────────────────────────────
  const today = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = today.getFullYear();
  const todayStr = `${dayNames[today.getDay()]}, ${monthNames[today.getMonth()]} ${today.getDate()}`;
  const todayISO = `${currentYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Find the surrounding Sat–Fri week window (HotSchedules weeks run Sat–Fri)
  const dayOfWeek = today.getDay(); // 0=Sun … 6=Sat
  const daysFromSat = (dayOfWeek + 1) % 7; // how many days since last Saturday
  const thisWeekSat = new Date(today);
  thisWeekSat.setDate(today.getDate() - daysFromSat);
  const thisWeekFri = new Date(thisWeekSat);
  thisWeekFri.setDate(thisWeekSat.getDate() + 6);
  const nextWeekSat = new Date(thisWeekSat);
  nextWeekSat.setDate(thisWeekSat.getDate() + 7);
  const nextWeekFri = new Date(thisWeekSat);
  nextWeekFri.setDate(thisWeekSat.getDate() + 13);

  const fmtDate = (d: Date) => `${monthNames[d.getMonth()]} ${d.getDate()}`;
  const thisWeekStr = `Sat ${fmtDate(thisWeekSat)} through Fri ${fmtDate(thisWeekFri)}`;
  const nextWeekStr = `Sat ${fmtDate(nextWeekSat)} through Fri ${fmtDate(nextWeekFri)}`;
  const currentMonthStr = `${monthNames[today.getMonth()]}-${monthNames[(today.getMonth() + 1) % 12]} ${currentYear}`;

  const systemPrompt = `You are an expert at reading HotSchedules shift screenshots from Mike Anderson's Seafood.

## What HotSchedules looks like:
- Shows "THIS WEEK" and "NEXT WEEK" sections with dates like "Sat, Apr 4", "Mon Apr 6"
- Shifts show the TIME in 12h format ("10:00 AM") and a POSITION ("SERVER")
- The year is NOT shown — only month and day (e.g. "Apr 4" means April 4, ${currentYear})
- There may be multiple weeks shown in one screenshot

## IMPORTANT — DATE RULES:
- Dates shown are "Sat, Apr 4" or "Mon Apr 6" format — the year is CURRENT YEAR (${currentYear})
- "Today" = ${todayStr} (${todayISO})
- "This Week" shows ${thisWeekStr} (7 days)
- "Next Week" shows ${nextWeekStr}
- ALWAYS use ${currentYear} as the year unless the image clearly shows a different year
- "Apr 4" alone = "${currentYear}-04-04"; "Apr 30" = "${currentYear}-04-30"

## TIME RULES:
- "10:00 AM" = clockIn="10:00", clockOut depends on shift length (infer from context)
- If only ONE time is shown (e.g. "10:00 AM SERVER"), it's the START time — estimate end from context or use "14:00" as default for AM shifts
- If a RANGE is shown ("10:00 AM – 2:00 PM"), extract both clockIn and clockOut
- Convert all times to 24h format: "10:00 AM"→"10:00", "2:00 PM"→"14:00"

## POSITION RULES:
- Only extract shifts that have a JOB TITLE / POSITION next to them (e.g. "SERVER", "Bartender", "Host")
- "1 Shift Available" or "Open Shift" = NO position, SKIP these
- Positions to watch for: Server, Bartender, Host, Busser, Expo, Food Runner, Support

## SHIFT FORMAT:
Return a JSON object with:
- employeeName: string (the logged-in employee's name, or "HotSchedules User" if not shown)
- shifts: array of objects, each with:
  - date: YYYY-MM-DD (e.g. "2026-04-04")
  - clockIn: HH:MM (24h)
  - clockOut: HH:MM (24h)
  - position: string (e.g. "Server")
- success: true

Return ONLY valid JSON, no markdown fences, no explanation.`;

  const userPrompt = `Extract all shifts from this HotSchedules schedule. Only include rows with a job title/position. Dates are in ${currentMonthStr}.

IMPORTANT for this user at Mike Anderson's:
- Mon-Thu: AM is 10:00 AM-2:00 PM; PM is 4:45 PM-9:30 PM.
- Fri-Sat: AM is 10:00 AM-3:59 PM; PM is 4:00 PM-11:00 PM.
- Sun: AM is 10:00 AM-2:59 PM; PM is 3:00 PM-9:30 PM.
- If screenshot shows only the start time, infer clockOut using the day-of-week + AM/PM block above.
- If screenshot explicitly shows a time range, trust the screenshot range.`;

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
      const cleaned = rawText.replace(/```json\s*/i, "").replace(/```\s*/g, "").trim();
      gptResult = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Couldn't read a valid HotSchedules screenshot. Try a clearer full screenshot that shows dates and shifts.",
          rawText,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const parsed = mapGptToScheduleData(gptResult);

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
