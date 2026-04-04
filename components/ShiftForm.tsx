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

  const [date, setDate] = useState(existing?.date ?? initialDate ?? format(new Date(), 'yyyy-MM-dd'));
  const [jobId, setJobId] = useState(defaultJobId);
  const [clockIn, setClockIn] = useState(existing?.clockIn ?? '17:00');
  const [clockOut, setClockOut] = useState(existing?.clockOut ?? '23:00');
  const [tipsCash, setTipsCash] = useState(existing?.tipsCash ? String(existing.tipsCash) : '');
  const [tipsCredit, setTipsCredit] = useState(existing?.tipsCredit ? String(existing.tipsCredit) : '');
  const [sales, setSales] = useState(existing?.sales ? String(existing.sales) : '');
  const [covers, setCovers] = useState(existing?.covers ? String(existing.covers) : '');
  const [tipOut, setTipOut] = useState(existing?.tipOut ? String(existing.tipOut) : '');
  const [tipIn, setTipIn] = useState(existing?.tipIn ? String(existing.tipIn) : '');
  const [wage, setWage] = useState(existing?.wage ? String(existing.wage) : (defaultJob?.defaultWage?.toString() ?? '2.13'));
  const [serviceCharge, setServiceCharge] = useState(existing?.serviceCharge ? String(existing.serviceCharge) : '');
  const [mileage, setMileage] = useState(existing?.mileage ? String(existing.mileage) : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [expenses, setExpenses] = useState<Expense[]>(existing?.expenses ?? []);

  const shiftId = existing?.id ?? randomUUID();

  const preview = computeShift({
    tipsCash: parseFloat(tipsCash) || 0,
    tipsCredit: parseFloat(tipsCredit) || 0,
    sales: parseFloat(sales) || 0,
    covers: parseInt(covers) || 0,
    tipOut: parseFloat(tipOut) || 0,
    tipIn: parseFloat(tipIn) || 0,
    wage: parseFloat(wage) || 0,
    serviceCharge: parseFloat(serviceCharge) || 0,
    mileage: parseFloat(mileage) || 0,
    clockIn,
    clockOut,
  });

  function handleSave() {
    if (!user?.id) return;
    if (!jobId) {
      Alert.alert('No Job', 'Add a job in Settings first.');
      return;
    }

    saveShift(user.id, {
      id: existing?.id,
      date,
      jobId,
      clockIn,
      clockOut,
      tipsCash: parseFloat(tipsCash) || 0,
      tipsCredit: parseFloat(tipsCredit) || 0,
      sales: parseFloat(sales) || 0,
      covers: parseInt(covers) || 0,
      tipOut: parseFloat(tipOut) || 0,
      tipIn: parseFloat(tipIn) || 0,
      wage: parseFloat(wage) || 0,
      serviceCharge: parseFloat(serviceCharge) || 0,
      mileage: parseFloat(mileage) || 0,
      notes,
      expenses: expenses.map((e) => ({ ...e, shiftId })),
    });

    router.back();
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
            <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm, paddingVertical: 8 }}>
              Add a job in Settings first
            </Text>
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
        </View>

        {/* Sales */}
        <SLabel label="Sales" />
        <View style={styles.row3}>
          <Field label="Sales Total" value={sales} onChange={setSales} numeric />
          <Field label="Covers" value={covers} onChange={setCovers} numeric />
        </View>

        {/* Tip flow */}
        <SLabel label="Tip Flow" />
        <View style={styles.row3}>
          <Field label="Tip Out" value={tipOut} onChange={setTipOut} numeric accent={Colors.error} />
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
