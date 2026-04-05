/**
 * ShiftForm — shared by new.tsx and edit/[id].tsx
 * Drives the full shift entry experience including live preview,
 * job picker, all financial fields, expenses, and notes.
 */
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';
import { useShiftStore } from '../store/shiftStore';
import { useAuthStore } from '../store/authStore';
import { computeShift, fmt } from '../lib/calculations';
import { Shift, Expense } from '../lib/types';
import { ExpenseManager } from './ExpenseManager';
import { randomUUID } from 'expo-crypto';

// ─── Tip-out categories & colors ──────────────────────────────────────────
export const TIP_OUT_CATEGORIES = [
  { key: 'oyster', label: 'Oyster' },
  { key: 'bar', label: 'Bar' },
  { key: 'busser', label: 'Busser' },
  { key: 'expo', label: 'Expo' },
  { key: 'host', label: 'Host' },
  { key: 'foodRunner', label: 'Food Runner' },
  { key: 'support', label: 'Support' },
  { key: 'other', label: 'Other' },
];

export const TIP_OUT_COLORS: Record<string, string> = {
  oyster: '#FF6B6B',
  bar: '#4ECDC4',
  busser: '#FFE66D',
  expo: '#95E1D3',
  host: '#F38181',
  foodRunner: '#AA96DA',
  support: '#FCBAD3',
  other: '#AAAAAA',
};

interface Props {
  /** Pass existing shift to pre-fill for edit mode */
  existing?: Shift;
  /** Pre-filled date (YYYY-MM-DD) for new shifts tapped from calendar */
  initialDate?: string;
}

