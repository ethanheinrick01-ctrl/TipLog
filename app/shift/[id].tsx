import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useShiftStore } from '../../store/shiftStore';
import { showAlert } from '../../lib/webAlert';
import { fmt, fmtPct, fmt12h } from '../../lib/calculations';

export default function ShiftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { shifts, jobs, deleteShift } = useShiftStore();
  const [deleteArmed, setDeleteArmed] = useState(false);

  const shift = shifts.find((s) => s.id === id);
  const job = shift ? jobs.find((j) => j.id === shift.jobId) : null;

  if (!shift) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: Colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
          Shift not found.
        </Text>
      </SafeAreaView>
    );
  }

  function handleDelete() {
    const doDelete = async () => {
      await deleteShift(shift!.id);
      setDeleteArmed(false);
      setTimeout(() => router.back(), 80);
    };

    if (Platform.OS === 'web') {
      if (!deleteArmed) {
        setDeleteArmed(true);
        showAlert('Confirm delete', 'Tap the trash icon again within 3 seconds to delete this shift.');
        setTimeout(() => setDeleteArmed(false), 3000);
        return;
      }
      void doDelete();
      return;
    }

    Alert.alert('Delete Shift', 'Remove this shift permanently?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void doDelete() },
    ]);
  }

  const hourlyRate = shift.hours > 0 ? shift.grossEarnings / shift.hours : 0;
  const tipOutEntries = Object.entries(shift.tipOutByCategory ?? {}).filter(([, v]) => v > 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Hero ───────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroMeta}>
              <Text style={styles.heroDate}>
                {format(parseISO(shift.date), 'EEEE, MMMM d')}
              </Text>
              <View style={styles.jobRow}>
                <View style={[styles.jobDot, { backgroundColor: job?.color ?? Colors.accent }]} />
                <Text style={styles.jobName}>{job?.name ?? 'Unknown'} · {job?.position ?? ''}</Text>
              </View>
            </View>
            <View style={styles.heroActions}>
              <TouchableOpacity onPress={() => router.push(`/shift/edit/${shift!.id}`)} hitSlop={8}>
                <Ionicons name="pencil-outline" size={20} color={Colors.accentActive} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color={deleteArmed ? '#ff8a80' : Colors.error} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.heroEarnings}>{fmt(shift.grossEarnings)}</Text>
          <Text style={styles.heroEarningsLabel}>Total Take-Home</Text>

          <View style={styles.heroStats}>
            <HeroStat label="Net Tips" value={fmt(shift.netTips)} accent={Colors.accent} />
            <View style={styles.heroDivider} />
            <HeroStat label="Hours" value={shift.hours.toFixed(1) + 'h'} />
            <View style={styles.heroDivider} />
            <HeroStat label="$/hr" value={fmt(hourlyRate)} />
          </View>

          {shift.tipPercent > 0 && (
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>{fmtPct(shift.tipPercent)} tip rate</Text>
            </View>
          )}
        </View>

        {/* ── Tips Card ─────────────────────────────────────────────── */}
        <SectionCard label="Tips">
          <MoneyRow label="Cash" value={fmt(shift.tipsCash)} accent={Colors.success} />
          <MoneyRow label="Credit" value={fmt(shift.tipsCredit)} accent={Colors.credit} />
          <MoneyRow label="Total" value={fmt(shift.tipsTotal)} accent={Colors.accent} bold />
        </SectionCard>

        {/* ── Sales Card ─────────────────────────────────────────────── */}
        <SectionCard label="Sales">
          <MoneyRow label="Sales" value={fmt(shift.sales)} />
          <MoneyRow label="Tip %" value={fmtPct(shift.tipPercent)} accent={shift.tipPercent >= 18 ? Colors.success : Colors.accent} />
          <MoneyRow label="Covers" value={String(shift.covers)} />
          {shift.covers > 0 && <MoneyRow label="Per Cover" value={fmt(shift.salesPerCover)} />}
        </SectionCard>

        {/* ── Tip-Out Card ───────────────────────────────────────────── */}
        <SectionCard label="Tip-Out (Paid Out)">
          {tipOutEntries.length === 0
            ? <Text style={styles.emptyText}>Nothing paid out</Text>
            : tipOutEntries.map(([key, val]) => {
                const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                return <MoneyRow key={key} label={label} value={'−' + fmt(val)} accent={Colors.error} />;
              })}
          <MoneyRow label="Total Out" value={'−' + fmt(shift.tipOut)} accent={Colors.error} bold />
        </SectionCard>

        {/* ── Net & Wage Card ───────────────────────────────────────── */}
        <SectionCard label="Earnings Breakdown">
          <MoneyRow label="Net Tips" value={fmt(shift.netTips)} accent={Colors.accent} bold />
          {shift.tipIn > 0 && <MoneyRow label="Tip In" value={'+' + fmt(shift.tipIn)} accent={Colors.success} />}
          <MoneyRow label="Wage Earned" value={fmt(shift.wage * shift.hours)} />
          {shift.serviceCharge > 0 && <MoneyRow label="Svc Charge" value={fmt(shift.serviceCharge)} />}
        </SectionCard>

        {/* ── Hours Card ─────────────────────────────────────────────── */}
        <SectionCard label="Hours">
          <MoneyRow label="Clock In" value={fmt12h(shift.clockIn)} />
          <MoneyRow label="Clock Out" value={fmt12h(shift.clockOut)} />
          <MoneyRow label="Total" value={shift.hours.toFixed(2) + 'h'} />
          <MoneyRow label="Wage" value={fmt(shift.wage) + '/hr'} />
        </SectionCard>

        {/* ── Expenses ───────────────────────────────────────────────── */}
        {shift.expenses.length > 0 && (
          <SectionCard label="Expenses">
            {shift.expenses.map((e) => (
              <MoneyRow key={e.id} label={e.category} value={'−' + fmt(e.amount)} accent={Colors.error} />
            ))}
          </SectionCard>
        )}

        {/* ── Notes ─────────────────────────────────────────────────── */}
        {shift.notes.trim() && (
          <View style={styles.notesSection}>
            <Text style={styles.notesSectionLabel}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{shift.notes}</Text>
            </View>
          </View>
        )}

        {/* ── Sync Status ───────────────────────────────────────────── */}
        <View style={styles.syncRow}>
          <Ionicons
            name={shift.synced ? 'cloud-done-outline' : 'cloud-upload-outline'}
            size={13}
            color={shift.synced ? Colors.success : Colors.textMuted}
          />
          <Text style={styles.syncText}>{shift.synced ? 'Synced to cloud' : 'Pending sync'}</Text>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Components ─────────────────────────────────────────────────────────────

function HeroStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={[styles.heroStatValue, accent && { color: accent }]}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      {children}
    </View>
  );
}

function MoneyRow({
  label,
  value,
  accent,
  bold,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.moneyRow}>
      <Text style={[styles.moneyRowLabel, bold && { fontWeight: '600' }]}>{label}</Text>
      <Text style={[styles.moneyRowValue, accent && { color: accent }, bold && { fontWeight: '700' }]}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Hero
  hero: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    margin: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  heroMeta: { flex: 1 },
  heroDate: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  jobDot: { width: 7, height: 7, borderRadius: Radius.full },
  jobName: { fontSize: FontSize.sm, color: Colors.textSecondary },
  heroActions: { flexDirection: 'row', gap: Spacing.md },
  heroEarnings: {
    fontSize: 52,
    fontWeight: '600',
    color: Colors.accentActive,
    letterSpacing: -1.5,
    lineHeight: 56,
  },
  heroEarningsLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: -4, marginBottom: Spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
  },
  heroDivider: { width: 1, height: 28, backgroundColor: Colors.borderSubtle },
  heroStatValue: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary },
  heroStatLabel: { fontSize: FontSize.xs, color: Colors.textSubtle, marginTop: 2 },
  heroChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginTop: Spacing.md,
  },
  heroChipText: { fontSize: FontSize.xs, color: Colors.accentActive, fontWeight: '600' },

  // Cards
  card: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  cardLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },

  // Money row
  moneyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  moneyRowLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  moneyRowValue: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '500' },

  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, fontStyle: 'italic', paddingVertical: 4 },

  // Notes
  notesSection: { marginHorizontal: Spacing.md, marginTop: Spacing.sm },
  notesSectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.xs,
  },
  notesCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  notesText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },

  // Sync
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
  },
  syncText: { fontSize: FontSize.xs, color: Colors.textMuted },
});
