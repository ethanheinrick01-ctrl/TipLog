/**
 * app/shift/import.tsx
 *
 * Unified import screen — photograph Toast washout slips or HotSchedules
 * schedules, run GPT-4o OCR, review parsed results, save shifts.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { defaultOcrAdapter, ToastReceiptData } from '../../lib/receiptImport';
import { defaultScheduleAdapter, HotSchedulesData, ParsedShift } from '../../lib/scheduleImport';
import { useShiftStore } from '../../store/shiftStore';
import { useAuthStore } from '../../store/authStore';
import { computeShift, fmt12h } from '../../lib/calculations';
import { showConfirm } from '../../lib/webAlert';
import { TIP_OUT_CATEGORIES } from '../../components/ShiftForm';
import { Shift } from '../../lib/types';

export default function ImportShiftScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ shiftId?: string; date?: string }>();
  const { saveShift, jobs, shifts } = useShiftStore();
  const { user } = useAuthStore();
  const targetShiftId = typeof params.shiftId === 'string' ? params.shiftId : undefined;
  const targetDateParam = typeof params.date === 'string' ? params.date : undefined;
  const targetShift = useMemo(
    () => (targetShiftId ? shifts.find((s) => s.id === targetShiftId) ?? null : null),
    [targetShiftId, shifts],
  );
  const lockCashoutMode = !!targetShiftId;
  const targetShiftDate = targetShift?.date ?? targetDateParam;
  // Use user's default job, or first available job, for imports that don't have a job set
  const defaultJobId = jobs[0]?.id ?? '';

  const [mode, setMode] = useState<'cashout' | 'schedule'>('cashout');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cashout result
  const [cashoutResult, setCashoutResult] = useState<ToastReceiptData | null>(null);
  const [cashTipsOverride, setCashTipsOverride] = useState<string>('');
  const [justSaved, setJustSaved] = useState(false);
  const [editingTipOuts, setEditingTipOuts] = useState(false);
  const [tipOutOverrides, setTipOutOverrides] = useState<Record<string, string>>({});
  // null = unanswered, true = yes, false = no
  const [hasRunner, setHasRunner] = useState<boolean | null>(null);
  const [hasBusser, setHasBusser] = useState<boolean | null>(null);

  // Schedule result
  const [scheduleResult, setScheduleResult] = useState<HotSchedulesData | null>(null);
  const [savedShifts, setSavedShifts] = useState<Set<number>>(new Set());

  // ─── Pick images ────────────────────────────────────────────────────────────

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      webAlert('Permission needed', 'Grant photo access in Settings.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.8,
      base64: true,
    });
    if (!res.canceled && res.assets.length > 0) {
      setSelectedImages(res.assets.map((a) => a.base64 ?? a.uri));
      setCashoutResult(null);
      setScheduleResult(null);
      setError(null);
      setSavedShifts(new Set());
    }
  }

  async function snapPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      webAlert('Permission needed', 'Grant camera access.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
    if (!res.canceled && res.assets.length > 0) {
      setSelectedImages([res.assets[0].base64 ?? res.assets[0].uri]);
      setCashoutResult(null);
      setScheduleResult(null);
      setError(null);
      setSavedShifts(new Set());
    }
  }

  // ─── Run OCR ─────────────────────────────────────────────────────────────────

  async function handleProcess() {
    if (!selectedImages.length) return;
    setLoading(true);
    setError(null);

    try {
      if (mode === 'cashout') {
        const data = await defaultOcrAdapter.recognizeImages(selectedImages);
        setCashoutResult(data);
        setCashTipsOverride('');
        // Initialize tip-out overrides from parsed data
        const cats = data.tipOutByCategory ?? {};
        const init: Record<string, string> = {};
        Object.entries(cats).forEach(([k, v]) => { init[k] = String(v ?? ''); });
        setTipOutOverrides(init);
        // Default runner/busser based on whether OCR found a value
        // If OCR detected a value → yes; otherwise prompt user (default no)
        const runnerAmt = cats.runner ?? 0;
        const busserAmt = cats.busser ?? 0;
        setHasRunner(runnerAmt > 0 ? true : false);
        setHasBusser(busserAmt > 0 ? true : false);
        if (!data.success) setError(data.error ?? 'Failed to parse receipt');
      } else {
        const data = await defaultScheduleAdapter.recognizeImages(selectedImages);
        setScheduleResult(data);
        setSavedShifts(new Set());
        if (!data.success) setError(data.error ?? 'Failed to parse schedule');
      }
    } catch (e: any) {
      setError(e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ─── Cashout actions ─────────────────────────────────────────────────────────

  async function handleSaveCashout() {
    if (!cashoutResult?.success) {
      webAlert('Nothing to save', 'Process a receipt first.');
      return;
    }
    if (!user?.id) {
      webAlert('Not signed in', 'Sign in to save shifts.');
      return;
    }
    if (cashoutResult.date && cashoutResult.date > new Date().toISOString().slice(0, 10)) {
      webAlert('Future Date', "You can't log shifts for dates that haven't happened yet.");
      return;
    }
    try {
      setSaving(true);
      const shift = buildCashoutShift(
        cashoutResult,
        parseFloat(cashTipsOverride || '0'),
        getEffectiveTipOuts(),
        targetShift,
        targetShiftDate,
      );
      await saveShift(user.id, shift);
      setSaving(false);
      setJustSaved(true); // navigate once React settles
    } catch (e: any) {
      setSaving(false);
      const msg = e instanceof Error ? e.message : (typeof e === 'string' ? e : 'Unknown error');
      webAlert('Save failed', msg);
    }
  }

  // Navigate after save settles
  useEffect(() => {
    if (justSaved) {
      setJustSaved(false);
      router.back();
    }
  }, [justSaved]);

  function handleOpenCashoutForm() {
    if (!cashoutResult?.success) return;
    const shiftData = buildCashoutShift(cashoutResult, parseFloat(cashTipsOverride || '0'), getEffectiveTipOuts());
    useShiftStore.getState().setPendingShift(shiftData);
    router.push('/shift/new');
  }

  // ─── Schedule actions ─────────────────────────────────────────────────────────

  async function handleSaveShift(shiftIndex: number) {
    if (!scheduleResult?.success) return;
    if (!user?.id) {
      webAlert('Not signed in', 'Sign in to save shifts.');
      return;
    }
    const parsed = scheduleResult.shifts[shiftIndex];
    // Schedule imports allow future dates — the whole point is upcoming shifts
    try {
      const shift = buildScheduleShift(parsed);
      await saveShift(user.id, shift);
      setSavedShifts((prev) => new Set([...prev, shiftIndex]));
    } catch (e: any) {
      webAlert('Save failed', e.message ?? 'Unknown error');
    }
  }

  async function handleSaveAllShifts() {
    if (!scheduleResult?.success) return;
    if (!user?.id) {
      webAlert('Not signed in', 'Sign in to save shifts.');
      return;
    }
    const count = scheduleResult.shifts.length;
    showConfirm(
      'Save All Shifts',
      `Add all ${count} shift${count !== 1 ? 's' : ''} to your log?`,
      async () => {
        try {
          for (let i = 0; i < scheduleResult!.shifts.length; i++) {
            await saveShift(user!.id, buildScheduleShift(scheduleResult!.shifts[i]));
            setSavedShifts((prev) => new Set([...prev, i]));
          }
        } catch (e: any) {
          webAlert('Save failed', e.message ?? 'Unknown error');
        }
      },
      'Save All',
    );
  }

  // ─── Reset on mode change ───────────────────────────────────────────────────

  function handleModeChange(newMode: 'cashout' | 'schedule') {
    setMode(newMode);
    setSelectedImages([]);
    setCashoutResult(null);
    setScheduleResult(null);
    setError(null);
    setSavedShifts(new Set());
    setCashTipsOverride('');
    setEditingTipOuts(false);
    setTipOutOverrides({});
    setHasRunner(null);
    setHasBusser(null);
  }

  /** Returns tip-out overrides with runner/busser zeroed if user said No */
  function getEffectiveTipOuts(): Record<string, string> {
    const result = { ...tipOutOverrides };
    if (hasRunner === false) result.runner = '0';
    if (hasBusser === false) result.busser = '0';
    return result;
  }

  function handleRunnerToggle(val: boolean) {
    setHasRunner(val);
    if (!val) setTipOutOverrides((prev) => ({ ...prev, runner: '0' }));
    else {
      // Restore OCR value if it had one
      const ocr = cashoutResult?.tipOutByCategory?.runner ?? 0;
      setTipOutOverrides((prev) => ({ ...prev, runner: String(ocr) }));
    }
  }

  function handleBusserToggle(val: boolean) {
    setHasBusser(val);
    if (!val) setTipOutOverrides((prev) => ({ ...prev, busser: '0' }));
    else {
      const ocr = cashoutResult?.tipOutByCategory?.busser ?? 0;
      setTipOutOverrides((prev) => ({ ...prev, busser: String(ocr) }));
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function buildCashoutShift(
    r: ToastReceiptData,
    cashTips = 0,
    overrides: Record<string, string> = {},
    existingShift?: Shift | null,
    forcedDate?: string,
  ) {
    // Use user-edited overrides if present, otherwise fall back to OCR values
    const tipOutByCategory: Record<string, number> = {};
    Object.entries(overrides).forEach(([k, v]) => { tipOutByCategory[k] = parseFloat(v) || 0; });
    if (Object.keys(tipOutByCategory).length === 0) {
      Object.entries(r.tipOutByCategory ?? {}).forEach(([k, v]) => { tipOutByCategory[k] = v ?? 0; });
    }
    const computed = computeShift({
      tipsCash: cashTips,
      tipsCredit: r.tipsCredit ?? existingShift?.tipsCredit ?? 0,
      tipsWithheld: r.tipsWithheld ?? existingShift?.tipsWithheld ?? 0,
      sales: r.sales ?? existingShift?.sales ?? 0,
      covers: r.covers ?? existingShift?.covers ?? 0,
      tipOutByCategory,
      clockIn: r.clockIn ?? existingShift?.clockIn ?? '',
      clockOut: r.clockOut ?? existingShift?.clockOut ?? '',
    });
    return {
      id: existingShift?.id,
      date: forcedDate ?? existingShift?.date ?? r.date ?? new Date().toISOString().slice(0, 10),
      jobId: existingShift?.jobId ?? defaultJobId,
      clockIn: r.clockIn ?? existingShift?.clockIn ?? '17:00',
      clockOut: r.clockOut ?? existingShift?.clockOut ?? '23:00',
      tipsCash: cashTips,
      tipsCredit: r.tipsCredit ?? existingShift?.tipsCredit ?? 0,
      tipsWithheld: r.tipsWithheld ?? existingShift?.tipsWithheld ?? 0,
      sales: r.sales ?? existingShift?.sales ?? 0,
      covers: r.covers ?? existingShift?.covers ?? 0,
      tipOutByCategory,
      tipIn: existingShift?.tipIn ?? 0,
      wage: existingShift?.wage ?? 2.13,
      serviceCharge: existingShift?.serviceCharge ?? 0,
      mileage: existingShift?.mileage ?? 0,
      notes: existingShift?.notes ?? '',
      expenses: existingShift?.expenses ?? [],
      ...computed,
    };
  }

  function buildScheduleShift(p: ParsedShift) {
    // Only record clock-in — actual end time varies, user fills it in after the shift
    const computed = computeShift({
      tipsCash: 0,
      tipsCredit: 0,
      sales: 0,
      covers: 0,
      tipOutByCategory: {},
      clockIn: p.clockIn,
      clockOut: '',
    });
    return {
      date: p.date,
      jobId: defaultJobId,
      clockIn: p.clockIn,
      clockOut: '',
      tipsCash: 0,
      tipsCredit: 0,
      sales: 0,
      covers: 0,
      tipOutByCategory: {},
      tipIn: 0,
      wage: 2.13,
      serviceCharge: 0,
      mileage: 0,
      notes: `Imported from HotSchedules — ${p.position}`,
      expenses: [],
      ...computed,
    };
  }

  const isCashoutDone = cashoutResult?.success;
  const isScheduleDone = scheduleResult?.success;
  const hasResult = isCashoutDone || isScheduleDone;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Mode toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'cashout' && styles.toggleBtnActive]}
            onPress={() => handleModeChange('cashout')}
          >
            <Text style={[styles.toggleBtnText, mode === 'cashout' && styles.toggleBtnTextActive]}>💰 Cashout</Text>
          </TouchableOpacity>
          {!lockCashoutMode && (
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'schedule' && styles.toggleBtnActive]}
              onPress={() => handleModeChange('schedule')}
            >
              <Text style={[styles.toggleBtnText, mode === 'schedule' && styles.toggleBtnTextActive]}>📅 Schedule</Text>
            </TouchableOpacity>
          )}
        </View>

        {targetShiftDate && (
          <View style={styles.targetShiftBanner}>
            <Text style={styles.targetShiftBannerText}>Uploading cashout for {fmtDateShort(targetShiftDate)}</Text>
          </View>
        )}

        {/* Hint */}
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {mode === 'cashout'
              ? targetShiftDate
                ? `Upload a Toast cashout for ${fmtDateShort(targetShiftDate)} and we'll update that shift.`
                : 'Photograph or select up to 3 Toast washout slips. GPT-4o will read all the numbers and pre-fill your shift.'
              : 'Photograph or select your HotSchedules weekly view. GPT-4o will extract all shifts and pre-fill them.'}
          </Text>
        </View>

        {/* Image previews */}
        {selectedImages.length > 0 && !hasResult && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroll}>
            {selectedImages.map((uri, i) => {
              // base64 strings need data URI prefix to render as images
              const src = uri.startsWith('data:') ? uri : `data:image/jpeg;base64,${uri}`;
              return <Image key={i} source={{ uri: src }} style={styles.preview} />;
            })}
          </ScrollView>
        )}

        {/* Pick buttons */}
        {!hasResult && (
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.btn} onPress={snapPhoto}>
              <Text style={styles.btnText}>📷 Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnOutline} onPress={pickImages}>
              <Text style={styles.btnOutlineText}>🖼 Gallery</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Process */}
        {selectedImages.length > 0 && !hasResult && (
          <TouchableOpacity
            style={[styles.processBtn, loading && styles.processBtnDisabled]}
            onPress={handleProcess}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.textPrimary} />
            ) : (
              <Text style={styles.processBtnText}>
                {mode === 'cashout' ? 'Process Receipt' : 'Process Schedule'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* ── Cashout result ────────────────────────────────────────────── */}
        {isCashoutDone && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Receipt Parsed ✓</Text>
            <ResultRow label="Date" value={cashoutResult.date} />
            <ResultRow label="Clock In" value={fmt12h(cashoutResult.clockIn ?? '')} />
            <ResultRow label="Clock Out" value={fmt12h(cashoutResult.clockOut ?? '')} />
            <ResultRow label="Credit Tips" value={cashoutResult.tipsCredit} prefix="$" />
            {/* Cash tips — Toast POS doesn't capture cash, user enters manually */}
            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Cash Tips</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: Colors.textMuted, fontSize: FontSize.xs }}>(not in POS)</Text>
                <TextInput
                  style={styles.cashTipsInput}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  value={cashTipsOverride}
                  onChangeText={setCashTipsOverride}
                />
              </View>
            </View>
            <ResultRow label="3% Tax Withheld" value={cashoutResult.tipsWithheld} prefix="$" />
            <ResultRow label="Total Sales" value={cashoutResult.sales} prefix="$" />
            <ResultRow label="Covers" value={cashoutResult.covers} />
            {/* Runner / Busser toggles — always shown after scan */}
            {isCashoutDone && (
              <View style={styles.staffToggles}>
                <Text style={styles.sectionHeader}>Support Staff This Shift?</Text>
                <StaffToggle
                  label="Food Runner"
                  value={hasRunner}
                  onToggle={handleRunnerToggle}
                />
                <StaffToggle
                  label="Busser"
                  value={hasBusser}
                  onToggle={handleBusserToggle}
                />
              </View>
            )}

            {(Object.keys(tipOutOverrides).length > 0 || editingTipOuts) && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm }}>
                  <Text style={styles.sectionHeader}>Tip-Out Breakdown</Text>
                  <TouchableOpacity onPress={() => setEditingTipOuts(!editingTipOuts)}>
                    <Text style={{ color: Colors.accent, fontWeight: '700', fontSize: FontSize.sm }}>
                      {editingTipOuts ? 'Done' : 'Edit'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {editingTipOuts ? (
                  // Editable fields for each category
                  <>
                    {TIP_OUT_CATEGORIES.map((cat) => (
                      <View key={cat.key} style={styles.tipOutRow}>
                        <Text style={styles.tipOutLabel}>{cat.label}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={{ color: Colors.textSecondary, fontSize: FontSize.md }}>$</Text>
                          <TextInput
                            style={styles.tipOutInput}
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                            keyboardType="decimal-pad"
                            value={tipOutOverrides[cat.key] ?? ''}
                            onChangeText={(v) => setTipOutOverrides((prev) => ({ ...prev, [cat.key]: v }))}
                          />
                        </View>
                      </View>
                    ))}
                  </>
                ) : (
                  // Read-only display from overrides
                  <>
                    {Object.entries(tipOutOverrides).map(([key, val]) => {
                      const num = parseFloat(val) || 0;
                      if (num === 0) return null;
                      return <ResultRow key={key} label={fmtCat(key)} value={num} prefix="$" />;
                    })}
                  </>
                )}
                <ResultRow
                  label="Total Tip Out"
                  value={Object.values(tipOutOverrides).reduce((s, v) => s + (parseFloat(v) || 0), 0)}
                  prefix="$"
                  bold
                />
              </>
            )}
            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCashout} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color={Colors.textPrimary} size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>{targetShift ? 'Update Shift' : 'Save Shift'}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.editBtn} onPress={handleOpenCashoutForm}>
                <Text style={styles.editBtnText}>Edit Before Saving</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Schedule result ─────────────────────────────────────────── */}
        {isScheduleDone && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>
              {scheduleResult.shifts.length} Shifts Found ✓
            </Text>
            {scheduleResult.employeeName && (
              <Text style={styles.resultSub}>{scheduleResult.employeeName}</Text>
            )}
            <Text style={styles.sectionHeader}>Shifts</Text>

            {scheduleResult.shifts.map((shift, i) => (
              <View key={i} style={styles.shiftRow}>
                <View style={styles.shiftInfo}>
                  <Text style={styles.shiftDate}>
                    {fmtDate(shift.date)} · {fmt12h(shift.clockIn)}–{fmt12h(shift.clockOut)}
                  </Text>
                  <Text style={styles.shiftPos}>{shift.position}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.shiftSaveBtn, savedShifts.has(i) && styles.shiftSavedBtn]}
                  onPress={() => handleSaveShift(i)}
                  disabled={savedShifts.has(i)}
                >
                  <Text style={styles.shiftSaveBtnText}>
                    {savedShifts.has(i) ? '✓ Saved' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              style={[styles.saveAllBtn, scheduleResult.shifts.length === 0 && styles.processBtnDisabled]}
              onPress={handleSaveAllShifts}
              disabled={scheduleResult.shifts.length === 0 || savedShifts.size === scheduleResult.shifts.length}
            >
              <Text style={styles.saveAllBtnText}>
                {savedShifts.size === scheduleResult.shifts.length
                  ? `All ${scheduleResult.shifts.length} Shifts Saved ✓`
                  : `Save All ${scheduleResult.shifts.length} Shifts`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ResultRow({
  label,
  value,
  prefix = '',
  bold,
}: {
  label: string;
  value: number | string | undefined;
  prefix?: string;
  bold?: boolean;
}) {
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.resultRow}>
      <Text style={[styles.resultLabel, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[styles.resultValue, bold && { fontWeight: '700' }]}>
        {prefix}{typeof value === 'number' ? value.toFixed(2) : value}
      </Text>
    </View>
  );
}

function StaffToggle({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean | null;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View style={styles.staffToggleRow}>
      <Text style={styles.staffToggleLabel}>{label}</Text>
      <View style={styles.staffToggleBtns}>
        <TouchableOpacity
          style={[styles.staffBtn, value === true && styles.staffBtnYes]}
          onPress={() => onToggle(true)}
        >
          <Text style={[styles.staffBtnText, value === true && styles.staffBtnTextActive]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.staffBtn, value === false && styles.staffBtnNo]}
          onPress={() => onToggle(false)}
        >
          <Text style={[styles.staffBtnText, value === false && styles.staffBtnTextActive]}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function webAlert(title: string, message?: string) {
  if (Platform.OS === 'web') {
    (window as any).alert(message ? `${title}\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

function fmtCat(key: string): string {
  const map: Record<string, string> = {
    busser: 'Busser', runner: 'Runner', bar: 'Bar', oyster: 'Oyster',
    expo: 'Expo', host: 'Host', foodRunner: 'Food Runner',
    support: 'Support', other: 'Other',
  };
  return map[key] ?? key;
}

function fmtDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function fmtDateShort(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md },
  toggleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  toggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  toggleBtnActive: { backgroundColor: Colors.accent },
  toggleBtnText: { fontWeight: '500', fontSize: FontSize.md, color: Colors.textSecondary },
  toggleBtnTextActive: { color: Colors.textPrimary },
  hint: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  hintText: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
  targetShiftBanner: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  targetShiftBannerText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewScroll: { marginBottom: Spacing.md },
  preview: { width: 160, height: 220, borderRadius: Radius.md, marginRight: Spacing.sm, backgroundColor: Colors.surface },
  buttonRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  btn: { flex: 1, backgroundColor: Colors.accent, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  btnText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.md },
  btnOutline: { flex: 1, backgroundColor: 'transparent', borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.accent },
  btnOutlineText: { color: Colors.accent, fontWeight: '700', fontSize: FontSize.md },
  processBtn: { backgroundColor: Colors.accent, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md },
  processBtnDisabled: { opacity: 0.6 },
  processBtnText: { color: Colors.bg, fontWeight: '800', fontSize: FontSize.lg },
  errorCard: { backgroundColor: Colors.error + '22', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.error + '44', marginBottom: Spacing.md },
  errorText: { color: Colors.error, fontSize: FontSize.sm },
  resultCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.accentSoft },
  resultTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.accent, marginBottom: Spacing.xs },
  resultSub: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.sm },
  sectionHeader: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  tipOutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: Spacing.xs },
  tipOutLabel: { fontSize: FontSize.md, color: Colors.textSecondary, flex: 1 },
  tipOutInput: {
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
    minWidth: 72,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cashTipsInput: {
    backgroundColor: Colors.card,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    fontWeight: '600',
    minWidth: 72,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  resultValue: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  resultActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  saveBtn: { flex: 1, backgroundColor: Colors.success, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  saveBtnText: { color: Colors.bg, fontWeight: '800', fontSize: FontSize.md },
  editBtn: { flex: 1, backgroundColor: Colors.accent, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center' },
  editBtnText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.md },
  // Schedule-specific
  shiftRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  shiftInfo: { flex: 1 },
  shiftDate: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  shiftPos: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  shiftSaveBtn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  shiftSavedBtn: { backgroundColor: Colors.success },
  shiftSaveBtnText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.sm },
  saveAllBtn: { backgroundColor: Colors.success, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  saveAllBtnText: { color: Colors.bg, fontWeight: '800', fontSize: FontSize.md },
  cancelBtn: { alignItems: 'center', padding: Spacing.md },
  cancelBtnText: { color: Colors.textMuted, fontSize: FontSize.md },
  // Staff toggles
  staffToggles: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  staffToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  staffToggleLabel: { fontSize: FontSize.md, color: Colors.textSecondary, flex: 1 },
  staffToggleBtns: { flexDirection: 'row', gap: 6 },
  staffBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  staffBtnYes: { borderColor: Colors.success, backgroundColor: Colors.success + '22' },
  staffBtnNo: { borderColor: Colors.error, backgroundColor: Colors.error + '22' },
  staffBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textMuted },
  staffBtnTextActive: { color: Colors.textPrimary },
});
