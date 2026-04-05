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

## Session Log — 2026-04-04 (FULL DAY)

### Morning Build
- App renamed from "TipLog" → "Gratuitize Me"
- Category-specific tip-outs built (oyster, bar, busser, expo, host, foodRunner, support, other)
- `tipOutByCategory` stored as JSONB in Supabase
- Web deployment bugs fixed (Zustand infinite loop, SecureStore/web persistSession, sync on load)
- RLS on `users` table fixed

### Afternoon/Evening Build (this session)

**Receipt OCR — Cashout scanning:**
- `app/shift/import.tsx` — unified import screen with 💰 Cashout | 📅 Schedule toggle
- Camera + Gallery buttons pick up to 3 images with `base64: true` (avoids web file:// CORS)
- `lib/receiptImport.ts` — `SupabaseOcrAdapter` calls edge function via direct REST fetch
- Cash tips editable after scan — Toast doesn't capture cash, user types manually
- Tip-out breakdown editable after scan — "Edit" button expands all 9 categories as input fields
- Success alert confirms save
- `parse-schedule` edge function deployed — GPT-4o-mini, HotSchedules → shifts

**All button bugs fixed:**
- `require()` → proper `useAuthStore()` hook (was causing max stack overflow)
- `supabase.functions.invoke` → direct REST fetch (was causing auth refresh infinite loops)
- `db` (SQLite) is `null` on web — store now uses aliased function imports with `isWeb` guards
- All `saveShift` calls now `await`ed before navigation
- `loadAll` on web now awaits `syncAll` before rendering (fixed "Shift not found" on refresh)
- Delete uses `setTimeout` before `router.back()` so delete settles first

**OCR prompt fix (2026-04-05 ~02:00):**
- Added 3 real examples from Ethan's actual slips showing how to read TIP SHARING section
- Bar is frequently misread — prompt now explicitly shows the dollar column extraction and examples where bar = $47.55
- Key rule: extract dollar amounts DIRECTLY from the rightmost column, don't recompute

**User account:** ethanheinrick01@gmail.com / Sminogrigio@222

**Supabase Personal Access Token:** `sbp_REDACTED`

**OpenAI API Key:** `sk-proj-REDACTED` — set as Supabase secret

---

## Git Commits (2026-04-04)
- `d8be7e9` — Add category-specific tip-outs
- `0edbcea` — Fix web to pull from Supabase on load
- `be178c3` — Fix Zustand selector infinite loop (useShallow)
- `e23870e` — Fix session persistence on web, simplify selectors
- `0fb6a4c` — feat: GPT-4o Toast receipt scanning — wire live OCR edge function
- `aaa2e0d` — fix(import): cap multi-select at 3 images
- `08815d1` — fix(import): require() → useAuthStore() hook to prevent infinite loop
- `c6b0d12` — fix(receiptImport): direct REST fetch to edge function — bypasses auth refresh loop
- `589618b` — feat: HotSchedules schedule import + gpt-4o-mini swap
- `52413eb` — feat: add parse-schedule edge function
- `9741fb1` — fix: base64 picker mode — eliminates web file:// CORS crash
- `6508bfb` — feat: unified import — Cashout/Schedule toggle with distinct hint copy
- `ac88081` — feat: cash tips editable field after OCR scan
- `7162819` — fix: navigate via useEffect instead of Alert callback
- `a382324` — feat: editable tip-out breakdown after OCR scan
- `51d4e86` — fix: aliased db function imports — null db on web fixed
- `02b7ab5` — fix: await loadAll on web before render — "Shift not found" on refresh fixed

---

## Pending / Known Issues
1. **🚨 SECURITY: `.env` committed to git** — Supabase anon/service keys publicly exposed. Rotate at: https://supabase.com/dashboard/project/gcvnkfxmdqvusnkwczrt/settings/api
2. **`ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS "tipOutByCategory" jsonb...`** — run in Supabase SQL editor if coworkers have existing DBs without this column
3. **Apple Developer account locked** — was pending; check if resolved
4. **Duplicate test shifts** — some locally-created test shifts exist with IDs not synced to Supabase. Delete from the UI or Settings.

---

## Key Files
| File | Purpose |
|------|---------|
| `app/shift/import.tsx` | Unified Cashout/Schedule import — cash tips + tip-out editors |
| `lib/receiptImport.ts` | REST fetch to ocr-receipt edge function |
| `lib/scheduleImport.ts` | REST fetch to parse-schedule edge function |
| `supabase/functions/ocr-receipt/index.ts` | GPT-4o — Toast slip → structured JSON (with real slip examples) |
| `supabase/functions/parse-schedule/index.ts` | GPT-4o-mini — HotSchedules → shifts array |
| `store/shiftStore.ts` | Zustand store — db function aliases, web-safe `saveShift`/`loadAll` |
| `app/_layout.tsx` | `loadAll` awaited on mount before render |
| `components/ShiftForm.tsx` | All shift entry fields + editable tip-outs |

---

## Supabase Edge Functions (deployed)
- `ocr-receipt` — GPT-4o, Toast washout slip → structured JSON (tips, sales, tip-outs by category)
- `parse-schedule` — GPT-4o-mini, HotSchedules screenshot → shifts (date, clockIn, clockOut, position)
- Deploy: `SUPABASE_ACCESS_TOKEN=sbp_REDACTED npx supabase functions deploy <name> --project-ref gcvnkfxmdqvusnkwczrt`

## Coworker Setup
- Web app: https://tiplog-zeta.vercel.app
- Install Expo Go → scan QR from `npx expo start --tunnel` OR use web URL directly
- Use `CO-WORKER-SETUP.md` in the tiplog repo
