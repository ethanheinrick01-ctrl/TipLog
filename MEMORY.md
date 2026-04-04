# MEMORY.md — Long-Term Memory

## Who I'm Helping
- **Name:** Ethan Heinrick
- **Email:** ethanheinrick01@gmail.com
- **App:** Gratuitize Me (formerly TipLog)
- **Context:** Works at Mike Anderson's Seafood in Baton Rouge, building an iOS tip tracking app for his coworkers

## Current Project — Gratuitize Me (TipLog)
**Location:** `/Users/ethanheinrick/Desktop/tiplog`
**Supabase Project:** `gcvnkfxmdqvusnkwczrt` (Baton Rouge, LA region)
**Web:** `https://tiplog-zeta.vercel.app`
**GitHub:** `https://github.com/ethanheinrick01-ctrl/TipLog` (branch: `main`)

---

## Session Log — 2026-04-04

### Morning Build (pre-session)
- App renamed from "TipLog" → "Gratuitize Me"
- Category-specific tip-outs built (oyster, bar, busser, expo, host, foodRunner, support, other)
- `tipOutByCategory` stored as JSONB in Supabase
- Web deployment bugs fixed (Zustand infinite loop, SecureStore/web persistSession, sync on load)

### Afternoon Build (this session)

**Receipt OCR / GPT-4o scanning:**
- Added `app/shift/import.tsx` — unified import screen for both cashouts and schedules
- Toggle at top: 💰 Cashout | 📅 Schedule — changes hint text and process button
- Green camera button on home screen opens import screen
- Camera + Gallery buttons pick images with `base64: true` (avoids web file:// fetch CORS)
- `lib/receiptImport.ts` — `SupabaseOcrAdapter` calls edge function via direct REST fetch (not `supabase.functions.invoke` — that caused auth refresh infinite loops)
- **Bug fixes:** `require()` in component → proper hook import; `file://` URIs can't be fetched on web → picker returns raw base64

**HotSchedules schedule import:**
- Edge function `parse-schedule` deployed — GPT-4o-mini extracts shifts (date, clockIn, clockOut, position)
- `supabase/functions/parse-schedule/index.ts` — deployed, live
- `supabase/functions/ocr-receipt/index.ts` — deployed, live
- UI toggle built, full schedule → shift creation flow still needs wiring (Claude Code tasked)

**Database:**
- `ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS "tipOutByCategory" jsonb...` — may need running for coworkers
- RLS on `users` table fixed — users only see their own data

**User account:** ethanheinrick01@gmail.com / Sminogrigio@222

**Supabase Personal Access Token:** `sbp_REDACTED` (stored in openclaw config, used for `npx supabase functions deploy`)

**OpenAI API Key:** `sk-proj-REDACTED

---

## Git Commits Today (2026-04-04)
- `d8be7e9` — Add category-specific tip-outs
- `0edbcea` — Fix web to pull from Supabase on load
- `be178c3` — Fix Zustand selector infinite loop (useShallow)
- `e23870e` — Fix session persistence on web, simplify selectors
- `0fb6a4c` — feat: GPT-4o Toast receipt scanning — wire live OCR edge function
- `aaa2e0d` — fix(import): cap multi-select at 3 images
- `08815d1` — fix(import): require() → useAuthStore() hook to prevent infinite loop
- `c6b0d12` — fix(receiptImport): direct REST fetch to edge function — bypasses auth refresh loop on web
- `589618b` — feat: HotSchedules schedule import + gpt-4o-mini swap
- `52413eb` — feat: add parse-schedule edge function for HotSchedules import
- `9741fb1` — fix: base64 picker mode + skip fetch when URI is already base64 — eliminates web file:// CORS crash
- `6508bfb` — feat: unified import — Cashout/Schedule toggle with distinct hint copy

---

## Pending / Known Issues
1. **🚨 SECURITY: `.env` committed to git** — Supabase anon/service keys publicly exposed. Rotate at: https://supabase.com/dashboard/project/gcvnkfxmdqvusnkwczrt/settings/api
2. **`ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS "tipOutByCategory" jsonb...`** — run in Supabase SQL editor if coworkers have existing DBs without this column
3. **Apple Developer account locked** — was pending; check if resolved
4. **HotSchedules UI wiring incomplete** — toggle and hint text done; schedule mode → parse → save shifts flow still needs building

---

## Key Files
| File | Purpose |
|------|---------|
| `app/shift/import.tsx` | Unified Cashout/Schedule import screen |
| `lib/receiptImport.ts` | `SupabaseOcrAdapter` — direct REST to GPT-4o edge function |
| `supabase/functions/ocr-receipt/index.ts` | GPT-4o Toast washout slip parser |
| `supabase/functions/parse-schedule/index.ts` | GPT-4o-mini HotSchedules shift extractor |
| `components/ShiftForm.tsx` | Tip-out category UI fields |
| `lib/calculations.ts` | `computeShift()` with category totals |
| `lib/db.ts` | `rowToShift()` parses JSON `tipOutByCategory` |
| `lib/sync.ts` | Pulls from Supabase on web load |
| `store/shiftStore.ts` | Zustand store — `pendingShift` field for OCR pre-fill |
| `app/_layout.tsx` | Route for `/shift/import` |
| `app/(tabs)/index.tsx` | Green camera button + schedule button in header |
| `supabase_schema.sql` | DB schema |

---

## Supabase Edge Functions
- `ocr-receipt` — GPT-4o, Toast washout slip → structured JSON (tips, sales, tip-outs)
- `parse-schedule` — GPT-4o-mini, HotSchedules screenshot → array of shifts (date, clockIn, clockOut, position)
- Both use `OPENAI_API_KEY` secret set in Supabase dashboard
- Both deployed via: `SUPABASE_ACCESS_TOKEN=sbp_REDACTED-ref gcvnkfxmdqvusnkwczrt`

## Coworker Setup
- Web app: https://tiplog-zeta.vercel.app
- Install Expo Go → scan QR from `npx expo start --tunnel` OR use web URL directly
- Use `CO-WORKER-SETUP.md` in the tiplog repo for instructions
