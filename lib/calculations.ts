import { Shift, PeriodSummary, Expense } from './types';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isWithinInterval,
  parseISO,
  addDays,
  subDays,
  differenceInCalendarDays,
  getDay,
  getDaysInMonth,
  format,
} from 'date-fns';

// ─── Pay Period ────────────────────────────────────────────────────────────

/** Default anchor: March 26 2026 (confirmed Thursday, pay period start) */
export const DEFAULT_PAY_PERIOD_ANCHOR = '2026-03-26';

export interface PayPeriod {
  start: Date;
  end: Date;   // inclusive — the Wednesday before the next Thursday
  label: string;
}

/**
 * Given an anchor Thursday and a reference date, returns the
 * pay period (start–end) that contains the reference date.
 *
 * Pay periods are exactly 14 days: Thu → Wed.
 */
export function getPayPeriodForDate(
  anchorStr: string,
  referenceDate: Date = new Date(),
): PayPeriod {
  const anchor = parseISO(anchorStr);

  // How many days from anchor to referenceDate
  const diff = differenceInCalendarDays(referenceDate, anchor);

  // Which 14-day cycle are we in? (can be negative for dates before anchor)
  const cycleIndex = Math.floor(diff / 14);

  const start = addDays(anchor, cycleIndex * 14);
  const end = addDays(start, 13); // 14 days inclusive (Thu → Wed)

  return {
    start,
    end,
    label: `${format(start, 'MMM d')} – ${format(end, 'MMM d')}`,
  };
}

/** Returns the previous pay period relative to the one containing referenceDate. */
export function getPreviousPayPeriod(anchorStr: string, referenceDate: Date = new Date()): PayPeriod {
  const current = getPayPeriodForDate(anchorStr, referenceDate);
  return getPayPeriodForDate(anchorStr, subDays(current.start, 1));
}

