import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { Shift, Job, Goal, Expense } from './types';

const isWeb = Platform.OS === 'web';
const db = isWeb ? null : SQLite.openDatabaseSync('tiplog.db');

// Web fallback (in-memory, non-persistent)
const webJobs = new Map<string, Job>();
const webShifts = new Map<string, Shift>();
const webGoals = new Map<string, Goal>();

export function initDB() {
  if (isWeb || !db) return;

  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#F5A623',
      position TEXT NOT NULL DEFAULT 'Server',
      defaultWage REAL NOT NULL DEFAULT 2.13,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      jobId TEXT NOT NULL,
      date TEXT NOT NULL,
      clockIn TEXT NOT NULL DEFAULT '00:00',
      clockOut TEXT NOT NULL DEFAULT '00:00',
      hours REAL NOT NULL DEFAULT 0,
      tipsCash REAL NOT NULL DEFAULT 0,
      tipsCredit REAL NOT NULL DEFAULT 0,
      tipsTotal REAL NOT NULL DEFAULT 0,
      sales REAL NOT NULL DEFAULT 0,
      tipPercent REAL NOT NULL DEFAULT 0,
      covers INTEGER NOT NULL DEFAULT 0,
      salesPerCover REAL NOT NULL DEFAULT 0,
      tipOut REAL NOT NULL DEFAULT 0,
      tipOutByCategory TEXT NOT NULL DEFAULT '{}',
      tipIn REAL NOT NULL DEFAULT 0,
      netTips REAL NOT NULL DEFAULT 0,
      wage REAL NOT NULL DEFAULT 0,
      serviceCharge REAL NOT NULL DEFAULT 0,
      mileage REAL NOT NULL DEFAULT 0,
      grossEarnings REAL NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      synced INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (jobId) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      shiftId TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      taxDeductible INTEGER NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      FOREIGN KEY (shiftId) REFERENCES shifts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      label TEXT NOT NULL,
      field TEXT NOT NULL,
      period TEXT NOT NULL,
      target REAL NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);
    CREATE INDEX IF NOT EXISTS idx_shifts_jobId ON shifts(jobId);
    CREATE INDEX IF NOT EXISTS idx_shifts_synced ON shifts(synced);
    CREATE INDEX IF NOT EXISTS idx_expenses_shiftId ON expenses(shiftId);
  `);
}

// ─── Jobs ─────────────────────────────────────────────────────────────────

export function getJobs(): Job[] {
  if (isWeb) {
    return Array.from(webJobs.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  return db!.getAllSync<Job>('SELECT * FROM jobs ORDER BY name ASC');
}

export function upsertJob(job: Job): void {
  if (isWeb) {
    webJobs.set(job.id, job);
    return;
  }

  db!.runSync(
    `INSERT OR REPLACE INTO jobs (id, name, color, position, defaultWage, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    job.id, job.name, job.color, job.position, job.defaultWage, job.createdAt,
  );
}

export function deleteJob(id: string): void {
  if (isWeb) {
    webJobs.delete(id);
    return;
  }
  db!.runSync('DELETE FROM jobs WHERE id = ?', id);
}

// ─── Shifts ───────────────────────────────────────────────────────────────

