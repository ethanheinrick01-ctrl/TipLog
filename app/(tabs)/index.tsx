import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Modal,
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
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  subDays,
} from 'date-fns';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useShiftStore } from '../../store/shiftStore';
import { useAuthStore } from '../../store/authStore';
import { fmt, fmt12h } from '../../lib/calculations';
import { Shift } from '../../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const router = useRouter();
  const { shifts, jobs } = useShiftStore();
  const { user } = useAuthStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dayModal, setDayModal] = useState<{ date: string; dayShifts: Shift[] } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const monthName = format(currentMonth, 'MMMM');
  const year = format(currentMonth, 'yyyy');

  const monthTotal = useMemo(() => {
    return shifts
      .filter((s) => isSameMonth(parseISO(s.date), currentMonth))
      .reduce((sum, s) => sum + s.grossEarnings, 0);
  }, [shifts, currentMonth]);

  const firstName = user?.name?.split(' ')[0] || 'User';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroHeader}>
            <View>
              <Text style={styles.greeting}>Good Morning, {firstName}</Text>
              <Text style={styles.dashboardTitle}>Dashboard</Text>
            </View>
            <TouchableOpacity style={styles.profileBtn}>
              <Ionicons name="person-circle-outline" size={32} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.moneyCard}>
            <View style={styles.moneyHeader}>
              <Text style={styles.moneyLabel}>Monthly Earnings</Text>
              <View style={styles.monthBadge}>
                <Text style={styles.monthBadgeText}>{monthName}</Text>
              </View>
            </View>
            
            <View style={styles.moneyRow}>
              <Text style={styles.moneyValue}>${monthTotal.toFixed(2)}</Text>
              <View style={styles.moneyTrend}>
                <Ionicons name="trending-up" size={14} color={Colors.success} />
                <Text style={styles.trendText}>+12%</Text>
              </View>
            </View>

            <Text style={styles.insightLine}>
              {monthTotal >= 1200 
                ? "🎯 Goal smashed. Keep stacking." 
                : `$${(1200 - monthTotal).toFixed(0)} left to hit your goal.`}
            </Text>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: '45%' }]} />
            </View>
            <View style={styles.progressLabels}>
              <Text style={styles.progressText}>45% of $1,200 goal</Text>
              <Text style={styles.remainingText}>${(1200 - monthTotal).toFixed(0)} left</Text>
            </View>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity 
              style={styles.uploadBtn}
              onPress={() => router.push('/shift/import')}
            >
              <View style={styles.uploadIconContainer}>
                <Ionicons name="camera" size={20} color={Colors.textPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.uploadBtnTitle}>Automatic Mode</Text>
                <Text style={styles.uploadBtnSubtitle}>Snap a cashout. Done in seconds.</Text>
              </View>
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.addManualBtn}
              onPress={() => router.push('/shift/new')}
            >
              <View style={styles.addIconContainer}>
                <Ionicons name="add" size={20} color={Colors.bg} />
              </View>
              <View>
                <Text style={styles.addManualBtnTitle}>Manual Mode</Text>
                <Text style={styles.addManualBtnSubtitle}>Add Shift</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.calendarSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{expanded ? 'Full Calendar' : 'This Week'}</Text>
            <TouchableOpacity 
              style={styles.calendarNavBtn}
              onPress={() => setExpanded(!expanded)}
            >
              <Text style={styles.calendarNavText}>
                {expanded ? 'Show Week' : 'Show Month'}
              </Text>
              <Ionicons 
                name={expanded ? "calendar-outline" : "chevron-down"} 
                size={14} 
                color={Colors.textSecondary} 
              />
            </TouchableOpacity>
          </View>
          
          <Calendar
            currentMonth={currentMonth}
            shifts={shifts}
            jobs={jobs}
            expanded={expanded}
            onSelectDate={(date) => {
              const dayShifts = shifts.filter(s => s.date === date);
              if (dayShifts.length > 1) {
                setDayModal({ date, dayShifts });
              } else if (dayShifts.length === 1) {
                router.push(`/shift/${dayShifts[0].id}`);
              } else {
                router.push({ pathname: '/shift/new', params: { date } });
              }
            }}
          />
        </View>

        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {shifts.slice(0, 15).map((shift) => {
            const job = jobs.find((j) => j.id === shift.jobId);
            return (
              <TouchableOpacity
                key={shift.id}
                style={styles.shiftRow}
                onPress={() => router.push(`/shift/${shift.id}`)}
              >
                <View style={styles.shiftBadge}>
                  <Ionicons name="cash-outline" size={20} color={job?.color || Colors.accent} />
                  <View style={[styles.shiftJobDot, { backgroundColor: job?.color || Colors.accent }]} />
                </View>

                <View style={styles.shiftMain}>
                  <Text style={styles.shiftDate}>
                    {format(parseISO(shift.date), 'EEEE, MMM d')}
                  </Text>
                  <Text style={styles.shiftMeta}>
                    {job?.name || 'Shift'} · {job?.position || ''} · {shift.hours}h
                  </Text>
                </View>

                <View style={styles.shiftRight}>
                  <Text style={styles.shiftAmount}>{fmt(shift.grossEarnings)}</Text>
                  <View style={styles.shiftTipsRow}>
                    <Text style={styles.shiftTipsLabel}>{fmt(shift.tipsTotal)} tips</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={14} color={Colors.textSubtle} />
              </TouchableOpacity>
            );
          })}

          {shifts.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="cash-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No shifts yet.</Text>
            </View>
          )}
        </View>
      </ScrollView>

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
                    <View style={[styles.shiftBadge, { width: 32, height: 32, borderRadius: 16 }]}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: job?.color ?? Colors.accent }} />
                    </View>
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
                <Ionicons name="add" size={18} color={Colors.bg} />
                <Text style={styles.modalAddText}>Add Another Shift</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function Calendar({ currentMonth, shifts, jobs, expanded, onSelectDate }: {
  currentMonth: Date;
  shifts: Shift[];
  jobs: any[];
  expanded: boolean;
  onSelectDate: (date: string) => void;
}) {
  const weekStart = startOfWeek(new Date());
  
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = new Date(monthStart);
  while (gridStart.getDay() !== 0) gridStart.setDate(gridStart.getDate() - 1);
  const gridEnd = new Date(monthEnd);
  while (gridEnd.getDay() !== 6) gridEnd.setDate(gridEnd.getDate() + 1);

  const days = expanded 
    ? eachDayOfInterval({ start: gridStart, end: gridEnd })
    : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <View style={styles.calendarGridContainer}>
      <View style={styles.dayLabels}>
        {DAYS.map((d) => (
          <Text key={d} style={styles.dayLabel}>{d[0]}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayShifts = shifts.filter((s) => s.date === dateStr);
          const total = dayShifts.reduce((sum, s) => sum + s.grossEarnings, 0);
          const isCurrMonth = expanded ? isSameMonth(day, currentMonth) : true;
          const isTdy = isToday(day);

          const intensity = total > 0 ? Math.min(total / 250, 1) : 0;

          return (
            <Pressable
              key={dateStr}
              style={[
                styles.dayCell,
                !isCurrMonth && { opacity: 0.15 },
                isTdy && styles.todayCell,
                total > 0 && { backgroundColor: `rgba(74, 222, 128, ${intensity * 0.25})` }
              ]}
              onPress={() => onSelectDate(dateStr)}
            >
              <Text style={[styles.dayNum, isTdy && styles.todayNum]}>
                {format(day, 'd')}
              </Text>
              {dayShifts.length > 0 && (
                <View style={styles.dotRow}>
                  {dayShifts.slice(0, 3).map((shift, i) => {
                    const j = jobs.find((jb) => jb.id === shift.jobId);
                    return (
                      <View
                        key={i}
                        style={[styles.dot, { backgroundColor: j?.color ?? Colors.accent }]}
                      />
                    );
                  })}
                </View>
              )}
              {total > 0 && (
                <Text style={[styles.dayTotal, isTdy && { color: Colors.accentActive }]}>
                  {`$${Math.round(total)}`}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scrollContent: { paddingBottom: 40 },
  hero: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  greeting: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '500' },
  dashboardTitle: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moneyCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  moneyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  moneyLabel: { fontSize: FontSize.sm, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  monthBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  monthBadgeText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '700' },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  moneyValue: { fontSize: 48, fontWeight: '700', color: Colors.success, letterSpacing: -1 },
  moneyTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  trendText: { fontSize: 12, color: Colors.success, fontWeight: '700' },
  insightLine: { 
    fontSize: FontSize.xs, 
    color: Colors.textSecondary, 
    fontWeight: '600',
    marginBottom: Spacing.md,
    fontStyle: 'italic',
  },
  progressBar: {
    height: 6,
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
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  remainingText: { fontSize: FontSize.xs, color: Colors.textMuted },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  uploadBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  uploadIconContainer: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBtnTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  uploadBtnSubtitle: { fontSize: 10, fontWeight: '500', color: Colors.textMuted, marginTop: 1 },
  addManualBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.textPrimary,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  addIconContainer: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addManualBtnTitle: { fontSize: 13, fontWeight: '700', color: Colors.bg },
  addManualBtnSubtitle: { fontSize: 10, fontWeight: '600', color: 'rgba(0,0,0,0.5)', marginTop: 1 },
  calendarSection: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  calendarNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  calendarNavText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  calendarGridContainer: {
    paddingHorizontal: Spacing.xs,
  },
  dayLabels: { flexDirection: 'row', marginBottom: Spacing.xs },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 10, color: Colors.textSubtle, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 6,
    borderRadius: Radius.sm,
  },
  todayCell: { backgroundColor: 'rgba(255,255,255,0.04)' },
  dayNum: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  todayNum: { color: Colors.accentActive, fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  dot: { width: 4, height: 4, borderRadius: Radius.full },
  dayTotal: { fontSize: 8, color: Colors.textSubtle, marginTop: 2, fontWeight: '600' },
  recentSection: {
    paddingHorizontal: Spacing.md,
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  shiftBadge: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  shiftJobDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    position: 'absolute',
    top: -2,
    right: -2,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  shiftMain: { flex: 1 },
  shiftDate: { fontSize: FontSize.md, color: Colors.textPrimary, fontWeight: '600' },
  shiftMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  shiftRight: { alignItems: 'flex-end' },
  shiftAmount: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: '700' },
  shiftTipsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  shiftTipsLabel: { fontSize: 10, color: Colors.success, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: Spacing.md },
  emptyText: { color: Colors.textMuted, fontSize: FontSize.md },
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
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHandle: {
    width: 32,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.full,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  modalDate: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  modalSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.lg },
  modalShiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  modalShiftName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  modalShiftSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  modalShiftEarnings: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  modalAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.textPrimary,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  modalAddText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.md },
});
