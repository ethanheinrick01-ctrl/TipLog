/**
 * app/shift/import.tsx
 *
 * Unified import screen — photograph Toast washout slips or HotSchedules
 * schedules, run GPT-4o OCR, review parsed results, save shifts.
 */
import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { defaultOcrAdapter, ToastReceiptData } from '../../lib/receiptImport';
import { defaultScheduleAdapter, HotSchedulesData, ParsedShift } from '../../lib/scheduleImport';
import { useShiftStore } from '../../store/shiftStore';
import { useAuthStore } from '../../store/authStore';
import { computeShift } from '../../lib/calculations';

export default function ImportShiftScreen() {
  const router = useRouter();
  const { saveShift } = useShiftStore();
  const { user } = useAuthStore();

  const [mode, setMode] = useState<'cashout' | 'schedule'>('cashout');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cashout result
  const [cashoutResult, setCashoutResult] = useState<ToastReceiptData | null>(null);

  // Schedule result
  const [scheduleResult, setScheduleResult] = useState<HotSchedulesData | null>(null);
  const [savedShifts, setSavedShifts] = useState<Set<number>>(new Set());

  // ─── Pick images ────────────────────────────────────────────────────────────

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Grant photo access in Settings.');
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
      Alert.alert('Permission needed', 'Grant camera access.');
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
      Alert.alert('Nothing to save', 'Process a receipt first.');
      return;
    }
    if (!user?.id) {
      Alert.alert('Not signed in', 'Sign in to save shifts.');
      return;
    }
    try {
      const shift = buildCashoutShift(cashoutResult);
      await saveShift(user.id, shift);
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    }
  }

  function handleOpenCashoutForm() {
    if (!cashoutResult?.success) return;
    const shiftData = buildCashoutShift(cashoutResult);
    useShiftStore.getState().setPendingShift(shiftData);
    router.push('/shift/new');
  }

  // ─── Schedule actions ─────────────────────────────────────────────────────────

  async function handleSaveShift(shiftIndex: number) {
    if (!scheduleResult?.success) return;
    if (!user?.id) {
      Alert.alert('Not signed in', 'Sign in to save shifts.');
      return;
    }
    try {
      const parsed = scheduleResult.shifts[shiftIndex];
      const shift = buildScheduleShift(parsed);
      await saveShift(user.id, shift);
      setSavedShifts((prev) => new Set([...prev, shiftIndex]));
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    }
  }

  async function handleSaveAllShifts() {
    if (!scheduleResult?.success) return;
    if (!user?.id) {
      Alert.alert('Not signed in', 'Sign in to save shifts.');
      return;
    }
    try {
      for (let i = 0; i < scheduleResult.shifts.length; i++) {
        await saveShift(user.id, buildScheduleShift(scheduleResult.shifts[i]));
        setSavedShifts((prev) => new Set([...prev, i]));
      }
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Unknown error');
    }
  }

  // ─── Reset on mode change ───────────────────────────────────────────────────

  function handleModeChange(newMode: 'cashout' | 'schedule') {
    setMode(newMode);
    setSelectedImages([]);
    setCashoutResult(null);
    setScheduleResult(null);
    setError(null);
    setSavedShifts(new Set());
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function buildCashoutShift(r: ToastReceiptData) {
    const tipOutByCategory = r.tipOutByCategory ?? {};
    const computed = computeShift({
      tipsCash: r.tipsCash ?? 0,
      tipsCredit: r.tipsCredit ?? 0,
      sales: r.sales ?? 0,
      covers: r.covers ?? 0,
      tipOutByCategory,
      clockIn: r.clockIn ?? '',
      clockOut: r.clockOut ?? '',
    });
    return {
      date: r.date ?? new Date().toISOString().slice(0, 10),
      jobId: '',
      clockIn: r.clockIn ?? '17:00',
      clockOut: r.clockOut ?? '23:00',
      tipsCash: r.tipsCash ?? 0,
      tipsCredit: r.tipsCredit ?? 0,
      sales: r.sales ?? 0,
      covers: r.covers ?? 0,
      tipOutByCategory,
      tipIn: 0,
      wage: 2.13,
      serviceCharge: 0,
      mileage: 0,
      notes: '',
      expenses: [],
      ...computed,
    };
  }

  function buildScheduleShift(p: ParsedShift) {
    const computed = computeShift({
      tipsCash: 0,
      tipsCredit: 0,
      sales: 0,
      covers: 0,
      tipOutByCategory: {},
      clockIn: p.clockIn,
      clockOut: p.clockOut,
    });
    return {
      date: p.date,
      jobId: '',
      clockIn: p.clockIn,
      clockOut: p.clockOut,
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
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'schedule' && styles.toggleBtnActive]}
            onPress={() => handleModeChange('schedule')}
          >
            <Text style={[styles.toggleBtnText, mode === 'schedule' && styles.toggleBtnTextActive]}>📅 Schedule</Text>
          </TouchableOpacity>
        </View>

        {/* Hint */}
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {mode === 'cashout'
              ? 'Photograph or select up to 3 Toast washout slips. GPT-4o will read all the numbers and pre-fill your shift.'
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
              <ActivityIndicator color={Colors.bg} />
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
            <ResultRow label="Clock In" value={cashoutResult.clockIn} />
            <ResultRow label="Clock Out" value={cashoutResult.clockOut} />
            <ResultRow label="Credit Tips" value={cashoutResult.tipsCredit} prefix="$" />
            <ResultRow label="Cash Tips" value={cashoutResult.tipsCash} prefix="$" />
            <ResultRow label="3% Tax Withheld" value={cashoutResult.tipsWithheld} prefix="$" />
            <ResultRow label="Total Sales" value={cashoutResult.sales} prefix="$" />
            <ResultRow label="Covers" value={cashoutResult.covers} />
            {cashoutResult.tipOutByCategory && Object.keys(cashoutResult.tipOutByCategory).length > 0 && (
              <>
                <Text style={styles.sectionHeader}>Tip-Out Breakdown</Text>
                {Object.entries(cashoutResult.tipOutByCategory).map(([key, val]) => (
                  <ResultRow key={key} label={fmtCat(key)} value={val} prefix="$" />
                ))}
              </>
            )}
            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveCashout}>
                <Text style={styles.saveBtnText}>Save Shift</Text>
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
                    {fmtDate(shift.date)} · {shift.clockIn}–{shift.clockOut}
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
}: {
  label: string;
  value: number | string | undefined;
  prefix?: string;
}) {
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>
        {prefix}{typeof value === 'number' ? value.toFixed(2) : value}
      </Text>
    </View>
  );
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { padding: Spacing.md },
  toggleRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  toggleBtn: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  toggleBtnActive: { backgroundColor: Colors.accent },
  toggleBtnText: { fontWeight: '700', fontSize: FontSize.md, color: Colors.accent },
  toggleBtnTextActive: { color: Colors.bg },
  hint: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  hintText: { color: Colors.textSecondary, fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
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
});
