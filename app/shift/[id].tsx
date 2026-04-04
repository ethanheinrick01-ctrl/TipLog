import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useShiftStore } from '../../store/shiftStore';
import { fmt, fmtPct } from '../../lib/calculations';

export default function ShiftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { shifts, jobs, deleteShift } = useShiftStore();


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
    Alert.alert('Delete Shift', 'Remove this shift permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteShift(shift!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.heroDate}>
                {format(parseISO(shift.date), 'EEEE, MMMM d, yyyy')}
              </Text>
              <View style={styles.jobRow}>
                <View style={[styles.jobDot, { backgroundColor: job?.color ?? Colors.accent }]} />
                <Text style={styles.jobName}>
                  {job?.name ?? 'Unknown'} · {job?.position ?? ''}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.md }}>
              <TouchableOpacity onPress={() => router.push(`/shift/edit/${shift!.id}`)}>
                <Ionicons name="pencil-outline" size={22} color={Colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete}>
                <Ionicons name="trash-outline" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.heroValue}>{fmt(shift.grossEarnings)}</Text>
          <Text style={styles.heroLabel}>Total Take-Home</Text>

          <View style={styles.heroStats}>
            <HeroStat label="Net Tips" value={fmt(shift.netTips)} />
            <HeroStat label="Hours" value={shift.hours.toFixed(2) + 'h'} />
            <HeroStat label="$/hr" value={fmt(shift.hours > 0 ? shift.grossEarnings / shift.hours : 0)} />
          </View>
        </View>

        {/* Tips */}
        <SectionTitle label="Tips" />
        <Row label="Cash Tips" value={fmt(shift.tipsCash)} accent={Colors.cash} />
        <Row label="Credit Tips" value={fmt(shift.tipsCredit)} accent={Colors.credit} />
        <Row label="Total Tips" value={fmt(shift.tipsTotal)} accent={Colors.accent} bold />

        {/* Sales */}
        <SectionTitle label="Sales" />
        <Row label="Sales Total" value={fmt(shift.sales)} />
        <Row label="Tip %" value={fmtPct(shift.tipPercent)} accent={Colors.accent} />
        <Row label="Covers" value={String(shift.covers)} />
        {shift.covers > 0 && (
          <Row label="Sales / Cover" value={fmt(shift.salesPerCover)} />
        )}

        {/* Tip-Out Breakdown */}
        <SectionTitle label="Tip-Out Breakdown" />
        {(() => {
          const cats = shift.tipOutByCategory ?? {};
          const entries = Object.entries(cats).filter(([, v]) => v > 0);
          if (entries.length === 0) return <Row label="(none)" value="$0.00" />;
          return entries.map(([key, val]) => {
            const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
            return <Row key={key} label={label} value={fmt(val)} accent={Colors.error} />;
          });
        })()}
        <Row label="Total Tip Out" value={fmt(shift.tipOut)} accent={Colors.error} bold />

        {/* Tip In */}
        <SectionTitle label="Tip In" />
        <Row label="Tip In" value={fmt(shift.tipIn)} accent={Colors.success} />

        {/* Net Tips */}
        <SectionTitle label="Net Tips" />
        <Row label="Net Tips" value={fmt(shift.netTips)} accent={Colors.accent} bold />

        {/* Hours & Wage */}
        <SectionTitle label="Hours & Wage" />
        <Row label="Clock In" value={shift.clockIn} />
        <Row label="Clock Out" value={shift.clockOut} />
        <Row label="Total Hours" value={shift.hours.toFixed(2) + 'h'} />
        <Row label="Hourly Wage" value={fmt(shift.wage) + '/hr'} />
        <Row label="Wage Earned" value={fmt(shift.wage * shift.hours)} />
        {shift.serviceCharge > 0 && (
          <Row label="Service Charge" value={fmt(shift.serviceCharge)} />
        )}
        {shift.mileage > 0 && (
          <Row label="Mileage" value={shift.mileage.toFixed(1) + ' mi'} />
        )}

        {/* Expenses */}
        {shift.expenses.length > 0 && (
          <>
            <SectionTitle label="Expenses" />
            {shift.expenses.map((e) => (
              <Row key={e.id} label={e.category} value={fmt(e.amount)} accent={Colors.error} />
            ))}
          </>
        )}

        {/* Notes */}
        {shift.notes.trim() && (
          <>
            <SectionTitle label="Notes" />
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{shift.notes}</Text>
            </View>
          </>
        )}

        {/* Sync status */}
        <View style={styles.syncRow}>
          <Ionicons
            name={shift.synced ? 'cloud-done-outline' : 'cloud-upload-outline'}
            size={14}
            color={shift.synced ? Colors.success : Colors.textMuted}
          />
          <Text style={styles.syncText}>
            {shift.synced ? 'Synced' : 'Pending sync'}
          </Text>
        </View>

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

function Row({
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
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, accent && { color: accent }, bold && { fontWeight: '700' }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  hero: {
    backgroundColor: Colors.surface,
    margin: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  heroDate: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  jobRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  jobDot: { width: 8, height: 8, borderRadius: Radius.full },
  jobName: { fontSize: FontSize.sm, color: Colors.textSecondary },
  heroValue: { fontSize: 48, fontWeight: '900', color: Colors.accent },
  heroLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  heroStats: { flexDirection: 'row', justifyContent: 'space-around' },
  heroStatValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  heroStatLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  rowValue: { fontSize: FontSize.md, color: Colors.textPrimary },
  notesCard: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  notesText: { fontSize: FontSize.md, color: Colors.textSecondary, lineHeight: 22 },
  syncRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.lg,
  },
  syncText: { fontSize: FontSize.xs, color: Colors.textMuted },
});
