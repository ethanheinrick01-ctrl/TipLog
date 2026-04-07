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
import { Shift, PeriodSummary } from '../../lib/types';

type PTab = 'payperiod' | 'week' | 'month' | 'year';
type MainTab = 'stats' | 'forecast';

// ─── Insight narrative ────────────────────────────────────────────────────

function getInsightText(summary: PeriodSummary, filtered: Shift[]): string {
  if (summary.shifts === 0) {
    return 'No shifts in this period yet. Log one to unlock trends.';
  }
  const bestGross = Math.max(...filtered.map((s) => s.grossEarnings));
  const concentrationRisk =
    summary.shifts > 1 &&
    summary.grossEarnings > 0 &&
    bestGross / summary.grossEarnings > 0.6;
  if (concentrationRisk) {
    const pct = Math.round((bestGross / summary.grossEarnings) * 100);
    return `${pct}% of earnings came from one shift - income spread is low.`;
  }
  if (summary.tipPercent >= 18) {
    return `${fmtPct(summary.tipPercent)} tip rate this period - above average.`;
  }
  if (summary.hourlyAvg >= 35) {
    return `${fmt(summary.hourlyAvg)}/hr - running high efficiency this period.`;
  }
  const avgPerShift = summary.grossEarnings / summary.shifts;
  return `${summary.shifts} shifts · ${fmt(summary.grossEarnings)} total · ${fmt(avgPerShift)} avg per shift.`;
}

function getHeroMicro(summary: PeriodSummary): string {
  if (summary.shifts === 0) return '';
  if (summary.hourlyAvg >= 35) return 'Efficient period';
  if (summary.shifts <= 2) return 'Low volume period';
  if (summary.tipPercent >= 18) return 'Strong tips';
  return 'On track';
}

