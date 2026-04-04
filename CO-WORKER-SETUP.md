# Gratuitize Me — Coworker Setup Guide

Quick-start instructions for teammates to get TipLog running on their devices.

---

## Option 1: Expo Go (Available Now)

The fastest way to test the app immediately.

### Steps
1. **Install Expo Go** on your iPhone from the App Store
2. **Scan the QR code** from `npx expo start` (run by the developer)
   - OR open the `exp://` link directly in Safari on your iPhone
3. Accept any prompts to "Open in Expo Go"
4. The app will load — you'll need to sign up or log in

### First-Time Login
- Create an account using your email
- You'll be connected to the team's Supabase backend automatically

---

## Option 2: Native iOS Preview Build (Coming Soon)

Once the EAS preview build finishes, you'll get a download link.

### Steps
1. **Open the EAS build link** on your iPhone (Safari works best)
2. **Download the profile** when prompted
3. Go to **Settings → General → VPN & Device Management** on your iPhone
4. Tap the downloaded profile and **trust it**
5. **Install TipLog** from the App Store (or it may install automatically)
6. Open TipLog — you may see a "Trust Developer" prompt
   - Go to **Settings → General → Device Management** → trust the developer
7. Launch the app and log in

### Troubleshooting: Trust Prompts
If the app won't open or shows untrusted developer warnings:
- **iOS 16+**: Settings → General → VPN & Device Management → trust "Apple Development"
- Still stuck? Ask the developer — you may need to re-download the profile

---

## Known Limitations (Tonight)

These features are not yet available:

- **Offline mode**: App requires active internet to sync data
- **Push notifications**: Not configured yet — no alerts for shifts or reminders
- **Background data**: App must be open to sync with Supabase

Expected to improve over the next few updates.

---

## Updating TipLog Later

### OTA Updates (For Native Builds)

When the developer pushes a fix or new feature:

```bash
# Developer runs this:
eas update --branch preview --message "Fix for login bug"
```

Coworkers: **Just reopen the app** — updates download automatically on launch.

### When to Reinstall

You'll need a **fresh install** (delete the app and re-download) when:
- The bundle identifier changes (rare)
- You're switching from Expo Go to the native build
- The developer tells you "new build required"

---

## Need Help?

1. Check you're on Wi-Fi or have cell data
2. Make sure you're signed into the same account you created on TipLog
3. Ask in the team chat — someone can help debug

---

_Last updated: 2026-04-04_

---

## Database Schema Updates (April 2024)

If you have an existing database, you'll need to add the new tip-out categories column. Run this in your Supabase SQL editor:

```sql
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS "tipOutByCategory" jsonb not null default '{}';
```

This enables category-specific tip-outs (oyster, bar, busser, expo, host, foodRunner, support).