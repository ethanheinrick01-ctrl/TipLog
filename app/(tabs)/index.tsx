import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  Modal,
  type DimensionValue,
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
  subMonths,
  parseISO,
  isToday,
  subDays,
  isWithinInterval,
} from 'date-fns';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useShiftStore } from '../../store/shiftStore';
import { useAuthStore } from '../../store/authStore';
import {
  fmt,
  fmt12h,
  summarizeShifts,
  getPayPeriodForDate,
  DEFAULT_PAY_PERIOD_ANCHOR,
} from '../../lib/calculations';
import { Shift, GoalField } from '../../lib/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getEarningsRangeStyle(total: number) {
  if (total <= 0) {
    return {
      bg: 'transparent',
      dayNum: Colors.textSecondary,
      total: Colors.textSubtle,
    };
  }

  if (total <= 75) {
    return {
      bg: 'rgba(239, 68, 68, 0.24)', // red
      dayNum: '#fca5a5',
      total: '#fecaca',
    };
  }

  if (total <= 100) {
    return {
      bg: 'rgba(250, 204, 21, 0.24)', // yellow
      dayNum: '#fde047',
      total: '#fef08a',
    };
  }

  if (total <= 199) {
    return {
      bg: 'rgba(52, 211, 153, 0.26)', // mint green
      dayNum: '#6ee7b7',
      total: '#a7f3d0',
    };
  }

  return {
    bg: '#065f46', // deep dark emerald
    dayNum: '#d1fae5',
    total: '#ecfdf5',
  };
}

function hasCashoutData(shift: Shift) {
  return (
    shift.grossEarnings > 0 ||
    shift.tipsTotal > 0 ||
    shift.sales > 0 ||
    !!(shift.clockOut && shift.clockOut.trim())
  );
}

function formatGoalValue(value: number, field: GoalField | null): string {
  if (!field) return `$${value.toFixed(0)}`;
  if (field === 'tipPercent') return `${value.toFixed(1)}%`;
  if (field === 'hours') return `${value.toFixed(1)}h`;
  if (field === 'covers') return `${Math.round(value)}`;
  return `$${value.toFixed(0)}`;
}

function getGoalFieldLabel(field: GoalField): string {
  if (field === 'tipsTotal') return 'Tips';
  if (field === 'netTips') return 'Net Tips';
  if (field === 'grossEarnings') return 'Earnings';
  if (field === 'tipPercent') return 'Tip %';
  if (field === 'hours') return 'Hours';
  if (field === 'sales') return 'Sales';
  return 'Covers';
}