export function ShiftForm({ existing, initialDate }: Props) {
  const router = useRouter();
  const { user } = useAuthStore();
  const { jobs, saveShift } = useShiftStore();

  const defaultJobId = existing?.jobId ?? jobs[0]?.id ?? '';
  const defaultJob = jobs.find((j) => j.id === defaultJobId);

  // Load existing tip-out categories from the shift, or initialize all to 0
  function initCategories(): Record<string, string> {
    const init: Record<string, string> = {};
    for (const cat of TIP_OUT_CATEGORIES) {
      init[cat.key] = existing?.tipOutByCategory?.[cat.key]
        ? String(existing.tipOutByCategory[cat.key])
        : '';
    }
    return init;
  }

  const [date, setDate] = useState(existing?.date ?? initialDate ?? format(new Date(), 'yyyy-MM-dd'));
  const [jobId, setJobId] = useState(defaultJobId);
  const [clockIn, setClockIn] = useState(existing?.clockIn ?? '17:00');
  const [clockOut, setClockOut] = useState(existing?.clockOut ?? '23:00');
  const [tipsCash, setTipsCash] = useState(existing?.tipsCash ? String(existing.tipsCash) : '');
  const [tipsCredit, setTipsCredit] = useState(existing?.tipsCredit ? String(existing.tipsCredit) : '');
  const [sales, setSales] = useState(existing?.sales ? String(existing.sales) : '');
  const [covers, setCovers] = useState(existing?.covers ? String(existing.covers) : '');
  const [tipOutCategories, setTipOutCategories] = useState<Record<string, string>>(initCategories);
  const [tipsWithheld, setTipsWithheld] = useState(existing?.tipsWithheld ? String(existing.tipsWithheld) : '');
  const [tipIn, setTipIn] = useState(existing?.tipIn ? String(existing.tipIn) : '');
  const [wage, setWage] = useState(existing?.wage ? String(existing.wage) : (defaultJob?.defaultWage?.toString() ?? '2.13'));
  const [serviceCharge, setServiceCharge] = useState(existing?.serviceCharge ? String(existing.serviceCharge) : '');
  const [mileage, setMileage] = useState(existing?.mileage ? String(existing.mileage) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [expenses, setExpenses] = useState<Expense[]>(existing?.expenses ?? []);

  const shiftId = existing?.id ?? randomUUID();

  // Build the tipOutByCategory object from state
  const tipOutByCategory: Record<string, number> = {};
  for (const cat of TIP_OUT_CATEGORIES) {
    tipOutByCategory[cat.key] = parseFloat(tipOutCategories[cat.key]) || 0;
  }

  const preview = computeShift({
    tipsCash: parseFloat(tipsCash) || 0,
    tipsCredit: parseFloat(tipsCredit) || 0,
    tipsWithheld: parseFloat(tipsWithheld) || 0,
    sales: parseFloat(sales) || 0,
    covers: parseInt(covers) || 0,
    tipOutByCategory,
    tipIn: parseFloat(tipIn) || 0,
    wage: parseFloat(wage) || 0,
    serviceCharge: parseFloat(serviceCharge) || 0,
    mileage: parseFloat(mileage) || 0,
    clockIn,
    clockOut,
  });

  const totalTipOut = Object.values(tipOutByCategory).reduce((a, b) => a + b, 0);

  function handleCategoryChange(key: string, value: string) {
    setTipOutCategories((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!user?.id) {
      if (Platform.OS === 'web') {
        (window as any).alert('Sign in to save shifts.');
      } else {
        Alert.alert('Not signed in', 'Sign in to save shifts.');
      }
      return;
    }
    if (!jobId) {
      if (Platform.OS === 'web') {
        (window as any).alert('Add a job in Settings first, then come back to save this shift.');
      } else {
        Alert.alert('No Job', 'Add a job in Settings first.');
      }
      return;
    }
    // Block future dates — nothing is certain yet
    const todayLocal = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
    if (date > todayLocal) {
      if (Platform.OS === 'web') {
        (window as any).alert("You can't log shifts for dates that haven't happened yet.");
      } else {
        Alert.alert('Future Date', "You can't log shifts for dates that haven't happened yet.");
      }
      return;
    }

    try {
      await saveShift(user.id, {
        id: existing?.id,
        date,
        jobId,
        clockIn,
        clockOut,
        tipsCash: parseFloat(tipsCash) || 0,
        tipsCredit: parseFloat(tipsCredit) || 0,
        tipsWithheld: parseFloat(tipsWithheld) || 0,
        sales: parseFloat(sales) || 0,
        covers: parseInt(covers) || 0,
        tipOutByCategory,
        tipIn: parseFloat(tipIn) || 0,
        wage: parseFloat(wage) || 0,
        serviceCharge: parseFloat(serviceCharge) || 0,
        mileage: parseFloat(mileage) || 0,
        notes,
        expenses: expenses.map((e) => ({ ...e, shiftId })),
      });
      router.back();
    } catch (e: any) {
      if (Platform.OS === 'web') {
        (window as any).alert('Save failed: ' + (e.message ?? 'Unknown error'));
      } else {
        Alert.alert('Save failed', e.message ?? 'Unknown error');
      }
    }
  }

  const isEdit = !!existing;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Live preview card */}
        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Take-Home Preview</Text>
          <Text style={styles.previewValue}>{fmt(preview.grossEarnings ?? 0)}</Text>
          <View style={styles.previewRow}>
            <PStat label="Net Tips" value={fmt(preview.netTips ?? 0)} />
            <PStat label="Tip %" value={((preview.tipPercent ?? 0)).toFixed(1) + '%'} />
            <PStat label="Hours" value={(preview.hours ?? 0).toFixed(1) + 'h'} />
            <PStat label="$/hr" value={fmt(preview.hours ? (preview.grossEarnings ?? 0) / preview.hours : 0)} />
          </View>
        </View>

        {/* Job picker */}
        <SLabel label="Job" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {jobs.map((j) => (
            <TouchableOpacity
              key={j.id}
              style={[styles.jobChip, { borderColor: j.color }, jobId === j.id && { backgroundColor: j.color }]}
              onPress={() => {
                setJobId(j.id);
                if (!existing) setWage(j.defaultWage.toString());
              }}
            >
              <Text style={[styles.jobChipText, jobId === j.id && { color: Colors.bg }]}>
                {j.name} · {j.position}
              </Text>
            </TouchableOpacity>
          ))}
          {jobs.length === 0 && (
            <TouchableOpacity onPress={() => router.push('/(tabs)/settings')}>
              <Text style={{ color: Colors.accent, fontSize: FontSize.sm, paddingVertical: 8 }}>
                No jobs yet — tap to add one in Settings
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {/* Date & time */}
        <SLabel label="Date & Time" />
        <View style={styles.row3}>
          <Field label="Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD" flex={1.6} />
          <Field label="Clock In" value={clockIn} onChange={setClockIn} placeholder="HH:MM" />
          <Field label="Clock Out" value={clockOut} onChange={setClockOut} placeholder="HH:MM" />
        </View>

        {/* Tips */}
        <SLabel label="Tips" />
        <View style={styles.row3}>
          <Field label="Cash Tips" value={tipsCash} onChange={setTipsCash} numeric accent={Colors.cash} />
          <Field label="Credit Tips" value={tipsCredit} onChange={setTipsCredit} numeric accent={Colors.credit} />
          <Field label="3% Withheld" value={tipsWithheld} onChange={setTipsWithheld} numeric accent={Colors.error} />
        </View>

        {/* Sales */}
        <SLabel label="Sales" />
        <View style={styles.row3}>
          <Field label="Sales Total" value={sales} onChange={setSales} numeric />
          <Field label="Covers" value={covers} onChange={setCovers} numeric />
        </View>

        {/* Tip-Out Breakdown */}
        <SLabel label="Tip-Out Breakdown" />
        <View style={styles.tipOutGrid}>
          {TIP_OUT_CATEGORIES.map((cat) => (
            <View key={cat.key} style={styles.tipOutCell}>
              <Field
                label={cat.label}
                value={tipOutCategories[cat.key]}
                onChange={(v) => handleCategoryChange(cat.key, v)}
                numeric
                accent={TIP_OUT_COLORS[cat.key]}
              />
            </View>
          ))}
          {/* Total tip-out display */}
          <View style={[styles.tipOutCell, styles.tipOutTotalCell]}>
            <Text style={styles.tipOutTotalLabel}>Total Out</Text>
            <Text style={styles.tipOutTotalValue}>{fmt(totalTipOut)}</Text>
          </View>
        </View>

        {/* Tip In */}
        <SLabel label="Tip Flow" />
        <View style={styles.row3}>
          <Field label="Tip In" value={tipIn} onChange={setTipIn} numeric accent={Colors.success} />
        </View>

        {/* Wage & other */}
        <SLabel label="Wage & Other" />
        <View style={styles.row3}>
          <Field label="Hourly Wage" value={wage} onChange={setWage} numeric />
          <Field label="Service Charge" value={serviceCharge} onChange={setServiceCharge} numeric />
          <Field label="Mileage (mi)" value={mileage} onChange={setMileage} numeric />
        </View>

        {/* Expenses */}
        <SLabel label="Expenses" />
        <View style={{ paddingHorizontal: Spacing.md }}>
          <ExpenseManager
            shiftId={shiftId}
            expenses={expenses}
            onChange={setExpenses}
          />
        </View>

        {/* Notes */}
        <SLabel label="Notes" />
        <TextInput
          style={styles.notesInput}
          placeholder="Anything to remember about this shift..."
          placeholderTextColor={Colors.textMuted}
          multiline
          value={notes}
          onChangeText={setNotes}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>{isEdit ? 'Update Shift' : 'Save Shift'}</Text>
        </TouchableOpacity>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function SLabel({ label }: { label: string }) {
  return (
    <Text style={styles.sectionLabel}>{label}</Text>
  );
}

function PStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={styles.pStatValue}>{value}</Text>
      <Text style={styles.pStatLabel}>{label}</Text>
    </View>
  );
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  accent,
  flex = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  accent?: string;
  flex?: number;
}) {
  return (
    <View style={{ flex }}>
      <Text style={[styles.fieldLabel, accent ? { color: accent } : null]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, accent ? { borderColor: accent + '55' } : null]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? (numeric ? '0' : '')}
        placeholderTextColor={Colors.textMuted}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  previewCard: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accentSoft,
  },
  previewLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  previewValue: { fontSize: 44, fontWeight: '800', color: Colors.accent, marginVertical: 4 },
  previewRow: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  pStatValue: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  pStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  chipScroll: { paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  jobChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    marginRight: Spacing.sm,
  },
  jobChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  row3: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  fieldLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 4,
    fontWeight: '600',
  },
  fieldInput: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tipOutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  tipOutCell: {
    width: '30%',
    minWidth: 90,
  },
  tipOutTotalCell: {
    width: '30%',
    minWidth: 90,
    justifyContent: 'flex-end',
    paddingBottom: 4,
  },
  tipOutTotalLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.error,
    marginBottom: 4,
  },
  tipOutTotalValue: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.error,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.error + '55',
    overflow: 'hidden',
  },
  notesInput: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
    minHeight: 80,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  saveBtn: {
    margin: Spacing.md,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.md + 2,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  saveBtnText: { color: Colors.bg, fontWeight: '800', fontSize: FontSize.lg },
});
