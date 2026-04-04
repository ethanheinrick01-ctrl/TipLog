export interface Job {
  id: string;
  name: string;
  color: string;
  position: string; // e.g. "Server", "Bartender", "Trainer"
  defaultWage: number;
  createdAt: string;
}

export interface Expense {
  id: string;
  shiftId: string;
  category: string;
  amount: number;
  taxDeductible: boolean;
  note?: string;
}

export interface Shift {
  id: string;
  userId: string;
  jobId: string;
  date: string;           // YYYY-MM-DD
  clockIn: string;        // HH:MM (24h)
  clockOut: string;       // HH:MM (24h)
  hours: number;          // computed

  // Tips
  tipsCash: number;
  tipsCredit: number;
  tipsTotal: number;      // computed

  // Sales
  sales: number;
  tipPercent: number;     // computed: tipsTotal / sales

  // Covers
  covers: number;
  salesPerCover: number;  // computed

  // Tip flow
  tipOut: number;
  tipOutByCategory: Record<string, number>; // e.g. { oyster: 20, bar: 15, busser: 10, expo: 5, host: 5 }
  tipIn: number;
  netTips: number;        // computed: tipsTotal - sum(tipOutByCategory) + tipIn

  // Wage
  wage: number;
  serviceCharge: number;
  mileage: number;

  // Take-home
  grossEarnings: number;  // computed: netTips + (wage * hours) + serviceCharge

  expenses: Expense[];
  notes: string;

  createdAt: string;
  updatedAt: string;
  synced: boolean;
}

export interface Goal {
  id: string;
  userId: string;
  label: string;
  field: GoalField;
  period: 'daily' | 'weekly' | 'monthly';
  target: number;
  createdAt: string;
}

export type GoalField =
  | 'tipsTotal'
  | 'netTips'
  | 'grossEarnings'
  | 'tipPercent'
  | 'hours'
  | 'sales'
  | 'covers';

export interface User {
  id: string;
  email: string;
  name: string;
  defaultJobId?: string;
  payWeekStart: number;       // 0=Sun … 6=Sat (used for weekly view)
  payPeriodAnchor: string;    // YYYY-MM-DD — a known pay period START Thursday
  reminderTime?: string;      // HH:MM
  reminderEnabled: boolean;
}

export type Period = 'day' | 'week' | 'biweek' | 'month' | 'year' | 'custom';

export interface PeriodSummary {
  label: string;
  tipsTotal: number;
  tipsCash: number;
  tipsCredit: number;
  netTips: number;
  grossEarnings: number;
  hours: number;
  hourlyAvg: number;
  tipPercent: number;
  sales: number;
  covers: number;
  shifts: number;
  tipOut: number;
  tipIn: number;
  serviceCharge: number;
  mileage: number;
  expenseTotal: number;
}
