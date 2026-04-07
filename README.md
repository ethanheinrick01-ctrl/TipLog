# Gratuitize Me 💰

**The ultimate tip-tracking companion for shrimp slingin' professionals.**

Built specifically for the high-volume service ecosystem (starting with Mike Anderson's Seafood), **Gratuitize Me** takes the pain out of cashouts and scheduling. No more manual entry, no more guessing your earnings, and no more lost slips.

---

## 🎯 Product Feel (what it’s like to use)

Gratuitize Me is built to feel like a **fast shift-side tool**, not accounting software.

- **Low-friction first:** open app → scan receipt → quick review → save.
- **Money-coach tone:** insights are direct and useful, not fluffy.
- **No spreadsheet vibes:** visual hierarchy surfaces what matters first (today, this pay period, monthly momentum).
- **Forgiving UX:** if OCR misses something, cash tips and tip-outs are always editable before save.

---

## ✨ Features

### 📸 AI-Powered Cashout Scanning
Stop typing in numbers after a long double. Snap a photo of your **Toast washout slip**, and our custom GPT-4o engine extracts:
- Total Sales & Net Sales
- Credit/Debit Tips
- **Detailed Tip-Outs:** Automatically breaks down your tip-outs for the Bar, Busser, Oyster bar, Expo, Host, Food Runner, and Support staff.
- **Auto-Validation:** Review and edit cash tips or tip-out distributions before saving.

### 📅 HotSchedules Integration
Turn a screenshot into a work week. 
- Upload your **HotSchedules** weekly view.
- AI parses your clock-in/out times and positions.
- Bulk-save your entire upcoming schedule directly into your shift log with one tap.

### 📊 Deep Analytics
Understand your income with high-performance charts:
- Track tip percentages over time.
- Compare earnings by day of the week or shift type.
- View total take-home pay after all tip-outs are deducted.
- Pay-period aware summaries (not just calendar-month noise).

### 🧩 Small UX Features That Add Up
- **Recent Activity camera shortcut:** scan a cashout directly from a shift row.
- **Update-in-place import:** if you scan from an existing shift, it updates that shift (no duplicate by default).
- **Cash tips field post-scan:** explicitly editable because Toast doesn’t capture cash.
- **Editable tip-out breakdown:** expand and override category-level tip-outs before save.
- **Support-staff toggles:** quick Yes/No for runner and busser to zero tip-outs when not on shift.
- **Return Home actions in import flow:** easy escape before and after processing.
- **Onboarding guardrails:** first-time users are prompted to set up a job position before import/save flows.
- **Helpful auth prompts:** clear guidance for email verification edge cases when required.

### ☁️ Sync & Offline Support
- **Cloud First:** Powered by Supabase for real-time sync across all your devices.
- **Native & Web:** Use it on iOS or Android via Expo, or access your dashboard from any browser.
- **Durable:** Built with Zustand and persistent storage so your data is safe even if you lose signal mid-shift.

---

## 🛠️ Tech Stack

- **Framework:** [Expo](https://expo.dev/) (React Native)
- **Backend:** [Supabase](https://supabase.com/) (Auth, Database, Edge Functions)
- **AI/LLM:** OpenAI GPT-4o & GPT-4o-mini
- **State Management:** [Zustand](https://github.com/pmndrs/zustand)
- **Charts:** React Native Gifted Charts
- **Styling:** React Native Reanimated + Linear Gradient

---

## 🚀 Getting Started

### Prerequisites
- Node.js & npm
- [Expo Go](https://expo.dev/expo-go) app on your device (for mobile testing)
- A Supabase project

### Installation

1. **Clone the repo:**
   ```bash
   git clone https://github.com/ethanheinrick01-ctrl/TipLog.git
   cd tiplog
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file in the root:
   ```env
   EXPO_PUBLIC_SUPABASE_URL=your_project_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

4. **Run the app:**
   ```bash
   npx expo start
   ```

---

## 🔒 Privacy & Security

Your financial data is personal. Gratuitize Me uses individual Supabase user accounts with Row Level Security (RLS), ensuring that only **you** can see and edit your shifts.

---

## 👨‍💻 Author
**Ethan Heinrick**

Built with ❤️ in Baton Rouge, LA.
