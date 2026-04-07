import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { User as AppUser } from '../lib/types';
import { DEFAULT_PAY_PERIOD_ANCHOR } from '../lib/calculations';

function formatAuthError(message: string): string {
  const msg = message.toLowerCase();

  if (msg.includes('email rate limit exceeded') || msg.includes('rate limit')) {
    return 'Too many account emails were sent just now. Wait about a minute, then try again (or tap Log In if the account already exists).';
  }

  if (msg.includes('user already registered')) {
    return 'That email already has an account. Tap Log In instead.';
  }

  if (msg.includes('email not confirmed')) {
    return 'Account created, but email is not confirmed yet. Check inbox/spam, then try Log In again.';
  }

  return message;
}

interface AuthState {
  user: AppUser | null;
  session: any | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  setSession: (session: any) => void;
  loadUser: (userId: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,

  signUp: async (email, password, name) => {
    // Guard against repeated "Create Account" taps for existing accounts.
    // If credentials already work (or are pending email confirmation), avoid another signUp email send.
    const existingAttempt = await supabase.auth.signInWithPassword({ email, password });
    if (!existingAttempt.error && existingAttempt.data.session) {
      return await get().signIn(email, password);
    }
    if (existingAttempt.error) {
      const existingMsg = existingAttempt.error.message.toLowerCase();
      if (existingMsg.includes('email not confirmed')) {
        return formatAuthError(existingAttempt.error.message);
      }
      if (!existingMsg.includes('invalid login credentials')) {
        return formatAuthError(existingAttempt.error.message);
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      // If an account already exists, try normal login so users don't get trapped in Sign Up mode.
      if (error.message.toLowerCase().includes('user already registered')) {
        return await get().signIn(email, password);
      }
      return formatAuthError(error.message);
    }

    if (data.session) {
      // Session means email confirmation is not required — insert profile now
      const appUser: AppUser = {
        id: data.user!.id,
        email,
        name,
        payWeekStart: 4,          // Thursday
        payPeriodAnchor: DEFAULT_PAY_PERIOD_ANCHOR,
        reminderEnabled: false,
      };
      const { error: profileErr } = await supabase.from('users').upsert(appUser);
      if (profileErr) console.warn('Profile insert error:', profileErr.message);
      set({ user: appUser, session: data.session });
      return null;
    }

    // Email confirmation required — profile created on first sign-in.
    // Keep user on auth screen with a clear next step.
    set({ session: null });
    return 'Check your email to confirm your account, then tap Log In.';
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return formatAuthError(error.message);

    set({ session: data.session });

    if (data.user) {
      // Try to fetch existing profile
      const { data: userData, error: fetchErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (userData) {
        set({ user: userData });
      } else {
        // First sign-in after email confirmation — create profile
        const appUser: AppUser = {
          id: data.user.id,
          email: data.user.email ?? email,
          name: data.user.user_metadata?.name ?? email.split('@')[0],
          payWeekStart: 4,
          payPeriodAnchor: DEFAULT_PAY_PERIOD_ANCHOR,
          reminderEnabled: false,
        };
        await supabase.from('users').upsert(appUser);
        set({ user: appUser });
      }
    }
    return null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },

  setSession: async (session) => {
    set({ session });
    if (session?.user?.id) {
      await get().loadUser(session.user.id);
    }
    set({ loading: false });
  },

  loadUser: async (userId) => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) set({ user: data });
  },
}));
