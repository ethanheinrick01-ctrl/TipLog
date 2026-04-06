// Quick test script to see what GPT actually returns from the schedule images
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { readFileSync } from "https://deno.land/std@0.177.0/node/fs.ts";

const img1Path = "/Users/ethanheinrick/.openclaw/media/inbound/IMG_3594---af46e9ac-59a2-4001-900b-3d9533101a99.png";
const img2Path = "/Users/ethanheinrick/.openclaw/media/inbound/IMG_3619---d91e28fd-da70-4943-a30b-e4af163950d8.png";
const img3Path = "/Users/ethanheinrick/.openclaw/media/inbound/IMG_3622---ac6364e1-ea20-4c21-a397-b0f4a3375577.jpg";

function encodeImage(path: string): string {
  const data = readFileSync(path);
  return btoa(String.fromCharCode(...data));
}

const images = [
  encodeImage(img1Path),
  encodeImage(img2Path),
  encodeImage(img3Path),
];

const openaiKey = Deno.env.get("OPENAI_API_KEY");

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

for (let i = 0; i < images.length; i++) {
  console.log(`\n=== Testing image ${i + 1} ===`);
  
  const contents = [{
    type: "image_url" as const,
    image_url: { url: `data:image/jpeg;base64,${images[i]}` },
  }];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: [{ type: "text", text: userPrompt }, ...contents] },
      ],
      max_tokens: 2048,
      temperature: 0.1,
    }),
  });

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content ?? "";
  console.log("Raw GPT response:");
  console.log(rawText);
  
  try {
    const cleaned = rawText.replace(/```json\s*/i, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    console.log("Parsed JSON:");
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.log("Failed to parse JSON:", e);
  }
}