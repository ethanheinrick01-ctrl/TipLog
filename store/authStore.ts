import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { User as AppUser } from '../lib/types';
import { DEFAULT_PAY_PERIOD_ANCHOR } from '../lib/calculations';

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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return error.message;

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
    } else {
      // Email confirmation required — profile created on first sign-in
      set({ session: null });
    }
    return null;
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;

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
