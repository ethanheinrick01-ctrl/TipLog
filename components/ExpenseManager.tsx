import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { Colors, Spacing, Radius, FontSize } from '../constants/theme';
import { Expense } from '../lib/types';

const CATEGORIES = [
  'Tip Out',
  'Uniform',
  'Transportation',
  'Parking',
  'Meals',
  'Supplies',
  'Other',
];

interface Props {
  shiftId: string;
  expenses: Expense[];
  onChange: (expenses: Expense[]) => void;
}

export function ExpenseManager({ shiftId, expenses, onChange }: Props) {
  function add() {
    onChange([
      ...expenses,
      {
        id: randomUUID(),
        shiftId,
        category: 'Other',
        amount: 0,
        taxDeductible: false,
        note: '',
      },
    ]);
  }

  function update(id: string, patch: Partial<Expense>) {
    onChange(expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function remove(id: string) {
    onChange(expenses.filter((e) => e.id !== id));
  }

  return (
    <View>
      {expenses.map((expense) => (
        <View key={expense.id} style={styles.card}>
          {/* Category picker */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.catChip, expense.category === cat && styles.catChipActive]}
                onPress={() => update(expense.id, { category: cat })}
              >
                <Text style={[styles.catText, expense.category === cat && styles.catTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.row}>
            <View style={styles.amountWrap}>
              <Text style={styles.dollarSign}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={expense.amount > 0 ? String(expense.amount) : ''}
                onChangeText={(v) => update(expense.id, { amount: parseFloat(v) || 0 })}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.taxRow}>
              <Text style={styles.taxLabel}>Tax deductible</Text>
              <Switch
                value={expense.taxDeductible}
                onValueChange={(v) => update(expense.id, { taxDeductible: v })}
                trackColor={{ false: Colors.border, true: Colors.accentDim }}
                thumbColor={expense.taxDeductible ? Colors.accent : Colors.textMuted}
              />
            </View>

            <TouchableOpacity onPress={() => remove(expense.id)} style={styles.deleteBtn}>
              <Ionicons name="close-circle" size={22} color={Colors.error} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.noteInput}
            value={expense.note ?? ''}
            onChangeText={(v) => update(expense.id, { note: v })}
            placeholder="Note (optional)"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      ))}

      <TouchableOpacity style={styles.addBtn} onPress={add}>
        <Ionicons name="add" size={16} color={Colors.accent} />
        <Text style={styles.addText}>Add Expense</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  catScroll: { marginBottom: Spacing.sm },
  catChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    marginRight: Spacing.xs,
  },
  catChipActive: { backgroundColor: Colors.accentDim },
  catText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  catTextActive: { color: Colors.textPrimary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dollarSign: { color: Colors.textSecondary, fontSize: FontSize.md, marginRight: 2 },
  amountInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    paddingVertical: Spacing.sm,
  },
  taxRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  taxLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  deleteBtn: { padding: 2 },
  noteInput: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.sm,
  },
  addText: { fontSize: FontSize.sm, color: Colors.accent, fontWeight: '600' },
});