/** Returns all pay periods in a given calendar year, ordered ascending. */
export function getPayPeriodsInYear(anchorStr: string, year: number): PayPeriod[] {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const periods: PayPeriod[] = [];
  let cursor = yearStart;
  while (cursor <= yearEnd) {
    const pp = getPayPeriodForDate(anchorStr, cursor);
    const last = periods[periods.length - 1];
    if (!last || last.start.getTime() !== pp.start.getTime()) {
      periods.push(pp);
    }
    cursor = addDays(pp.end, 1);
  }
  return periods;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface DayForecast {
  dayName: string;
  avgEarnings: number;
  avgTips: number;
  avgHours: number;
  shiftCount: number;
}

export interface Forecast {
  byDayOfWeek: DayForecast[];
  projectedMonthly: number;
  projectedWeekly: number;
  bestDay: DayForecast;
  worstDay: DayForecast;
  avgPerShift: number;
  shiftsPerWeek: number;
}

/**
 * Generate a forecast from the last 90 days of shift history.
 */
export function buildForecast(shifts: Shift[]): Forecast | null {
  const cutoff = subDays(new Date(), 90);
  const recent = shifts.filter((s) => parseISO(s.date) >= cutoff);

  if (recent.length < 3) return null;

  // Group by day of week (0=Sun … 6=Sat)
  const buckets: Shift[][] = Array.from({ length: 7 }, () => []);
  for (const s of recent) {
    const dow = getDay(parseISO(s.date));
    buckets[dow].push(s);
  }

  const byDayOfWeek: DayForecast[] = buckets.map((bucket, i) => {
    if (!bucket.length) {
      return { dayName: DAY_NAMES[i], avgEarnings: 0, avgTips: 0, avgHours: 0, shiftCount: 0 };
    }
    return {
      dayName: DAY_NAMES[i],
      avgEarnings: bucket.reduce((s, sh) => s + sh.grossEarnings, 0) / bucket.length,
      avgTips: bucket.reduce((s, sh) => s + sh.tipsTotal, 0) / bucket.length,
      avgHours: bucket.reduce((s, sh) => s + sh.hours, 0) / bucket.length,
      shiftCount: bucket.length,
    };
  });

  // Estimate shifts per week from 90-day window (~13 weeks)
  const weeks = 90 / 7;
  const shiftsPerWeek = recent.length / weeks;
  const avgPerShift = recent.reduce((s, sh) => s + sh.grossEarnings, 0) / recent.length;

  const projectedWeekly = shiftsPerWeek * avgPerShift;
  const projectedMonthly = projectedWeekly * (getDaysInMonth(new Date()) / 7);

  const activeDays = byDayOfWeek.filter((d) => d.shiftCount > 0);
  const sorted = [...activeDays].sort((a, b) => b.avgEarnings - a.avgEarnings);

  return {
    byDayOfWeek,
    projectedMonthly,
    projectedWeekly,
    bestDay: sorted[0],
    worstDay: sorted[sorted.length - 1],
    avgPerShift,
    shiftsPerWeek,
  };
}

// Default tip-out categories
export const DEFAULT_TIP_OUT_CATEGORIES = [
  'oyster',
  'bar',
  'busser',
  'expo',
  'host',
  'foodRunner',
  'support',
];

/**
 * Compute derived fields for a shift before saving.
 * 
 * Handles both new tipOutByCategory format and legacy tipOut for backward compatibility.
 */
export function computeShift(raw: Partial<Shift>): Partial<Shift> {
  const cash = raw.tipsCash ?? 0;
  const credit = raw.tipsCredit ?? 0;
  const tipsTotal = cash + credit;

  const sales = raw.sales ?? 0;
  const tipPercent = sales > 0 ? (tipsTotal / sales) * 100 : 0;

  const covers = raw.covers ?? 0;
  const salesPerCover = covers > 0 ? sales / covers : 0;

  // Handle tipOutByCategory - compute total from categories or fall back to legacy tipOut
  const tipOutByCategory = raw.tipOutByCategory ?? {};
  const totalTipOut = Object.values(tipOutByCategory).reduce((a, b) => a + b, 0);
  
  // Backward compatibility: if tipOutByCategory is empty/invalid but tipOut exists, use that
  const effectiveTipOut = totalTipOut > 0 ? totalTipOut : (raw.tipOut ?? 0);
  
  const tipsWithheld = Math.min(raw.tipsWithheld ?? 0, credit); // can't exceed credit tips
  const tipIn = raw.tipIn ?? 0;
  // Formula: (credit tips after 3% tax) + (cash tips after tip-out) + tip-in
  const netTips = (credit - tipsWithheld) + cash - effectiveTipOut + tipIn;

  const wage = raw.wage ?? 0;
  const hours = computeHours(raw.clockIn, raw.clockOut);
  const serviceCharge = raw.serviceCharge ?? 0;
  const grossEarnings = netTips + wage * hours + serviceCharge;

  return {
    ...raw,
    tipOutByCategory,
    tipsTotal,
    tipPercent,
    salesPerCover,
    tipOut: effectiveTipOut, // Keep for backward compatibility
    netTips,
    hours,
    grossEarnings,
  };
}

function computeHours(clockIn?: string, clockOut?: string): number {
  if (!clockIn || !clockOut) return 0;
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  const inMinutes = inH * 60 + inM;
  let outMinutes = outH * 60 + outM;
  if (outMinutes <= inMinutes) outMinutes += 24 * 60; // overnight
  return Math.round(((outMinutes - inMinutes) / 60) * 100) / 100;
}

export function expenseTotal(expenses: Expense[]): number {
  return expenses.reduce((s, e) => s + e.amount, 0);
}

export function summarizeShifts(shifts: Shift[]): PeriodSummary {
  const s: PeriodSummary = {
    label: '',
    tipsTotal: 0,
    tipsCash: 0,
    tipsCredit: 0,
    netTips: 0,
    grossEarnings: 0,
    hours: 0,
    hourlyAvg: 0,
    tipPercent: 0,
    sales: 0,
    covers: 0,
    shifts: shifts.length,
    tipOut: 0,
    tipIn: 0,
    serviceCharge: 0,
    mileage: 0,
    expenseTotal: 0,
  };

  for (const shift of shifts) {
    s.tipsTotal += shift.tipsTotal;
    s.tipsCash += shift.tipsCash;
    s.tipsCredit += shift.tipsCredit;
    s.netTips += shift.netTips;
    s.grossEarnings += shift.grossEarnings;
    s.hours += shift.hours;
    s.sales += shift.sales;
    s.covers += shift.covers;
    // shift.tipOut is already the authoritative total (set by computeShift from categories)
    s.tipOut += shift.tipOut;
    s.tipIn += shift.tipIn;
    s.serviceCharge += shift.serviceCharge;
    s.mileage += shift.mileage;
    s.expenseTotal += expenseTotal(shift.expenses);
  }

  s.hourlyAvg = s.hours > 0 ? s.grossEarnings / s.hours : 0;
  s.tipPercent = s.sales > 0 ? (s.tipsTotal / s.sales) * 100 : 0;

  return s;
}

export function getShiftsInPeriod(
  shifts: Shift[],
  period: 'week' | 'month' | 'year',
  referenceDate: Date = new Date(),
  weekStartsOn: 0 | 1 = 1,
): Shift[] {
  let start: Date, end: Date;

  if (period === 'week') {
    start = startOfWeek(referenceDate, { weekStartsOn });
    end = endOfWeek(referenceDate, { weekStartsOn });
  } else if (period === 'month') {
    start = startOfMonth(referenceDate);
    end = endOfMonth(referenceDate);
  } else {
    start = startOfYear(referenceDate);
    end = endOfYear(referenceDate);
  }

  return shifts.filter((s) =>
    isWithinInterval(parseISO(s.date), { start, end }),
  );
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function fmtPct(n: number): string {
  return n.toFixed(1) + '%';
}

/** Convert 24h "HH:MM" to 12h "h:MM AM/PM". Returns original string if not parseable. */
export function fmt12h(time: string): string {
  if (!time) return time;
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return time;
  const h = parseInt(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 || 12; // 0→12 (midnight), 12→12 (noon), 13→1, etc.
  return `${display}:${min} ${ampm}`;
}
