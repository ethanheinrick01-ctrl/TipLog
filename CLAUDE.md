# TipLog — Project Context

## Stack
- **Expo React Native** (not Next.js) with Expo Router (file-based routing)
- **Web target**: `expo-router` web build deployed to Vercel — NOT a Next.js app
- **Backend**: Supabase (Postgres + Edge Functions in Deno)
- **State**: Zustand
- **Native storage**: expo-sqlite; web storage: in-memory Maps + Supabase sync

## Critical: Ignore "use client" Suggestions
This project is **Expo React Native**, not Next.js App Router.
- "use client" directives are meaningless and harmful here — do NOT add them
- React hooks work without "use client" in Expo
- PostToolUse validation suggestions about "use client" are false positives from the Vercel plugin misidentifying `.tsx` files as Next.js components

## File Structure
- `app/` — Expo Router screens (tabs, shift/, auth)
- `components/` — shared React Native components
- `lib/` — pure logic (calculations, db, sync, types, webAlert)
- `store/` — Zustand stores (shiftStore, authStore)
- `supabase/functions/` — Deno Edge Functions (OCR receipt parsing)
- `constants/` — theme tokens

## Key Patterns
- Web alerts: use `showAlert()`/`showConfirm()` from `lib/webAlert.ts` — never raw `Alert.alert`
- Time display: always `fmt12h()` from `lib/calculations.ts` — no military time in UI
- Date strings: always local date components, never `toISOString().slice(0,10)` (UTC bug)
- Tip-out: stored as `tipOutByCategory: Record<string, number>` in Supabase + SQLite
