import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  parseISO,
  isWithinInterval,
  subMonths,
  subDays,
} from 'date-fns';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useShiftStore } from '../../store/shiftStore';
import { useAuthStore } from '../../store/authStore';
import {
  summarizeShifts,
  fmt,
  fmtPct,
  buildForecast,
  getPayPeriodForDate,
  getPreviousPayPeriod,
  DEFAULT_PAY_PERIOD_ANCHOR,
} from '../../lib/calculations';

type PTab = 'payperiod' | 'week' | 'month' | 'year';
type MainTab = 'stats' | 'forecast';

export default function AnalyticsScreen() {
  const { shifts } = useShiftStore();
  const { user } = useAuthStore();
  const anchor = user?.payPeriodAnchor ?? DEFAULT_PAY_PERIOD_ANCHOR;

  const [mainTab, setMainTab] = useState<MainTab>('stats');
  const [period, setPeriod] = useState<PTab>('payperiod');

  const now = new Date();
  // todayStr uses local date components — toISOString() would flip at 7 PM CST (UTC-5)
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentPP = useMemo(() => getPayPeriodForDate(anchor, new Date()), [anchor, todayStr]);
  const prevPP = useMemo(() => getPreviousPayPeriod(anchor, new Date()), [anchor, todayStr]);

  const filtered = useMemo(() => {
    let start: Date, end: Date;
    if (period === 'payperiod') {
      start = currentPP.start;
      end = currentPP.end;
    } else if (period === 'week') {
      start = startOfWeek(now, { weekStartsOn: 4 }); // Thursday anchor
      end = endOfWeek(now, { weekStartsOn: 4 });
    } else if (period === 'month') {
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else {
      start = startOfYear(now);
      end = endOfYear(now);
    }
    return shifts.filter((s) =>
      isWithinInterval(parseISO(s.date), { start, end }),
    );
  }, [shifts, period, currentPP]);

  // Previous pay period data (for comparison)
  const prevFiltered = useMemo(() =>
    shifts.filter((s) =>
      isWithinInterval(parseISO(s.date), { start: prevPP.start, end: prevPP.end }),
    ),
    [shifts, prevPP],
  );

  const summary = useMemo(() => summarizeShifts(filtered), [filtered]);
  const prevSummary = useMemo(() => summarizeShifts(prevFiltered), [prevFiltered]);
  const forecast = useMemo(() => buildForecast(shifts), [shifts]);

  const barData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const mo = subMonths(now, 5 - i);
      const start = startOfMonth(mo);
      const end = endOfMonth(mo);
      const total = shifts
        .filter((s) => isWithinInterval(parseISO(s.date), { start, end }))
        .reduce((sum, s) => sum + s.grossEarnings, 0);
      return { label: format(mo, 'MMM'), value: total };
    });
  }, [shifts, todayStr]);

  const maxBar = Math.max(...barData.map((b) => b.value), 1);

  const periodLabel =
    period === 'payperiod'
      ? currentPP.label
      : period === 'week'
      ? `Week of ${format(startOfWeek(now, { weekStartsOn: 4 }), 'MMM d')}`
      : period === 'month'
      ? format(now, 'MMMM yyyy')
      : format(now, 'yyyy');

  // Delta vs previous pay period (only shown on payperiod tab)
  const delta = summary.grossEarnings - prevSummary.grossEarnings;
  const deltaPositive = delta >= 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Analytics</Text>
        </View>

        {/* Stats | Forecast */}
        <View style={styles.mainTabs}>
          {(['stats', 'forecast'] as MainTab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.mainTab, mainTab === t && styles.mainTabActive]}
              onPress={() => setMainTab(t)}
            >
              <Text style={[styles.mainTabText, mainTab === t && styles.mainTabTextActive]}>
                {t === 'stats' ? 'Stats' : 'Forecast'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mainTab === 'stats' ? (
          <>
            {/* Period sub-tabs */}
            <View style={styles.tabs}>
              {([
                { key: 'payperiod', label: 'Pay Period' },
                { key: 'week', label: 'Week' },
                { key: 'month', label: 'Month' },
                { key: 'year', label: 'Year' },
              ] as { key: PTab; label: string }[]).map(({ key, label }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.tab, period === key && styles.tabActive]}
                  onPress={() => setPeriod(key)}
                >
                  <Text style={[styles.tabText, period === key && styles.tabTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.periodLabel}>{periodLabel}</Text>

            {/* Pay period comparison banner */}
            {period === 'payperiod' && prevSummary.shifts > 0 && (
              <View style={styles.compareBanner}>
                <Ionicons
                  name={deltaPositive ? 'trending-up' : 'trending-down'}
                  size={18}
                  color={deltaPositive ? Colors.success : Colors.error}
                />
                <Text style={styles.compareText}>
                  {deltaPositive ? '+' : ''}{fmt(delta)} vs last period
                  <Text style={styles.compareSubText}> ({prevPP.label})</Text>
                </Text>
              </View>
            )}

            {/* Hero */}
            <View style={styles.heroCard}>
              <Text style={styles.heroLabel}>Total Earnings</Text>
              <Text style={styles.heroValue}>{fmt(summary.grossEarnings)}</Text>
              <View style={styles.heroRow}>
                <Stat label="Shifts" value={String(summary.shifts)} />
                <Stat label="Hours" value={summary.hours.toFixed(1)} />
                <Stat label="$/hr" value={fmt(summary.hourlyAvg)} />
              </View>
            </View>

            {/* Previous period mini-card (pay period only) */}
            {period === 'payperiod' && (
              <>
                <Text style={styles.sectionTitle}>Previous Period  ·  {prevPP.label}</Text>
                <View style={styles.prevCard}>
                  <PrevStat label="Earnings" curr={summary.grossEarnings} prev={prevSummary.grossEarnings} isCurrency />
                  <PrevStat label="Tips" curr={summary.tipsTotal} prev={prevSummary.tipsTotal} isCurrency />
                  <PrevStat label="Shifts" curr={summary.shifts} prev={prevSummary.shifts} />
                  <PrevStat label="Tip %" curr={summary.tipPercent} prev={prevSummary.tipPercent} />
                </View>
              </>
            )}

            <Text style={styles.sectionTitle}>Tips</Text>
            <View style={styles.row}>
              <InfoCard label="Total Tips" value={fmt(summary.tipsTotal)} accent={Colors.accent} />
              <InfoCard label="Cash" value={fmt(summary.tipsCash)} accent={Colors.cash} />
              <InfoCard label="Credit" value={fmt(summary.tipsCredit)} accent={Colors.credit} />
            </View>

            <Text style={styles.sectionTitle}>Sales</Text>
            <View style={styles.row}>
              <InfoCard label="Sales" value={fmt(summary.sales)} accent={Colors.textSecondary} />
              <InfoCard label="Tip %" value={fmtPct(summary.tipPercent)} accent={Colors.accent} />
              <InfoCard label="Covers" value={String(summary.covers)} accent={Colors.textSecondary} />
            </View>

            <Text style={styles.sectionTitle}>Tip Flow</Text>
            <View style={styles.row}>
              <InfoCard label="Tip Out" value={fmt(summary.tipOut)} accent={Colors.error} />
              <InfoCard label="Tip In" value={fmt(summary.tipIn)} accent={Colors.success} />
              <InfoCard label="Net Tips" value={fmt(summary.netTips)} accent={Colors.accent} />
            </View>

            <Text style={styles.sectionTitle}>Last 6 Months</Text>
            <View style={styles.barChart}>
              {barData.map((item) => (
                <View key={item.label} style={styles.barGroup}>
                  <Text style={styles.barValue}>
                    {item.value > 0 ? `$${Math.round(item.value)}` : ''}
                  </Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.bar,
                        { height: Math.max((item.value / maxBar) * 120, item.value > 0 ? 4 : 0) },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{item.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Other</Text>
            <View style={styles.row}>
              <InfoCard label="Svc Charge" value={fmt(summary.serviceCharge)} accent={Colors.textSecondary} />
              <InfoCard label="Mileage" value={`${summary.mileage.toFixed(1)} mi`} accent={Colors.textSecondary} />
              <InfoCard label="Expenses" value={fmt(summary.expenseTotal)} accent={Colors.error} />
            </View>
          </>
        ) : (
          <ForecastView forecast={forecast} />
        )}

        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Pay period comparison row ────────────────────────────────────────────

function PrevStat({
  label,
  curr,
  prev,
  isCurrency,
}: {
  label: string;
  curr: number;
  prev: number;
  isCurrency?: boolean;
}) {
  const diff = curr - prev;
  const up = diff >= 0;
  const diffLabel = isCurrency
    ? (up ? '+' : '') + fmt(diff)
    : (up ? '+' : '') + diff.toFixed(1);

  return (
    <View style={styles.prevStat}>
      <Text style={styles.prevLabel}>{label}</Text>
      <Text style={styles.prevPrev}>{isCurrency ? fmt(prev) : prev.toFixed(1)}</Text>
      <Text style={[styles.prevDiff, { color: up ? Colors.success : Colors.error }]}>
        {diffLabel}
      </Text>
    </View>
  );
}

// ─── Forecast view ────────────────────────────────────────────────────────

function ForecastView({ forecast }: { forecast: ReturnType<typeof buildForecast> }) {
  if (!forecast) {
    return (
      <View style={styles.forecastEmpty}>
        <Text style={styles.forecastEmptyTitle}>Not enough data yet</Text>
        <Text style={styles.forecastEmptyBody}>
          Log at least 3 shifts to unlock your forecast. The model uses your last 90 days.
        </Text>
      </View>
    );
  }

  const maxDow = Math.max(...forecast.byDayOfWeek.map((d) => d.avgEarnings), 1);
  const maxTips = Math.max(...forecast.byDayOfWeek.map((d) => d.avgTips), 1);

  return (
    <>
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Projected Monthly Earnings</Text>
        <Text style={styles.heroValue}>{fmt(forecast.projectedMonthly)}</Text>
        <View style={styles.heroRow}>
          <Stat label="Per Week" value={fmt(forecast.projectedWeekly)} />
          <Stat label="Per Shift" value={fmt(forecast.avgPerShift)} />
          <Stat label="Shifts/Wk" value={forecast.shiftsPerWeek.toFixed(1)} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Day Insights</Text>
      <View style={styles.row}>
        <View style={[styles.insightCard, { borderColor: Colors.success + '44' }]}>
          <Text style={styles.insightEmoji}>🏆</Text>
          <Text style={[styles.insightDay, { color: Colors.success }]}>{forecast.bestDay.dayName}</Text>
          <Text style={styles.insightValue}>{fmt(forecast.bestDay.avgEarnings)}</Text>
          <Text style={styles.insightLabel}>avg/shift</Text>
        </View>
        <View style={[styles.insightCard, { borderColor: Colors.error + '44' }]}>
          <Text style={styles.insightEmoji}>📉</Text>
          <Text style={[styles.insightDay, { color: Colors.error }]}>{forecast.worstDay.dayName}</Text>
          <Text style={styles.insightValue}>{fmt(forecast.worstDay.avgEarnings)}</Text>
          <Text style={styles.insightLabel}>avg/shift</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Avg Earnings by Day</Text>
      <View style={styles.dowChart}>
        {forecast.byDayOfWeek.map((day) => (
          <View key={day.dayName} style={styles.dowGroup}>
            <Text style={styles.dowValue}>
              {day.avgEarnings > 0 ? `$${Math.round(day.avgEarnings)}` : ''}
            </Text>
            <View style={styles.dowTrack}>
              <View
                style={[
                  styles.dowBar,
                  {
                    height: Math.max((day.avgEarnings / maxDow) * 100, day.avgEarnings > 0 ? 4 : 0),
                    backgroundColor: day.dayName === forecast.bestDay.dayName ? Colors.success : Colors.accent,
                    opacity: day.shiftCount === 0 ? 0.15 : 1,
                  },
                ]}
              />
            </View>
            <Text style={styles.dowLabel}>{day.dayName}</Text>
            <Text style={styles.dowCount}>{day.shiftCount > 0 ? `${day.shiftCount}x` : '—'}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Avg Tips by Day</Text>
      <View style={styles.tipDowList}>
        {forecast.byDayOfWeek
          .filter((d) => d.shiftCount > 0)
          .sort((a, b) => b.avgTips - a.avgTips)
          .map((day) => (
            <View key={day.dayName} style={styles.tipDowRow}>
              <Text style={styles.tipDowDay}>{day.dayName}</Text>
              <View style={styles.tipDowBarWrap}>
                <View style={[styles.tipDowBar, { width: `${(day.avgTips / maxTips) * 100}%` }]} />
              </View>
              <Text style={styles.tipDowVal}>{fmt(day.avgTips)}</Text>
            </View>
          ))}
      </View>
    </>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={[styles.infoValue, { color: accent }]}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  titleRow: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, marginBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '700', color: Colors.textPrimary },
  mainTabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.sm,
  },
  mainTab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  mainTabActive: { backgroundColor: Colors.card },
  mainTabText: { fontSize: FontSize.md, color: Colors.textMuted, fontWeight: '600' },
  mainTabTextActive: { color: Colors.accent },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: 4,
    marginBottom: Spacing.sm,
  },
  tab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { fontSize: FontSize.xs, color: Colors.textMuted, fontWeight: '600' },
  tabTextActive: { color: Colors.bg },
  periodLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  compareBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  compareText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600' },
  compareSubText: { color: Colors.textMuted, fontWeight: '400' },
  heroCard: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  heroLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: 4 },
  heroValue: { fontSize: FontSize.hero, fontWeight: '800', color: Colors.accent, marginBottom: Spacing.md },
  heroRow: { flexDirection: 'row', gap: Spacing.xl },
  stat: { alignItems: 'center' },
  statValue: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  prevCard: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  prevStat: { flex: 1, alignItems: 'center' },
  prevLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: 4 },
  prevPrev: { fontSize: FontSize.sm, color: Colors.textSecondary },
  prevDiff: { fontSize: FontSize.sm, fontWeight: '700', marginTop: 2 },
  row: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  infoCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  infoValue: { fontSize: FontSize.lg, fontWeight: '700' },
  infoLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    height: 180,
  },
  barGroup: { alignItems: 'center', flex: 1 },
  barTrack: { width: 28, height: 120, justifyContent: 'flex-end', marginBottom: 4 },
  bar: { width: 28, backgroundColor: Colors.accent, borderRadius: 4 },
  barValue: { fontSize: 9, color: Colors.textMuted, marginBottom: 2, textAlign: 'center' },
  barLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  forecastEmpty: {
    margin: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  forecastEmptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  forecastEmptyBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  insightCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  insightEmoji: { fontSize: 24, marginBottom: 4 },
  insightDay: { fontSize: FontSize.lg, fontWeight: '800' },
  insightValue: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, marginTop: 4 },
  insightLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  dowChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    height: 175,
  },
  dowGroup: { alignItems: 'center', flex: 1 },
  dowValue: { fontSize: 9, color: Colors.textMuted, marginBottom: 2, textAlign: 'center' },
  dowTrack: { width: 24, height: 100, justifyContent: 'flex-end', marginBottom: 4 },
  dowBar: { width: 24, borderRadius: 4 },
  dowLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  dowCount: { fontSize: 9, color: Colors.textMuted, marginTop: 1 },
  tipDowList: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  tipDowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tipDowDay: { width: 32, fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '600' },
  tipDowBarWrap: { flex: 1, height: 8, backgroundColor: Colors.border, borderRadius: Radius.full, overflow: 'hidden' },
  tipDowBar: { height: 8, backgroundColor: Colors.accent, borderRadius: Radius.full },
  tipDowVal: { width: 52, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '700', textAlign: 'right' },
});
