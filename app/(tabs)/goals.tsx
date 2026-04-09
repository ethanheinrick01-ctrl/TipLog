import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useShiftStore } from '../../store/shiftStore';
import { useAuthStore } from '../../store/authStore';
import { isSameMonth, parseISO, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import { fmt } from '../../lib/calculations';

export default function GoalsScreen() {
  const router = useRouter();
  const { goals, saveGoal, deleteGoal, shifts } = useShiftStore();
  const { user } = useAuthStore();

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const daysInMonth = differenceInDays(monthEnd, monthStart) + 1;
  const dayOfMonth = now.getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  const monthShifts = shifts.filter(s => isSameMonth(parseISO(s.date), now));
  const monthTotal = monthShifts.reduce((sum, s) => sum + (s.grossEarnings || 0), 0);

  const monthlyGoal = goals.find(g => g.period === 'monthly' && g.field === 'grossEarnings');
  const [goalAmount, setGoalAmount] = useState(
    monthlyGoal ? String(Math.round(monthlyGoal.target)) : '',
  );

  const progressPct = monthlyGoal
    ? Math.min((monthTotal / monthlyGoal.target) * 100, 100)
    : 0;
  const remaining = monthlyGoal
    ? Math.max(monthlyGoal.target - monthTotal, 0)
    : 0;

  // Pace check: if on track, how much should be earned by now?
  const expectedByNow = monthlyGoal ? (monthlyGoal.target / daysInMonth) * dayOfMonth : 0;
  const paceDelta = monthTotal - expectedByNow; // positive = ahead, negative = behind
  const onTrack = paceDelta >= 0;
  const avgPerShift = monthShifts.length > 0 ? monthTotal / monthShifts.length : 0;
  const shiftsRemaining = daysLeft > 0 && avgPerShift > 0 ? remaining / avgPerShift : null;

  function handleSave() {
    const amount = parseFloat(goalAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a dollar amount like 2500.');
      return;
    }
    if (monthlyGoal) {
      saveGoal({ ...monthlyGoal, target: amount });
    } else {
      saveGoal({
        id: `goal-${Date.now()}`,
        period: 'monthly',
        field: 'grossEarnings',
        target: amount,
        label: 'Monthly Earnings Goal',
        createdAt: new Date().toISOString(),
        userId: user?.id ?? '',
      });
    }
    Alert.alert('Goal saved!', `Monthly target set to $${Math.round(amount)}.`);
  }

  function handleClear() {
    if (!monthlyGoal) return;
    Alert.alert('Clear Goal', 'Remove your monthly earnings goal?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          deleteGoal(monthlyGoal.id);
          setGoalAmount('');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Goals</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Hero: Current vs Target ─────────────────────────────── */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>This Month</Text>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroValue}>{fmt(monthTotal)}</Text>
              <Text style={styles.heroSub}>earned so far</Text>
            </View>
            {monthlyGoal ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.heroTarget}>{fmt(monthlyGoal.target)}</Text>
                <Text style={styles.heroSub}>monthly goal</Text>
              </View>
            ) : (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.heroTargetNoGoal}>Set a goal</Text>
                <Text style={styles.heroSub}>to track progress</Text>
              </View>
            )}
          </View>

          {monthlyGoal && (
            <>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPct}%` },
                    progressPct >= 100 && { backgroundColor: Colors.success },
                  ]}
                />
              </View>
              <View style={styles.progressMeta}>
                <Text style={styles.progressPct}>{Math.round(progressPct)}% complete</Text>
                {remaining > 0
                  ? <Text style={styles.progressRemaining}>${Math.round(remaining)} left</Text>
                  : <Text style={[styles.progressRemaining, { color: Colors.success }]}>Goal reached!</Text>}
              </View>
            </>
          )}
        </View>

        {/* ── Insight ──────────────────────────────────────────── */}
        {monthlyGoal && monthShifts.length > 0 && (
          <View style={styles.insightCard}>
            <Ionicons name={onTrack ? 'trending-up' : 'trending-down'} size={16} color={onTrack ? Colors.success : Colors.error} />
            <Text style={[styles.insightText, { color: onTrack ? Colors.success : Colors.error }]}>
              {remaining === 0
                ? `${monthShifts.length} shift${monthShifts.length !== 1 ? 's' : ''} this month — goal crushed!`
                : onTrack
                ? `Ahead of pace by ${fmt(Math.abs(paceDelta))} — you're on track`
                : `Behind pace by ${fmt(Math.abs(paceDelta))} — need ${fmt(Math.abs(remaining))} more`}
              {shiftsRemaining !== null && remaining > 0
                ? `. ~${Math.round(shiftsRemaining)} more shift${shiftsRemaining !== 1 ? 's' : ''} at your avg to close the gap`
                : ''}
            </Text>
          </View>
        )}

        {/* ── Pace Stats ──────────────────────────────────────── */}
        {monthlyGoal && monthShifts.length > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{fmt(avgPerShift)}</Text>
              <Text style={styles.statLabel}>Avg / shift</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{monthShifts.length}</Text>
              <Text style={styles.statLabel}>Shifts this month</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{daysLeft}</Text>
              <Text style={styles.statLabel}>Days left</Text>
            </View>
          </View>
        )}

        {/* ── Goal Input ──────────────────────────────────────── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Monthly Goal</Text>
          <Text style={styles.sectionSub}>
            {monthlyGoal
              ? `Update your target — currently $${Math.round(monthlyGoal.target)}`
              : 'Set a monthly earnings target to track your progress'}
          </Text>

          <View style={styles.inputRow}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.input}
              value={goalAmount}
              onChangeText={setGoalAmount}
              keyboardType="numeric"
              placeholder="2,500"
              placeholderTextColor={Colors.textSubtle}
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{monthlyGoal ? 'Update Goal' : 'Set Goal'}</Text>
          </TouchableOpacity>

          {monthlyGoal && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearBtnText}>Clear Goal</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Recent Shifts (this month) ──────────────────────── */}
        {monthShifts.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>This Month's Shifts</Text>
            {monthShifts
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 5)
              .map((s) => (
                <View key={s.id} style={styles.shiftRow}>
                  <View>
                    <Text style={styles.shiftDate}>{s.date}</Text>
                  </View>
                  <Text style={styles.shiftAmount}>{fmt(s.grossEarnings)}</Text>
                </View>
              ))}
            {monthShifts.length > 5 && (
              <Text style={styles.moreShifts}>+ {monthShifts.length - 5} more shifts</Text>
            )}
          </View>
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  navTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },

  content: { padding: Spacing.md, gap: Spacing.md },

  // Hero
  heroCard: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  heroLabel: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: Spacing.md,
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroValue: { fontSize: 44, fontWeight: '600', color: Colors.accentActive, letterSpacing: -1, lineHeight: 50 },
  heroSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  heroTarget: { fontSize: 22, fontWeight: '600', color: Colors.textPrimary },
  heroTargetNoGoal: { fontSize: 16, color: Colors.textMuted, fontWeight: '500' },

  // Progress
  progressBar: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.full, overflow: 'hidden', marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%', backgroundColor: Colors.accent,
    borderRadius: Radius.full,
  },
  progressMeta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  progressPct: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  progressRemaining: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '500' },

  // Insight
  insightCard: {
    backgroundColor: Colors.card,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  insightText: { flex: 1, fontSize: FontSize.sm, fontWeight: '500', lineHeight: 20 },

  // Stats
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: {
    flex: 1, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center',
  },
  statValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },

  // Sections
  sectionCard: {
    backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg, padding: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: Spacing.xs,
  },
  sectionSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.md, lineHeight: 18 },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  dollarSign: { fontSize: 32, fontWeight: '700', color: Colors.success, marginRight: 4 },
  input: { flex: 1, fontSize: 32, fontWeight: '700', color: Colors.textPrimary, paddingVertical: Spacing.md },

  // Buttons
  saveBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  saveBtnText: { color: Colors.textPrimary, fontWeight: '700', fontSize: FontSize.md },
  clearBtn: { marginTop: Spacing.md, alignItems: 'center' },
  clearBtnText: { color: '#f87171', fontWeight: '600', fontSize: FontSize.sm },

  // Shifts
  shiftRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderSubtle,
  },
  shiftDate: { fontSize: FontSize.sm, color: Colors.textSecondary },
  shiftAmount: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
  moreShifts: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },
});
