import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths,
  parseISO,
  isToday,
} from 'date-fns';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useShiftStore } from '../../store/shiftStore';
import { useAuthStore } from '../../store/authStore';
import { fmt, fmt12h } from '../../lib/calculations';
import { Shift } from '../../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { shifts, jobs } = useShiftStore();
  const [viewMonth, setViewMonth] = useState(new Date());
  const [dayModal, setDayModal] = useState<{ date: string; dayShifts: Shift[] } | null>(null);

  const days = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end = endOfMonth(viewMonth);
    return {
      allDays: eachDayOfInterval({ start, end }),
      paddingDays: start.getDay(),
    };
  }, [viewMonth]);

  // Build a map: date string → list of shifts that day
  const shiftsByDate = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    for (const s of shifts) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    return map;
  }, [shifts]);

  const monthTotal = useMemo(() => {
    return shifts
      .filter((s) => {
        const d = parseISO(s.date);
        return d >= startOfMonth(viewMonth) && d <= endOfMonth(viewMonth);
      })
      .reduce((sum, s) => sum + s.grossEarnings, 0);
  }, [shifts, viewMonth]);

  function handleDayPress(dateStr: string) {
    const dayShifts = shiftsByDate[dateStr] ?? [];
    if (dayShifts.length === 0) {
      router.push({ pathname: '/shift/new', params: { date: dateStr } });
    } else if (dayShifts.length === 1) {
      router.push(`/shift/${dayShifts[0].id}`);
    } else {
      // Multiple shifts — show picker modal
      setDayModal({ date: dateStr, dayShifts });
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {user?.name?.split(' ')[0] ?? 'there'}</Text>
          <Text style={styles.monthTotal}>{fmt(monthTotal)} this month</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/shift/new')}
        >
          <Ionicons name="add" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => router.push('/shift/import')}
        >
          <Ionicons name="camera" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Month Navigator */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => setViewMonth(subMonths(viewMonth, 1))}>
            <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{format(viewMonth, 'MMMM yyyy')}</Text>
          <TouchableOpacity onPress={() => setViewMonth(addMonths(viewMonth, 1))}>
            <Ionicons name="chevron-forward" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Day labels */}
        <View style={styles.dayLabels}>
          {DAYS.map((d) => (
            <Text key={d} style={styles.dayLabel}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.grid}>
          {Array.from({ length: days.paddingDays }).map((_, i) => (
            <View key={`pad-${i}`} style={styles.dayCell} />
          ))}

          {days.allDays.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayShifts = shiftsByDate[dateStr] ?? [];
            const today = isToday(day);
            const total = dayShifts.reduce((s, sh) => s + sh.grossEarnings, 0);
            const job = dayShifts[0] ? jobs.find((j) => j.id === dayShifts[0].jobId) : null;

            return (
              <Pressable
                key={dateStr}
                style={[styles.dayCell, today && styles.todayCell]}
                onPress={() => handleDayPress(dateStr)}
              >
                <Text style={[styles.dayNum, today && styles.todayNum]}>
                  {format(day, 'd')}
                </Text>
                {dayShifts.length > 0 && (
                  <>
                    <View style={styles.dotRow}>
                      {dayShifts.slice(0, 3).map((s, i) => {
                        const j = jobs.find((j) => j.id === s.jobId);
                        return (
                          <View
                            key={i}
                            style={[styles.dot, { backgroundColor: j?.color ?? Colors.accent }]}
                          />
                        );
                      })}
                    </View>
                    <Text style={styles.dayTotal}>{fmt(total)}</Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* Recent shifts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Shifts</Text>
          {shifts.slice(0, 15).map((shift) => {
            const job = jobs.find((j) => j.id === shift.jobId);
            return (
              <TouchableOpacity
                key={shift.id}
                style={styles.shiftRow}
                onPress={() => router.push(`/shift/${shift.id}`)}
              >
                <View style={[styles.jobDot, { backgroundColor: job?.color ?? Colors.accent }]} />
                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftDate}>
                    {format(parseISO(shift.date), 'EEE, MMM d')}
                  </Text>
                  <Text style={styles.shiftJob}>
                    {job?.name ?? 'Unknown'} · {job?.position ?? ''} · {shift.hours}h
                  </Text>
                </View>
                <View style={styles.shiftEarnings}>
                  <Text style={styles.shiftTotal}>{fmt(shift.grossEarnings)}</Text>
                  <Text style={styles.shiftTips}>{fmt(shift.tipsTotal)} tips</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}

          {shifts.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No shifts yet. Tap + to log your first shift.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Multi-shift day modal */}
      {dayModal && (
        <Modal transparent animationType="slide" onRequestClose={() => setDayModal(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setDayModal(null)}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalDate}>
                {format(parseISO(dayModal.date), 'EEEE, MMMM d')}
              </Text>
              <Text style={styles.modalSubtitle}>
                {dayModal.dayShifts.length} shifts · {fmt(dayModal.dayShifts.reduce((s, sh) => s + sh.grossEarnings, 0))} total
              </Text>

              {dayModal.dayShifts.map((shift) => {
                const job = jobs.find((j) => j.id === shift.jobId);
                return (
                  <TouchableOpacity
                    key={shift.id}
                    style={styles.modalShiftRow}
                    onPress={() => {
                      setDayModal(null);
                      router.push(`/shift/${shift.id}`);
                    }}
                  >
                    <View style={[styles.jobDot, { backgroundColor: job?.color ?? Colors.accent }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalShiftName}>{job?.name ?? 'Unknown'} · {job?.position ?? ''}</Text>
                      <Text style={styles.modalShiftSub}>{fmt12h(shift.clockIn)} – {fmt12h(shift.clockOut)} · {shift.hours}h</Text>
                    </View>
                    <Text style={styles.modalShiftEarnings}>{fmt(shift.grossEarnings)}</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={styles.modalAddBtn}
                onPress={() => {
                  setDayModal(null);
                  router.push({ pathname: '/shift/new', params: { date: dayModal.date } });
                }}
              >
                <Ionicons name="add" size={18} color={Colors.textPrimary} />
                <Text style={styles.modalAddText}>Add Another Shift</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  greeting: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: 2 },
  monthTotal: { fontSize: FontSize.xxl, fontWeight: '600', color: Colors.textPrimary },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  monthLabel: { fontSize: FontSize.xl, fontWeight: '500', color: Colors.textPrimary },
  dayLabels: { flexDirection: 'row', paddingHorizontal: Spacing.xs, marginBottom: Spacing.xs },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: FontSize.xs, color: Colors.textSubtle, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.xs },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 0.85,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
    borderRadius: Radius.sm,
  },
  todayCell: { backgroundColor: Colors.accentSoft },
  dayNum: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  todayNum: { color: Colors.accentActive, fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: Radius.full },
  dayTotal: { fontSize: 9, color: Colors.textSubtle, marginTop: 1 },
  section: { marginTop: Spacing.lg, paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.textMuted, marginBottom: Spacing.sm },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  jobDot: { width: 8, height: 8, borderRadius: Radius.full },
  shiftInfo: { flex: 1 },
  shiftDate: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '500' },
  shiftJob: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  shiftEarnings: { alignItems: 'flex-end' },
  shiftTotal: { fontSize: FontSize.md, color: Colors.accentActive, fontWeight: '600' },
  shiftTips: { fontSize: FontSize.xs, color: Colors.textSubtle, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyText: { color: Colors.textMuted, textAlign: 'center', fontSize: FontSize.md },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalHandle: {
    width: 32,
    height: 3,
    backgroundColor: Colors.borderSubtle,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  modalDate: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  modalSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  modalShiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  modalShiftName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  modalShiftSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  modalShiftEarnings: { fontSize: FontSize.md, fontWeight: '600', color: Colors.accentActive },
  modalAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  modalAddText: { color: Colors.textPrimary, fontWeight: '600', fontSize: FontSize.md },
});