export default function CalendarScreen() {
  const router = useRouter();
  const { shifts, jobs, goals } = useShiftStore();
  const { user } = useAuthStore();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dayModal, setDayModal] = useState<{ date: string; dayShifts: Shift[] } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const monthName = format(currentMonth, 'MMMM');
  const year = format(currentMonth, 'yyyy');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const monthShifts = useMemo(
    () => shifts.filter((s) => isSameMonth(parseISO(s.date), currentMonth)),
    [shifts, currentMonth],
  );

  const monthWorkedShifts = useMemo(
    () => monthShifts.filter((s) => s.date <= todayStr && hasCashoutData(s)),
    [monthShifts, todayStr],
  );

  const monthTotal = useMemo(
    () => monthWorkedShifts.reduce((sum, s) => sum + s.grossEarnings, 0),
    [monthWorkedShifts],
  );

  const previousMonthWorkedTotal = useMemo(() => {
    const previousMonth = subMonths(currentMonth, 1);
    return shifts
      .filter(
        (s) =>
          s.date <= todayStr &&
          hasCashoutData(s) &&
          isSameMonth(parseISO(s.date), previousMonth),
      )
      .reduce((sum, s) => sum + s.grossEarnings, 0);
  }, [shifts, currentMonth, todayStr]);

  const monthTrend = useMemo(() => {
    if (previousMonthWorkedTotal <= 0) {
      if (monthTotal <= 0) return null;
      return {
        label: 'First month tracked',
        icon: 'sparkles-outline' as const,
        color: Colors.textSecondary,
        bg: 'rgba(255,255,255,0.08)',
      };
    }

    const diffPct = Math.round(
      ((monthTotal - previousMonthWorkedTotal) / previousMonthWorkedTotal) * 100,
    );

    if (Math.abs(diffPct) < 1) {
      return {
        label: 'Flat vs last month',
        icon: 'remove-outline' as const,
        color: Colors.textSecondary,
        bg: 'rgba(255,255,255,0.08)',
      };
    }

    if (diffPct > 0) {
      return {
        label: `+${diffPct}%`,
        icon: 'trending-up' as const,
        color: Colors.success,
        bg: 'rgba(74, 222, 128, 0.1)',
      };
    }

    return {
      label: `${diffPct}%`,
      icon: 'trending-down' as const,
      color: '#f87171',
      bg: 'rgba(248, 113, 113, 0.15)',
    };
  }, [monthTotal, previousMonthWorkedTotal]);

  const monthlyGoal = useMemo(() => {
    const monthlyGoals = goals.filter((g) => g.period === 'monthly');
    if (monthlyGoals.length === 0) return null;
    return monthlyGoals.find((g) => g.field === 'grossEarnings') ?? monthlyGoals[0];
  }, [goals]);

  const monthSummary = useMemo(() => summarizeShifts(monthWorkedShifts), [monthWorkedShifts]);

  const goalCurrentValue = useMemo(() => {
    if (!monthlyGoal) return 0;
    return Number(monthSummary[monthlyGoal.field]) || 0;
  }, [monthSummary, monthlyGoal]);

  const goalTarget = monthlyGoal?.target ?? null;
  const goalProgressPct = goalTarget ? Math.min((goalCurrentValue / goalTarget) * 100, 100) : 0;
  const goalRemaining = goalTarget ? Math.max(goalTarget - goalCurrentValue, 0) : 0;

  const goalDisplayLabel = useMemo(() => {
    if (!monthlyGoal) return 'your goal';
    const raw = monthlyGoal.label?.trim() ?? '';
    const tooGeneric = /^(month|monthly|week|weekly|day|daily)$/i.test(raw);
    if (!raw || tooGeneric) {
      return `Monthly ${getGoalFieldLabel(monthlyGoal.field)} goal`;
    }
    return raw;
  }, [monthlyGoal]);

  const payPeriod = useMemo(
    () => getPayPeriodForDate(user?.payPeriodAnchor ?? DEFAULT_PAY_PERIOD_ANCHOR, new Date()),
    [user?.payPeriodAnchor],
  );

  const firstName = user?.name?.split(' ')[0] || 'User';
  const isFirstRun = shifts.length === 0;

  const avgEarnings = useMemo(() => {
    const completed = shifts.filter((s) => s.date <= todayStr && hasCashoutData(s));
    if (completed.length === 0) return 0;
    const total = completed.reduce((sum, s) => sum + s.grossEarnings, 0);
    return total / completed.length;
  }, [shifts, todayStr]);

  const insight = useMemo(() => {
    if (monthShifts.length === 0) return 'No shifts this month yet.';

    const workedCount = monthWorkedShifts.length;
    const scheduledCount = monthShifts.length;
    const workedText =
      scheduledCount > workedCount
        ? `${workedCount} out of ${scheduledCount} shifts worked`
        : `${workedCount} shift${workedCount === 1 ? '' : 's'} worked`;

    if (goalTarget && monthlyGoal) {
      if (goalRemaining <= 0) return `${workedText} · 🎯 ${goalDisplayLabel} hit.`;
      return `${workedText} · ${formatGoalValue(goalRemaining, monthlyGoal.field)} left to hit ${goalDisplayLabel}.`;
    }

    // Comparison insight (worked shifts only)
    const now = new Date();
    const thisPeriod = { start: subDays(now, 14), end: now };
    const lastPeriod = { start: subDays(now, 28), end: subDays(now, 15) };

    const thisPeriodTotal = shifts
      .filter(
        (s) =>
          s.date <= todayStr &&
          hasCashoutData(s) &&
          isWithinInterval(parseISO(s.date), thisPeriod),
      )
      .reduce((sum, s) => sum + s.grossEarnings, 0);

    const lastPeriodTotal = shifts
      .filter(
        (s) =>
          s.date <= todayStr &&
          hasCashoutData(s) &&
          isWithinInterval(parseISO(s.date), lastPeriod),
      )
      .reduce((sum, s) => sum + s.grossEarnings, 0);

    if (thisPeriodTotal > lastPeriodTotal && lastPeriodTotal > 0) {
      const pct = Math.round(((thisPeriodTotal - lastPeriodTotal) / lastPeriodTotal) * 100);
      return `${workedText} · 📈 Up ${pct}% from last period.`;
    }

    return `${workedText}.`;
  }, [monthShifts, monthWorkedShifts, goalTarget, goalRemaining, monthlyGoal, goalDisplayLabel, shifts, todayStr]);

  const weeklySummary = useMemo(() => {
    const periodWindow = { start: payPeriod.start, end: payPeriod.end };
    const periodShifts = shifts.filter(
      (s) =>
        s.date <= todayStr &&
        hasCashoutData(s) &&
        isWithinInterval(parseISO(s.date), periodWindow),
    );

    if (periodShifts.length === 0) return 'No worked shifts this pay period yet.';

    const total = periodShifts.reduce((sum, s) => sum + s.grossEarnings, 0);
    const count = periodShifts.length;

    const bestShift = [...periodShifts].sort((a, b) => b.grossEarnings - a.grossEarnings)[0];
    const distNote =
      periodShifts.length > 1 && bestShift.grossEarnings > total * 0.6
        ? `Most of your money came from ${format(parseISO(bestShift.date), 'EEEE')}.`
        : '';

    return `${count} shift${count > 1 ? 's' : ''} this pay period, $${Math.round(total)} total. ${distNote || 'Efficient.'}`;
  }, [shifts, payPeriod, todayStr]);

  const bestDayInPeriod = useMemo(() => {
    const periodWindow = { start: payPeriod.start, end: payPeriod.end };
    const periodShifts = shifts.filter(
      (s) =>
        s.date <= todayStr &&
        hasCashoutData(s) &&
        isWithinInterval(parseISO(s.date), periodWindow),
    );
    if (periodShifts.length === 0) return null;

    return [...periodShifts].sort((a, b) => b.grossEarnings - a.grossEarnings)[0].date;
  }, [shifts, payPeriod, todayStr]);

  const completedShifts = useMemo(
    () =>
      shifts
        .filter((s) => s.date <= todayStr && hasCashoutData(s))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [shifts, todayStr],
  );

  const upcomingShifts = useMemo(
    () =>
      shifts
        .filter((s) => s.date > todayStr && !hasCashoutData(s))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, todayStr],
  );

  const nextMoveText = useMemo(() => {
    if (monthWorkedShifts.length === 0) {
      return 'Log your first shift this month to unlock trend coaching.';
    }

    if (goalTarget && monthlyGoal && goalRemaining > 0) {
      const avgForGoal = monthWorkedShifts.length > 0 ? goalCurrentValue / monthWorkedShifts.length : 0;
      if (avgForGoal > 0 && ['tipsTotal', 'netTips', 'grossEarnings', 'sales'].includes(monthlyGoal.field)) {
        const shiftsNeeded = Math.max(1, Math.ceil(goalRemaining / avgForGoal));
        return `At current pace: ~${shiftsNeeded} more shift${shiftsNeeded === 1 ? '' : 's'} to hit ${goalDisplayLabel}.`;
      }
      return `You're ${formatGoalValue(goalRemaining, monthlyGoal.field)} away from ${goalDisplayLabel}.`;
    }

    if (upcomingShifts.length > 0) {
      const next = upcomingShifts[0];
      const when = format(parseISO(next.date), 'EEE, MMM d');
      const at = next.clockIn ? ` at ${fmt12h(next.clockIn)}` : '';
      return `Next up: ${when}${at}. Use Automatic Mode right after clock-out.`;
    }

    return 'No shift scheduled yet — add one now so your week has a target.';
  }, [
    monthWorkedShifts,
    goalTarget,
    monthlyGoal,
    goalRemaining,
    goalCurrentValue,
    goalDisplayLabel,
    upcomingShifts,
  ]);

  function renderShiftRow(shift: Shift) {
    const job = jobs.find((j) => j.id === shift.jobId);
    const hasData = hasCashoutData(shift);
    const showMeta = hasData && shift.date <= todayStr;
    const isUpcoming = !hasData && shift.date > todayStr;
    const baseline = avgEarnings > 0 ? avgEarnings : shift.grossEarnings;

    // Format time range for upcoming shifts
    const timeRange = shift.clockIn && shift.clockOut
      ? `${fmt12h(shift.clockIn)} - ${fmt12h(shift.clockOut)}`
      : null;

    return (
      <TouchableOpacity
        key={shift.id}
        style={[styles.shiftRow, isUpcoming && styles.shiftRowUpcoming]}
        onPress={() => router.push(`/shift/${shift.id}`)}
      >
        <View style={styles.shiftBadge}>
          <Ionicons
            name={isUpcoming ? 'time-outline' : 'cash-outline'}
            size={20}
            color={job?.color || Colors.accent}
          />
          <View style={[styles.shiftJobDot, { backgroundColor: job?.color || Colors.accent }]} />
        </View>

        <View style={styles.shiftMain}>
          <Text style={[styles.shiftDate, isUpcoming && styles.shiftDateUpcoming]}>
            {format(parseISO(shift.date), 'EEEE, MMM d')}
          </Text>
          {showMeta && (
            <Text style={styles.shiftMeta}>
              {shift.grossEarnings > baseline * 1.5
                ? '🔥 Carried the week'
                : shift.grossEarnings > baseline * 1.2
                ? '🚀 Big night'
                : shift.grossEarnings > baseline * 0.9
                ? '✅ Solid night'
                : shift.grossEarnings > baseline * 0.5
                ? '🧊 Light night'
                : 'Rough shift'}
            </Text>
          )}
          {isUpcoming && (
            <Text style={styles.shiftMeta}>
              {job?.position ? `${job.position}` : 'Scheduled'}
              {timeRange ? ` · ${timeRange}` : ''}
            </Text>
          )}
        </View>

        {!isUpcoming ? (
          <View style={styles.shiftRight}>
            <Text style={styles.shiftAmount}>{fmt(shift.grossEarnings)}</Text>
            <View style={styles.shiftTipsRow}>
              <Text style={styles.shiftTipsLabel}>{fmt(shift.tipsTotal)} tips</Text>
            </View>
          </View>
        ) : (
          <View style={styles.shiftRight}>
            <Text style={styles.scheduledLabel}>Scheduled</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.shiftUploadBtn}
          onPress={() =>
            router.push({
              pathname: '/shift/import',
              params: { shiftId: shift.id, date: shift.date },
            })
          }
        >
          <Ionicons name="camera-outline" size={14} color={Colors.textSecondary} />
        </TouchableOpacity>
        <Ionicons name="chevron-forward" size={14} color={Colors.textSubtle} />
      </TouchableOpacity>
    );
  }

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
              {monthTrend ? (
                <View style={[styles.moneyTrend, { backgroundColor: monthTrend.bg }]}>
                  <Ionicons name={monthTrend.icon} size={14} color={monthTrend.color} />
                  <Text style={[styles.trendText, { color: monthTrend.color }]}>
                    {monthTrend.label}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.insightLine}>{insight}</Text>

            {goalTarget ? (
              <>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${goalProgressPct}%` as DimensionValue },
                    ]}
                  />
                </View>
                <View style={styles.progressLabels}>
                  <Text style={styles.progressText}>
                    {Math.round(goalProgressPct)}% of {formatGoalValue(goalTarget, monthlyGoal?.field ?? null)} goal
                  </Text>
                  <Text style={styles.remainingText}>
                    {formatGoalValue(goalRemaining, monthlyGoal?.field ?? null)} left
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.nextMoveCard}>
            <Ionicons name="sparkles-outline" size={14} color={Colors.accentActive} />
            <Text style={styles.nextMoveText}>{nextMoveText}</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.uploadBtn}
              onPress={() => router.push('/shift/import')}
            >
              <View style={styles.uploadIconContainer}>
                <Ionicons name="camera" size={20} color={Colors.bg} />
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
                <Ionicons name="add" size={20} color={Colors.textPrimary} />
              </View>
              <View>
                <Text style={styles.addManualBtnTitle}>Manual Mode</Text>
                <Text style={styles.addManualBtnSubtitle}>Add Shift</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {isFirstRun && (
          <View style={styles.onboardingCard}>
            <Text style={styles.onboardingTitle}>Start in 3 quick steps</Text>
            <Text style={styles.onboardingStep}>1) Tap <Text style={styles.onboardingBold}>Automatic Mode</Text> and scan your first receipt</Text>
            <Text style={styles.onboardingStep}>2) Confirm totals and save the shift</Text>
            <Text style={styles.onboardingStep}>3) Set one monthly goal to track momentum</Text>
            <TouchableOpacity style={styles.onboardingCta} onPress={() => router.push('/shift/import')}>
              <Text style={styles.onboardingCtaText}>Scan first receipt</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.calendarSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{expanded ? 'Full Calendar' : '2-Week Pay Period'}</Text>
            <TouchableOpacity
              style={styles.calendarNavBtn}
              onPress={() => setExpanded(!expanded)}
            >
              <Text style={styles.calendarNavText}>
                {expanded ? 'Show Pay Period' : 'Show Month'}
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
            payPeriod={payPeriod}
            bestDay={bestDayInPeriod}
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
          <View style={styles.weeklyInsightWrapper}>
            <Ionicons name="flash" size={12} color={Colors.accentActive} />
            <Text style={styles.weeklyInsightText}>{weeklySummary}</Text>
          </View>
        </View>

        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>Shifts</Text>

          {completedShifts.length > 0 && <Text style={styles.shiftGroupTitle}>Completed</Text>}
          {completedShifts.slice(0, 12).map(renderShiftRow)}

          {upcomingShifts.length > 0 && <Text style={styles.shiftGroupTitle}>Upcoming</Text>}
          {upcomingShifts.slice(0, 12).map(renderShiftRow)}

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
                      <Text style={styles.modalShiftSub}>{fmt12h(shift.clockIn)} - {fmt12h(shift.clockOut)} · {shift.hours}h</Text>
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

function Calendar({ currentMonth, shifts, jobs, expanded, payPeriod, onSelectDate, bestDay }: {
  currentMonth: Date;
  shifts: Shift[];
  jobs: any[];
  expanded: boolean;
  payPeriod: { start: Date; end: Date; label: string };
  onSelectDate: (date: string) => void;
  bestDay: string | null;
}) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const gridStart = new Date(monthStart);
  while (gridStart.getDay() !== 0) gridStart.setDate(gridStart.getDate() - 1);
  const gridEnd = new Date(monthEnd);
  while (gridEnd.getDay() !== 6) gridEnd.setDate(gridEnd.getDate() + 1);

  const days = expanded
    ? eachDayOfInterval({ start: gridStart, end: gridEnd })
    : eachDayOfInterval({ start: payPeriod.start, end: payPeriod.end });

  const dayLabels = expanded
    ? DAYS
    : Array.from({ length: 7 }, (_, i) => DAYS[(payPeriod.start.getDay() + i) % 7]);

  return (
    <View style={styles.calendarGridContainer}>
      <View style={styles.dayLabels}>
        {dayLabels.map((d) => (
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

          const rangeStyle = getEarningsRangeStyle(total);
          const isBest = dateStr === bestDay && !expanded;

          return (
            <Pressable
              key={dateStr}
              style={[
                styles.dayCell,
                expanded ? styles.dayCellExpanded : styles.dayCellCompact,
                !isCurrMonth && { opacity: 0.15 },
                isTdy && styles.todayCell,
                total > 0 && { backgroundColor: rangeStyle.bg },
                isBest && styles.bestDayCell,
              ]}
              onPress={() => onSelectDate(dateStr)}
            >
              <Text
                style={[
                  styles.dayNum,
                  isTdy && styles.todayNum,
                  total > 0 && { color: rangeStyle.dayNum },
                  isBest && styles.bestDayNum,
                ]}
              >
                {format(day, 'd')}
              </Text>
              {isBest && (
                <View style={styles.bestBadge}>
                  <Text style={styles.bestBadgeText}>BEST</Text>
                </View>
              )}
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
                <Text style={[styles.dayTotal, { color: rangeStyle.total }, isTdy && styles.todayTotal]}>
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
  nextMoveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  nextMoveText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  onboardingCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Spacing.md,
  },
  onboardingTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  onboardingStep: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  onboardingBold: {
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  onboardingCta: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  onboardingCtaText: {
    color: Colors.bg,
    fontWeight: '700',
    fontSize: FontSize.sm,
  },
  uploadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  uploadIconContainer: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBtnTitle: { fontSize: 13, fontWeight: '700', color: Colors.bg },
  uploadBtnSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.bg,
    marginTop: 2,
    lineHeight: 16,
  },
  addManualBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    gap: Spacing.sm,
  },
  addIconContainer: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addManualBtnTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  addManualBtnSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
    lineHeight: 16,
  },
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
  weeklyInsightWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    opacity: 0.9,
  },
  weeklyInsightText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  calendarGridContainer: {
    paddingHorizontal: Spacing.xs,
  },
  dayLabels: { flexDirection: 'row', marginBottom: Spacing.xs },
  dayLabel: { flex: 1, textAlign: 'center', fontSize: 11, color: Colors.textSubtle, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
    borderRadius: Radius.sm,
  },
  dayCellCompact: {
    height: 84,
  },
  dayCellExpanded: {
    aspectRatio: 0.95,
  },
  todayCell: { backgroundColor: 'rgba(255,255,255,0.04)' },
  bestDayCell: { borderWidth: 1, borderColor: '#34d399' },
  dayNum: { fontSize: FontSize.md, color: Colors.textSecondary, fontWeight: '700' },
  todayNum: { color: Colors.accentActive, fontWeight: '700' },
  bestDayNum: { color: '#d1fae5' },
  dotRow: { flexDirection: 'row', gap: 2, marginTop: 4 },
  bestBadge: {
    position: 'absolute',
    bottom: 2,
    backgroundColor: Colors.success,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  bestBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: Colors.bg,
  },
  dot: { width: 5, height: 5, borderRadius: Radius.full },
  dayTotal: { fontSize: 11, color: Colors.textSubtle, marginTop: 3, fontWeight: '700' },
  todayTotal: { fontWeight: '900' },
  recentSection: {
    paddingHorizontal: Spacing.md,
  },
  shiftGroupTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
  shiftUploadBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shiftAmount: { fontSize: FontSize.lg, color: Colors.textPrimary, fontWeight: '700' },
  shiftTipsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  shiftTipsLabel: { fontSize: 10, color: Colors.success, fontWeight: '700' },
  shiftRowUpcoming: {
    backgroundColor: 'rgba(255,255,255,0.01)',
    borderColor: 'rgba(255,255,255,0.03)',
  },
  shiftDateUpcoming: {
    color: Colors.textSecondary,
  },
  scheduledLabel: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
    fontWeight: '600',
  },
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
