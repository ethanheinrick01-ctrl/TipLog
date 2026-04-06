// Test just one image at a time
const img3Path = "/Users/ethanheinrick/.openclaw/media/inbound/IMG_3622---ac6364e1-ea20-4c21-a397-b0f4a3375577.jpg";

const openaiKey = Deno.env.get("OPENAI_API_KEY");

const systemPrompt = `You are an expert at reading HotSchedules shift calendars.
Extract ALL shifts from this schedule and return a JSON object with:
- employeeName: string 
- weekOf: string (YYYY-MM-DD of the Monday)
- shifts: array of objects with:
  - date: YYYY-MM-DD
  - clockIn: HH:MM (24h format)
  - clockOut: HH:MM (24h format)  
  - position: string

Return ONLY valid JSON, no markdown fences, no explanation.`;

const userPrompt = "Extract all shifts from this HotSchedules weekly view.";

// Read file as binary and encode
const data = await Deno.readFile(img3Path);
const binary = new Uint8Array(data);
let binaryStr = "";
for (let i = 0; i < binary.length; i++) {
  binaryStr += String.fromCharCode(binary[i]);
}
const base64 = btoa(binaryStr);

const contents = [{
  type: "image_url" as const,
  image_url: { url: `data:image/jpeg;base64,${base64}` },
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

const result = await response.json();
const rawText = result.choices?.[0]?.message?.content ?? "";
console.log("Raw GPT response:");
console.log(rawText);

try {
  const cleaned = rawText.replace(/```json\s*/i, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);
  console.log("\nParsed JSON:");
  console.log(JSON.stringify(parsed, null, 2));
} catch (e) {
  console.log("Failed to parse JSON:", e);
}
