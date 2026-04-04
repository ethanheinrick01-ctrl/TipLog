import { create } from 'zustand';
import { Shift, Job, Goal } from '../lib/types';
import * as db from '../lib/db';
import { computeShift } from '../lib/calculations';
import { syncAll } from '../lib/sync';
import { randomUUID } from 'expo-crypto';

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

  loadAll: (userId) => {
    const shifts = db.getShifts(userId);
    const jobs = db.getJobs();
    const goals = db.getGoals(userId);
    set({ shifts, jobs, goals });
  },

  saveShift: (userId, partial) => {
    const now = new Date().toISOString();
    const existing = partial.id ? db.getShift(partial.id) : null;

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

    db.upsertShift(computed);
    set({ shifts: db.getShifts(userId) });
  },

  deleteShift: (id) => {
    db.deleteShift(id);
    set((state) => ({ shifts: state.shifts.filter((s) => s.id !== id) }));
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
