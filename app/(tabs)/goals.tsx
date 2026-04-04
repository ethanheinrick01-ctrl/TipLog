import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useMemo } from 'react';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  isWithinInterval,
  parseISO,
} from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useShiftStore } from '../../store/shiftStore';
import { useAuthStore } from '../../store/authStore';
import { summarizeShifts, fmt, fmtPct } from '../../lib/calculations';
import { Goal, GoalField } from '../../lib/types';
import { randomUUID } from 'expo-crypto';

const GOAL_FIELDS: { field: GoalField; label: string; format: (n: number) => string }[] = [
  { field: 'tipsTotal', label: 'Total Tips', format: fmt },
  { field: 'netTips', label: 'Net Tips', format: fmt },
  { field: 'grossEarnings', label: 'Total Earnings', format: fmt },
  { field: 'tipPercent', label: 'Tip %', format: fmtPct },
  { field: 'hours', label: 'Hours', format: (n) => n.toFixed(1) + 'h' },
  { field: 'sales', label: 'Sales', format: fmt },
  { field: 'covers', label: 'Covers', format: (n) => String(Math.round(n)) },
];

export default function GoalsScreen() {
  const { user } = useAuthStore();
  const { goals, shifts, saveGoal, deleteGoal } = useShiftStore();
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newField, setNewField] = useState<GoalField>('tipsTotal');
  const [newPeriod, setNewPeriod] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [newTarget, setNewTarget] = useState('');

  const now = new Date();

  const weekShifts = useMemo(
    () =>
      shifts.filter((s) =>
        isWithinInterval(parseISO(s.date), {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        }),
      ),
    [shifts],
  );
  const monthShifts = useMemo(
    () =>
      shifts.filter((s) =>
        isWithinInterval(parseISO(s.date), {
          start: startOfMonth(now),
          end: endOfMonth(now),
        }),
      ),
    [shifts],
  );

  function getProgress(goal: Goal): number {
    const relevant = goal.period === 'weekly' ? weekShifts : monthShifts;
    const summary = summarizeShifts(relevant);
    return summary[goal.field] as number;
  }

  function handleSave() {
    if (!newLabel.trim() || !newTarget.trim() || !user) return;
    const goal: Goal = {
      id: randomUUID(),
      userId: user.id,
      label: newLabel.trim(),
      field: newField,
      period: newPeriod,
      target: parseFloat(newTarget),
      createdAt: new Date().toISOString(),
    };
    saveGoal(goal);
    setAdding(false);
    setNewLabel('');
    setNewTarget('');
  }

  const fieldMeta = (f: GoalField) => GOAL_FIELDS.find((x) => x.field === f)!;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Goals</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(!adding)}>
            <Ionicons name={adding ? 'close' : 'add'} size={22} color={Colors.bg} />
          </TouchableOpacity>
        </View>

        {/* Add goal form */}
        {adding && (
          <View style={styles.addCard}>
            <Text style={styles.addTitle}>New Goal</Text>

            <TextInput
              style={styles.input}
              placeholder="Label (e.g. Weekly tip goal)"
              placeholderTextColor={Colors.textMuted}
              value={newLabel}
              onChangeText={setNewLabel}
            />

            <Text style={styles.inputLabel}>Track</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {GOAL_FIELDS.map((f) => (
                <TouchableOpacity
                  key={f.field}
                  style={[styles.chip, newField === f.field && styles.chipActive]}
                  onPress={() => setNewField(f.field)}
                >
                  <Text style={[styles.chipText, newField === f.field && styles.chipTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Period</Text>
            <View style={styles.chipRow2}>
              {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.chip, newPeriod === p && styles.chipActive]}
                  onPress={() => setNewPeriod(p)}
                >
                  <Text style={[styles.chipText, newPeriod === p && styles.chipTextActive]}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Target</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 500"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
              value={newTarget}
              onChangeText={setNewTarget}
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Goal</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Goal cards */}
        {goals.length === 0 && !adding && (
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={44} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No goals yet. Tap + to add one.</Text>
          </View>
        )}

        {goals.map((goal) => {
          const current = getProgress(goal);
          const pct = Math.min(current / goal.target, 1);
          const meta = fieldMeta(goal.field);
          const done = pct >= 1;

          return (
            <View key={goal.id} style={styles.goalCard}>
              <View style={styles.goalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalLabel}>{goal.label}</Text>
                  <Text style={styles.goalMeta}>
                    {meta.label} · {goal.period}
                  </Text>
                </View>
                {done && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.success} />
                )}
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('Delete Goal', 'Remove this goal?', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteGoal(goal.id) },
                    ])
                  }
                  style={{ marginLeft: Spacing.sm }}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${pct * 100}%`, backgroundColor: done ? Colors.success : Colors.accent },
                  ]}
                />
              </View>

              <View style={styles.goalFooter}>
                <Text style={styles.goalCurrent}>{meta.format(current)}</Text>
                <Text style={styles.goalTarget}>/ {meta.format(goal.target)}</Text>
                <Text style={[styles.goalPct, done && { color: Colors.success }]}>
                  {Math.round(pct * 100)}%
                </Text>
              </View>
            </View>
          );
        })}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCard: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  addTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    marginBottom: Spacing.sm,
  },
  inputLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.xs,
  },
  chipRow: { marginBottom: Spacing.sm },
  chipRow2: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    marginRight: Spacing.xs,
  },
  chipActive: { backgroundColor: Colors.accent },
  chipText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  chipTextActive: { color: Colors.bg, fontWeight: '700' },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  saveBtnText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.md },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  emptyText: { color: Colors.textSecondary, fontSize: FontSize.md },
  goalCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  goalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  goalLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  goalMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  progressTrack: {
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: { height: 6, borderRadius: Radius.full },
  goalFooter: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  goalCurrent: { fontSize: FontSize.md, fontWeight: '700', color: Colors.accent },
  goalTarget: { fontSize: FontSize.sm, color: Colors.textMuted },
  goalPct: { marginLeft: 'auto', fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
});