export function getShifts(userId: string): Shift[] {
  if (isWeb) {
    return Array.from(webShifts.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  const rows = db!.getAllSync<any>(
    'SELECT * FROM shifts WHERE userId = ? ORDER BY date DESC',
    userId,
  );
  return rows.map(rowToShift);
}

export function getShiftsByDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): Shift[] {
  if (isWeb) {
    return Array.from(webShifts.values())
      .filter((s) => s.userId === userId && s.date >= startDate && s.date <= endDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  const rows = db!.getAllSync<any>(
    `SELECT * FROM shifts
     WHERE userId = ? AND date >= ? AND date <= ?
     ORDER BY date DESC`,
    userId, startDate, endDate,
  );
  return rows.map(rowToShift);
}

export function getShift(id: string): Shift | null {
  if (isWeb) {
    return webShifts.get(id) ?? null;
  }

  const row = db!.getFirstSync<any>('SELECT * FROM shifts WHERE id = ?', id);
  return row ? rowToShift(row) : null;
}

export function upsertShift(shift: Shift): void {
  const now = new Date().toISOString();
  
  // Serialize tipOutByCategory to JSON string for storage
  const tipOutByCategoryJson = JSON.stringify(shift.tipOutByCategory || {});

  if (isWeb) {
    webShifts.set(shift.id, { ...shift, updatedAt: now });
    return;
  }

  db!.runSync(
    `INSERT OR REPLACE INTO shifts
     (id, userId, jobId, date, clockIn, clockOut, hours,
      tipsCash, tipsCredit, tipsTotal, sales, tipPercent,
      covers, salesPerCover, tipOut, tipOutByCategory, tipIn, netTips,
      wage, serviceCharge, mileage, grossEarnings,
      notes, synced, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    shift.id, shift.userId, shift.jobId, shift.date,
    shift.clockIn, shift.clockOut, shift.hours,
    shift.tipsCash, shift.tipsCredit, shift.tipsTotal,
    shift.sales, shift.tipPercent,
    shift.covers, shift.salesPerCover,
    shift.tipOut, tipOutByCategoryJson, shift.tipIn, shift.netTips,
    shift.wage, shift.serviceCharge, shift.mileage, shift.grossEarnings,
    shift.notes, shift.synced ? 1 : 0,
    shift.createdAt, now,
  );

  // Upsert expenses
  db!.runSync('DELETE FROM expenses WHERE shiftId = ?', shift.id);
  for (const e of shift.expenses) {
    db!.runSync(
      `INSERT INTO expenses (id, shiftId, category, amount, taxDeductible, note)
       VALUES (?, ?, ?, ?, ?, ?)`,
      e.id, e.shiftId, e.category, e.amount, e.taxDeductible ? 1 : 0, e.note ?? '',
    );
  }
}

export function deleteShift(id: string): void {
  if (isWeb) {
    webShifts.delete(id);
    return;
  }
  db!.runSync('DELETE FROM shifts WHERE id = ?', id);
}

export function getUnsyncedShifts(userId: string): Shift[] {
  if (isWeb) {
    return Array.from(webShifts.values()).filter((s) => s.userId === userId && !s.synced);
  }

  const rows = db!.getAllSync<any>(
    'SELECT * FROM shifts WHERE userId = ? AND synced = 0',
    userId,
  );
  return rows.map(rowToShift);
}

export function markShiftSynced(id: string): void {
  if (isWeb) {
    const shift = webShifts.get(id);
    if (shift) {
      webShifts.set(id, { ...shift, synced: true, updatedAt: new Date().toISOString() });
    }
    return;
  }
  db!.runSync('UPDATE shifts SET synced = 1 WHERE id = ?', id);
}

// ─── Goals ────────────────────────────────────────────────────────────────

export function getGoals(userId: string): Goal[] {
  if (isWeb) {
    return Array.from(webGoals.values())
      .filter((g) => g.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return db!.getAllSync<Goal>(
    'SELECT * FROM goals WHERE userId = ? ORDER BY createdAt DESC',
    userId,
  );
}

export function upsertGoal(goal: Goal): void {
  if (isWeb) {
    webGoals.set(goal.id, goal);
    return;
  }

  db!.runSync(
    `INSERT OR REPLACE INTO goals (id, userId, label, field, period, target, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    goal.id, goal.userId, goal.label, goal.field, goal.period, goal.target, goal.createdAt,
  );
}

export function deleteGoal(id: string): void {
  if (isWeb) {
    webGoals.delete(id);
    return;
  }
  db!.runSync('DELETE FROM goals WHERE id = ?', id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function rowToShift(row: any): Shift {
  const expenses = db!.getAllSync<Expense>(
    'SELECT * FROM expenses WHERE shiftId = ?',
    row.id,
  );
  
  // Parse tipOutByCategory from JSON string
  let tipOutByCategory: Record<string, number> = {};
  try {
    tipOutByCategory = row.tipOutByCategory 
      ? JSON.parse(row.tipOutByCategory)
      : {};
  } catch {
    tipOutByCategory = {};
  }
  
  return {
    ...row,
    tipOutByCategory,
    synced: row.synced === 1,
    expenses,
  };
}
