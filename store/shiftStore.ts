import { create } from 'zustand';
import { Shift, Job, Goal } from '../lib/types';
import * as db from '../lib/db';
import { deleteShift as dbDeleteShift, upsertShift as dbUpsertShift, getShift as dbGetShift, getShifts as dbGetShifts, queueDelete } from '../lib/db';
import { computeShift } from '../lib/calculations';
import { syncAll } from '../lib/sync';
import { supabase } from '../lib/supabase';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

interface ShiftState {
  shifts: Shift[];
  jobs: Job[];
  goals: Goal[];
  syncing: boolean;
  /** Pre-fill data from OCR import — cleared after new.tsx reads it */
  pendingShift: Partial<Shift> | null;

  setPendingShift: (s: Partial<Shift> | null) => void;

  loadAll: (userId: string) => void;
  saveShift: (userId: string, partial: Partial<Shift>) => void;
  deleteShift: (id: string) => void;

  saveJob: (job: Job) => void;
  deleteJob: (id: string) => void;

  saveGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;

  sync: (userId: string) => Promise<void>;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  shifts: [],
  jobs: [],
  goals: [],
  syncing: false,
  pendingShift: null,

  setPendingShift: (s) => set({ pendingShift: s }),

  loadAll: async (userId) => {
    if (Platform.OS === 'web') {
      // On web, syncAll pulls from Supabase into webShifts Map — do this eagerly
      await syncAll(userId);
      set({ shifts: dbGetShifts(userId), jobs: db.getJobs(), goals: db.getGoals(userId) });
    } else {
      const shifts = db.getShifts(userId);
      const jobs = db.getJobs();
      const goals = db.getGoals(userId);
      set({ shifts, jobs, goals });
    }
  },

  saveShift: (userId, partial) => {
    const now = new Date().toISOString();
    const existing = partial.id ? dbGetShift(partial.id) : null;

    const computed = computeShift({
      ...existing,
      ...partial,
      id: partial.id ?? randomUUID(),
      userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      synced: false,
      expenses: partial.expenses ?? existing?.expenses ?? [],
    }) as Shift;

    dbUpsertShift(computed);
    set({ shifts: dbGetShifts(userId) });
  },

  deleteShift: async (id) => {
    // Get userId before deleting from local store
    const state = useShiftStore.getState();
    const userId = state.shifts.find((s) => s.id === id)?.userId ?? '';
    // Delete locally first so UI responds immediately
    dbDeleteShift(id);
    set({ shifts: dbGetShifts(userId) });

    if (Platform.OS === 'web') {
      // Web has no SQLite — fire-and-forget is acceptable, Supabase is source of truth
      supabase.from('shifts').delete().eq('id', id).then(({ error }) => {
        if (error) console.warn('Supabase delete error (web):', error.message);
      });
    } else {
      // Queue the Supabase delete durably, then kick off a background sync
      // so the delete reaches Supabase immediately without waiting for the user to tap Sync
      queueDelete(id);
      if (userId) {
        syncAll(userId).catch((e) => console.warn('Post-delete sync error:', e));
      }
    }
  },

  saveJob: (job) => {
    db.upsertJob(job);
    set({ jobs: db.getJobs() });
  },

  deleteJob: (id) => {
    db.deleteJob(id);
    set((state) => ({ jobs: state.jobs.filter((j) => j.id !== id) }));
  },

  saveGoal: (goal) => {
    db.upsertGoal(goal);
    set((state) => ({
      goals: [goal, ...state.goals.filter((g) => g.id !== goal.id)],
    }));
  },

  deleteGoal: (id) => {
    db.deleteGoal(id);
    set((state) => ({ goals: state.goals.filter((g) => g.id !== id) }));
  },

  sync: async (userId) => {
    set({ syncing: true });
    try {
      await syncAll(userId);
      set({ shifts: db.getShifts(userId), jobs: db.getJobs() });
    } finally {
      set({ syncing: false });
    }
  },
}));
