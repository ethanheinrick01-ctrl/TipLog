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
import { isSameMonth, parseISO } from 'date-fns';

export default function GoalsScreen() {
  const router = useRouter();
  const { goals, saveGoal, deleteGoal, shifts } = useShiftStore();
  const { user } = useAuthStore();

  const now = new Date();
  const monthTotal = shifts
    .filter(s => isSameMonth(parseISO(s.date), now))
    .reduce((sum, s) => sum + (s.grossEarnings || 0), 0);

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

  function handleSave() {
    const amount = parseFloat(goalAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid dollar amount.');
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
    Alert.alert('Goal saved!', `Your monthly goal is set to $${Math.round(amount)}.`);
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Goals</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Monthly Earnings Goal</Text>

          {monthlyGoal ? (
            <>
              <View style={styles.progressSection}>
                <Text style={styles.progressPct}>{Math.round(progressPct)}%</Text>
                <Text style={styles.progressSub}>of ${Math.round(monthlyGoal.target)}</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
              </View>
              <Text style={styles.remainingText}>
                {remaining > 0
                  ? `$${Math.round(remaining)} left to hit your goal`
                  : '🎉 Goal reached!'}
              </Text>
            </>
          ) : (
            <Text style={styles.noGoalText}>No goal set yet.</Text>
          )}
        </View>

        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Set or update your goal</Text>
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
            <Text style={styles.saveBtnText}>Save Goal</Text>
          </TouchableOpacity>
          {monthlyGoal && (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={styles.clearBtnText}>Clear Goal</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  placeholder: { width: 40 },
  content: { padding: Spacing.md, gap: Spacing.md },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  cardLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  progressSection: { alignItems: 'center', marginBottom: Spacing.md },
  progressPct: { fontSize: 48, fontWeight: '700', color: Colors.success },
  progressSub: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2 },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: Radius.full,
  },
  remainingText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  noGoalText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },
  inputCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  inputLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.sm },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  dollarSign: { fontSize: 32, fontWeight: '700', color: Colors.success, marginRight: 4 },
  input: { flex: 1, fontSize: 32, fontWeight: '700', color: Colors.textPrimary, paddingVertical: Spacing.md },
  saveBtn: {
    backgroundColor: Colors.textPrimary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  saveBtnText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.md },
  clearBtn: { marginTop: Spacing.md, alignItems: 'center' },
  clearBtnText: { color: '#f87171', fontWeight: '600', fontSize: FontSize.sm },
});
