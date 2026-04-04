import { supabase } from './supabase';
import {
  getUnsyncedShifts,
  markShiftSynced,
  upsertShift,
  getJobs,
  upsertJob,
} from './db';
import { Shift, Job } from './types';

/**
 * Push unsynced local shifts to Supabase, pull remote changes.
 */
export async function syncAll(userId: string): Promise<void> {
  await pushShifts(userId);
  await pullShifts(userId);
  await syncJobs(userId);
}

async function pushShifts(userId: string): Promise<void> {
  const unsynced = getUnsyncedShifts(userId);
  if (!unsynced.length) return;

  for (const shift of unsynced) {
    const { expenses, ...shiftRow } = shift;

    const { error: shiftErr } = await supabase
      .from('shifts')
      .upsert(shiftRow, { onConflict: 'id' });

    if (shiftErr) {
      console.warn('Sync push shift error:', shiftErr.message);
      continue;
    }

    if (expenses.length) {
      const { error: expErr } = await supabase
        .from('expenses')
        .upsert(expenses, { onConflict: 'id' });

      if (expErr) {
        console.warn('Sync push expense error:', expErr.message);
        continue;
      }
    }

    markShiftSynced(shift.id);
  }
}

async function pullShifts(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('shifts')
    .select('*, expenses(*)')
    .eq('userId', userId)
    .order('date', { ascending: false });

  if (error || !data) return;

  for (const row of data) {
    // Parse tipOutByCategory from Supabase JSONB (comes as object, not string)
    let tipOutByCategory: Record<string, number> = {};
    if (row.tipOutByCategory) {
      tipOutByCategory = typeof row.tipOutByCategory === 'string'
        ? JSON.parse(row.tipOutByCategory)
        : row.tipOutByCategory;
    }

    const shift: Shift = {
      ...row,
      tipOutByCategory,
      expenses: row.expenses ?? [],
      synced: true,
    };
    upsertShift(shift);
  }
}

async function syncJobs(userId: string): Promise<void> {
  const localJobs = getJobs();

  // Push local jobs that may not be on server
  if (localJobs.length) {
    await supabase.from('jobs').upsert(localJobs, { onConflict: 'id' });
  }

  // Pull remote jobs
  const { data } = await supabase.from('jobs').select('*');
  if (data) {
    for (const job of data as Job[]) {
      upsertJob(job);
    }
  }
}
