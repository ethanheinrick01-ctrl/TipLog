import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { format, parseISO } from 'date-fns';
import { Shift, Job } from './types';
import { fmt } from './calculations';

const CSV_HEADERS = [
  'Date',
  'Day',
  'Job',
  'Position',
  'Clock In',
  'Clock Out',
  'Hours',
  'Cash Tips',
  'Credit Tips',
  'Total Tips',
  'Sales',
  'Tip %',
  'Covers',
  'Sales/Cover',
  'Tip Out',
  'Tip In',
  'Net Tips',
  'Wage/hr',
  'Wage Earned',
  'Service Charge',
  'Mileage (mi)',
  'Gross Earnings',
  'Expenses',
  'Notes',
];

function escapeCSV(value: string | number): string {
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function exportShiftsToCSV(shifts: Shift[], jobs: Job[]): Promise<void> {
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  const rows = shifts
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => {
      const job = jobMap.get(s.jobId);
      const expTotal = s.expenses.reduce((sum, e) => sum + e.amount, 0);
      const date = parseISO(s.date);

      return [
        format(date, 'MM/dd/yyyy'),
        format(date, 'EEEE'),
        job?.name ?? 'Unknown',
        job?.position ?? '',
        s.clockIn,
        s.clockOut,
        s.hours.toFixed(2),
        s.tipsCash.toFixed(2),
        s.tipsCredit.toFixed(2),
        s.tipsTotal.toFixed(2),
        s.sales.toFixed(2),
        s.tipPercent.toFixed(1) + '%',
        s.covers,
        s.salesPerCover.toFixed(2),
        s.tipOut.toFixed(2),
        s.tipIn.toFixed(2),
        s.netTips.toFixed(2),
        s.wage.toFixed(2),
        (s.wage * s.hours).toFixed(2),
        s.serviceCharge.toFixed(2),
        s.mileage.toFixed(1),
        s.grossEarnings.toFixed(2),
        expTotal.toFixed(2),
        s.notes,
      ].map(escapeCSV).join(',');
    });

  const csv = [CSV_HEADERS.join(','), ...rows].join('\n');
  const fileName = `tiplog_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
  const fileUri = FileSystem.cacheDirectory + fileName;

  await FileSystem.writeAsStringAsync(fileUri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device.');
  }

  await Sharing.shareAsync(fileUri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export TipLog Data',
    UTI: 'public.comma-separated-values-text',
  });
}