export default function AnalyticsScreen() {
  const { shifts } = useShiftStore();
  const { user } = useAuthStore();
  const anchor = user?.payPeriodAnchor ?? DEFAULT_PAY_PERIOD_ANCHOR;

  const [mainTab, setMainTab] = useState<MainTab>('stats');
  const [period, setPeriod] = useState<PTab>('payperiod');

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentPP = useMemo(() => getPayPeriodForDate(anchor, new Date()), [anchor, todayStr]);
  const prevPP = useMemo(() => getPreviousPayPeriod(anchor, new Date()), [anchor, todayStr]);

  const filtered = useMemo(() => {
    let start: Date, end: Date;
    if (period === 'payperiod') {
      start = currentPP.start;
      end = currentPP.end;
    } else if (period === 'week') {
      start = startOfWeek(now, { weekStartsOn: 4 });
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
  const activeMonths = barData.filter((b) => b.value > 0).length;
  const highestMonth = barData.reduce(
    (best, b) => (b.value > best.value ? b : best),
    { label: '', value: 0 },
  );

  const periodLabel =
    period === 'payperiod'
      ? currentPP.label
      : period === 'week'
      ? `Week of ${format(startOfWeek(now, { weekStartsOn: 4 }), 'MMM d')}`
      : period === 'month'
      ? format(now, 'MMMM yyyy')
      : format(now, 'yyyy');

  const delta = summary.grossEarnings - prevSummary.grossEarnings;
  const deltaPositive = delta >= 0;
  const avgPerShift = summary.shifts > 0 ? summary.grossEarnings / summary.shifts : 0;
  const insightText = getInsightText(summary, filtered);
  const heroMicro = getHeroMicro(summary);

  // Chip thresholds
  const tipPctChip = summary.tipPercent >= 18 ? 'Strong tip %' : null;
  const tipOutChip =
    summary.shifts > 0 && summary.grossEarnings > 0 && summary.tipOut / summary.grossEarnings < 0.08
      ? 'Low tip-out'
      : null;
  const efficiencyChip = summary.hourlyAvg >= 35 ? 'High efficiency' : null;

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

            {/* Adaptive coach card */}
            <View style={styles.coachCard}>
              <View style={styles.coachHeaderRow}>
                <Ionicons name="sparkles-outline" size={15} color={Colors.accentActive} />
                <Text style={styles.coachHeaderText}>Coach Note</Text>
              </View>

              <Text style={styles.coachMainText}>{insightText}</Text>

              {period === 'payperiod' && (
                <View style={styles.coachDeltaRow}>
                  {prevSummary.shifts === 0 ? (
                    <Text style={styles.coachDeltaMuted}>First active pay period</Text>
                  ) : (
                    <>
                      <Ionicons
                        name={deltaPositive ? 'trending-up' : 'trending-down'}
                        size={16}
                        color={deltaPositive ? Colors.success : Colors.error}
                      />
                      <Text style={[styles.coachDeltaText, { color: deltaPositive ? Colors.success : Colors.error }]}> 
                        {deltaPositive ? '+' : ''}{fmt(delta)} vs last period ({prevPP.label})
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>

            {/* Total Earnings + 6-month graph as two separate bubbles */}
            <View style={styles.heroSplitRow}>
              <View style={styles.heroSplitBubble}>
                <Text style={styles.heroLabel}>Total Earnings</Text>
                <Text style={styles.heroValue}>{fmt(summary.grossEarnings)}</Text>
                <Text style={styles.heroSubtext}>
                  {summary.shifts} shifts · {summary.hours.toFixed(1)} hrs · {fmt(summary.hourlyAvg)}/hr
                </Text>
                {heroMicro.length > 0 && <Text style={styles.heroMicro}>{heroMicro}</Text>}
                {efficiencyChip && (
                  <View style={{ marginTop: Spacing.sm, alignSelf: 'flex-start' }}>
                    <MicroChip label={efficiencyChip} color={Colors.success} />
                  </View>
                )}
              </View>

              <View style={styles.heroSplitBubble}>
                <View style={styles.heroChartHeader}>
                  <Text style={styles.heroChartTitle}>Last 6 Months</Text>
                  {activeMonths > 0 && (
                    <Text style={styles.heroChartBest}>
                      {highestMonth.label} ${Math.round(highestMonth.value)}
                    </Text>
                  )}
                </View>

                <View style={styles.heroMiniChart}>
                  {barData.map((item) => (
                    <View key={item.label} style={styles.heroMiniGroup}>
                      <View style={styles.heroMiniTrack}>
                        <View
                          style={[
                            styles.heroMiniBar,
                            {
                              height: Math.max((item.value / maxBar) * 72, item.value > 0 ? 3 : 0),
                              backgroundColor:
                                item.value === highestMonth.value && item.value > 0
                                  ? Colors.accentActive
                                  : Colors.accent,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.heroMiniLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>

                {activeMonths <= 1 && (
                  <Text style={styles.heroChartHint}>More data appears as you log shifts.</Text>
                )}
              </View>
            </View>

            {/* Previous period mini-card (pay period only) */}
            {period === 'payperiod' && prevSummary.shifts > 0 && (
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

            {/* Highlights */}
            {summary.shifts > 0 && (
              <>
                <Text style={styles.sectionTitle}>Highlights</Text>
                <View style={styles.highlightsBox}>
                  <View style={styles.highlightItem}>
                    <Text style={styles.highlightValue}>{fmtPct(summary.tipPercent)}</Text>
                    <Text style={styles.highlightLabel}>Tip rate</Text>
                  </View>
                  <View style={styles.highlightDivider} />
                  <View style={styles.highlightItem}>
                    <Text style={styles.highlightValue}>{fmt(summary.tipOut)}</Text>
                    <Text style={styles.highlightLabel}>Total tip-out</Text>
                  </View>
                  <View style={styles.highlightDivider} />
                  <View style={styles.highlightItem}>
                    <Text style={styles.highlightValue}>{fmt(avgPerShift)}</Text>
                    <Text style={styles.highlightLabel}>Avg/shift</Text>
                  </View>
                </View>
              </>
            )}

            {/* Income */}
            <Text style={styles.sectionTitle}>Income</Text>
            <View style={styles.row}>
              <InfoCard label="Total Tips" value={fmt(summary.tipsTotal)} accent={Colors.accent} />
              <CashCreditCard cash={summary.tipsCash} credit={summary.tipsCredit} />
              <InfoCard label="Avg/Shift" value={fmt(avgPerShift)} accent={Colors.textSecondary} />
            </View>

            {/* Performance */}
            <Text style={styles.sectionTitle}>Performance</Text>
            <View style={styles.row}>
              <InfoCard label="Sales" value={fmt(summary.sales)} accent={Colors.textSecondary} />
              <InfoCard
                label="Tip %"
                value={fmtPct(summary.tipPercent)}
                accent={Colors.accent}
                chip={tipPctChip ?? undefined}
              />
              <InfoCard label="Covers" value={String(summary.covers)} accent={Colors.textSecondary} />
            </View>

            {/* Damage */}
            <Text style={styles.sectionTitle}>Damage</Text>
            <View style={styles.row}>
              <InfoCard
                label="Tip Out"
                value={fmt(summary.tipOut)}
                accent={Colors.error}
                chip={tipOutChip ?? undefined}
              />
              <InfoCard label="Net Tips" value={fmt(summary.netTips)} accent={Colors.accent} />
            </View>

            {/* Other */}
            <Text style={styles.sectionTitle}>Other</Text>
            <View style={styles.row}>
              <InfoCard label="Svc Charge" value={fmt(summary.serviceCharge)} accent={Colors.textSecondary} />
              <InfoCard label="Tip In" value={fmt(summary.tipIn)} accent={Colors.success} />
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
            <Text style={styles.dowCount}>{day.shiftCount > 0 ? `${day.shiftCount}x` : '-'}</Text>
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

// ─── Shared components ────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MicroChip({ label, color }: { label: string; color?: string }) {
  const c = color ?? Colors.accentActive;
  return (
    <View style={[styles.microChip, { borderColor: c + '55', backgroundColor: c + '1a' }]}>
      <Text style={[styles.microChipText, { color: c }]}>{label}</Text>
    </View>
  );
}

function InfoCard({
  label,
  value,
  accent,
  chip,
}: {
  label: string;
  value: string;
  accent: string;
  chip?: string;
}) {
  return (
    <View style={styles.infoCard}>
      <Text style={[styles.infoValue, { color: accent }]}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
      {chip && (
        <View style={{ marginTop: Spacing.xs }}>
          <MicroChip label={chip} color={accent} />
        </View>
      )}
    </View>
  );
}

function CashCreditCard({ cash, credit }: { cash: number; credit: number }) {
  return (
    <View style={styles.infoCard}>
      <View style={styles.cashCreditRow}>
        <Text style={[styles.infoValueSm, { color: Colors.cash }]}>{fmt(cash)}</Text>
        <Text style={styles.cashCreditSlash}>/</Text>
        <Text style={[styles.infoValueSm, { color: Colors.credit }]}>{fmt(credit)}</Text>
      </View>
      <Text style={styles.infoLabel}>Cash / Credit</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  titleRow: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, marginBottom: Spacing.sm },
  title: { fontSize: FontSize.xxl, fontWeight: '600', color: Colors.textPrimary },
  mainTabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  mainTab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  mainTabActive: { backgroundColor: Colors.card },
  mainTabText: { fontSize: FontSize.md, color: Colors.textMuted, fontWeight: '500' },
  mainTabTextActive: { color: Colors.accentActive },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  tab: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { fontSize: FontSize.xs, color: Colors.textSubtle, fontWeight: '500' },
  tabTextActive: { color: Colors.textPrimary },
  periodLabel: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
  },
  coachCard: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  coachHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  coachHeaderText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  coachMainText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  coachDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
  },
  coachDeltaText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  coachDeltaMuted: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  // Insight block
  insightBlock: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  insightBlockText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  // Compare banner
  compareBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  compareText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '500' },
  compareSubText: { color: Colors.textSubtle, fontWeight: '400' },
  compareContextLabel: {
    fontSize: FontSize.xs,
    fontWeight: '500',
    marginTop: 2,
  },
  // Hero
  heroCard: {
    margin: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
  },
  heroLabel: { fontSize: FontSize.sm, color: Colors.textMuted, marginBottom: Spacing.xs },
  heroValue: { fontSize: FontSize.hero, fontWeight: '600', color: Colors.accentActive, marginBottom: Spacing.xs },
  heroSubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    marginBottom: Spacing.xs,
  },
  heroMicro: {
    fontSize: FontSize.xs,
    color: Colors.textSubtle,
    fontStyle: 'italic',
    marginBottom: Spacing.xs,
  },
  heroRow: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.sm },
  heroSplitRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  heroSplitBubble: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  heroChartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  heroChartTitle: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    fontWeight: '600',
  },
  heroChartBest: {
    fontSize: 11,
    color: Colors.accentActive,
    fontWeight: '600',
  },
  heroMiniChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 92,
  },
  heroMiniGroup: {
    flex: 1,
    alignItems: 'center',
  },
  heroMiniTrack: {
    width: 14,
    height: 72,
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  heroMiniBar: {
    width: 14,
    borderRadius: Radius.micro,
  },
  heroMiniLabel: {
    fontSize: 10,
    color: Colors.textSubtle,
  },
  heroChartHint: {
    marginTop: 4,
    fontSize: 10,
    color: Colors.textSubtle,
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary },
  statLabel: { fontSize: FontSize.xs, color: Colors.textSubtle, marginTop: 2 },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingRight: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  // Highlights box
  highlightsBox: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  highlightItem: { flex: 1, alignItems: 'center' },
  highlightValue: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary },
  highlightLabel: { fontSize: FontSize.xs, color: Colors.textSubtle, marginTop: 2 },
  highlightDivider: {
    width: 1,
    backgroundColor: Colors.borderSubtle,
    marginVertical: 2,
  },
  // Prev period card
  prevCard: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  prevStat: { flex: 1, alignItems: 'center' },
  prevLabel: { fontSize: FontSize.xs, color: Colors.textSubtle, marginBottom: Spacing.xs },
  prevPrev: { fontSize: FontSize.sm, color: Colors.textSecondary },
  prevDiff: { fontSize: FontSize.sm, fontWeight: '600', marginTop: 2 },
  // Info cards
  row: { flexDirection: 'row', paddingHorizontal: Spacing.md, gap: Spacing.sm },
  infoCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  infoValue: { fontSize: FontSize.lg, fontWeight: '600' },
  infoValueSm: { fontSize: FontSize.md, fontWeight: '600' },
  infoLabel: { fontSize: FontSize.xs, color: Colors.textSubtle, marginTop: Spacing.xs },
  cashCreditRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cashCreditSlash: { fontSize: FontSize.sm, color: Colors.textSubtle },
  // Micro chip
  microChip: {
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  microChipText: {
    fontSize: FontSize.xs,
    fontWeight: '500',
  },
  // Bar chart
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    height: 180,
  },
  barGroup: { alignItems: 'center', flex: 1 },
  barTrack: { width: 28, height: 120, justifyContent: 'flex-end', marginBottom: Spacing.xs },
  bar: { width: 28, backgroundColor: Colors.accent, borderRadius: Radius.micro },
  barValue: { fontSize: 9, color: Colors.textSubtle, marginBottom: 2, textAlign: 'center' },
  barLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  sparseHelper: {
    fontSize: FontSize.sm,
    color: Colors.textSubtle,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    fontStyle: 'italic',
  },
  highestMonthLabel: {
    fontSize: FontSize.xs,
    color: Colors.accentActive,
    fontWeight: '500',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  // Forecast
  forecastEmpty: {
    margin: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  forecastEmptyTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  forecastEmptyBody: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  insightCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  insightEmoji: { fontSize: 24, marginBottom: Spacing.xs },
  insightDay: { fontSize: FontSize.lg, fontWeight: '600' },
  insightValue: { fontSize: FontSize.xl, fontWeight: '600', color: Colors.textPrimary, marginTop: Spacing.xs },
  insightLabel: { fontSize: FontSize.xs, color: Colors.textSubtle },
  dowChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    height: 175,
  },
  dowGroup: { alignItems: 'center', flex: 1 },
  dowValue: { fontSize: 9, color: Colors.textSubtle, marginBottom: 2, textAlign: 'center' },
  dowTrack: { width: 24, height: 100, justifyContent: 'flex-end', marginBottom: Spacing.xs },
  dowBar: { width: 24, borderRadius: Radius.micro },
  dowLabel: { fontSize: FontSize.xs, color: Colors.textSecondary },
  dowCount: { fontSize: 9, color: Colors.textSubtle, marginTop: 1 },
  tipDowList: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  tipDowRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tipDowDay: { width: 32, fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  tipDowBarWrap: { flex: 1, height: 8, backgroundColor: Colors.borderSubtle, borderRadius: Radius.full, overflow: 'hidden' },
  tipDowBar: { height: 8, backgroundColor: Colors.accentActive, borderRadius: Radius.full },
  tipDowVal: { width: 52, fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: '600', textAlign: 'right' },
});
