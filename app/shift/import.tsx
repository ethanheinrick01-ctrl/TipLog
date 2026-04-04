/**
 * app/shift/import.tsx
 *
 * Receipt import screen — photograph a Toast washout slip,
 * run GPT-4o OCR, review parsed results, then open a pre-filled
 * ShiftForm or save directly.
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
  const [result, setResult] = useState<ToastReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Pick images ────────────────────────────────────────────────────────────

  async function pickImages() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Grant photo access in Settings to scan receipts.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 3,
      quality: 0.8,
      base64: true, // return base64 directly so we can use it on web without fetch()
    });
    if (!res.canceled && res.assets.length > 0) {
      setSelectedImages(res.assets.map((a) => a.base64 ?? a.uri));
      setResult(null);
      setError(null);
    }
  }

  async function snapPhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Grant camera access to photograph receipts.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,
    });
    if (!res.canceled && res.assets.length > 0) {
      setSelectedImages([res.assets[0].base64 ?? res.assets[0].uri]);
      setResult(null);
      setError(null);
    }
  }

  // ─── Run OCR ─────────────────────────────────────────────────────────────────

  async function handleProcess() {
    if (!selectedImages.length) return;
    setLoading(true);
    setError(null);
    try {
      const data = await defaultOcrAdapter.recognizeImages(selectedImages);
      setResult(data);
      if (!data.success) {
        setError(data.error ?? 'Failed to parse receipt');
      }
    } catch (e: any) {
      setError(e.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ─── Save shift from OCR result ──────────────────────────────────────────────

  function handleSave() {
    if (!result?.success || !user?.id) return;
    const shift = buildShiftFromResult(result);
    saveShift(user.id, shift);
    router.back();
  }

  // ─── Open pre-filled form ─────────────────────────────────────────────────────

  function handleOpenForm() {
    if (!result?.success) return;
    // Store in Zustand for the new shift screen to pick up
    const shiftData = buildShiftFromResult(result);
    useShiftStore.getState().setPendingShift(shiftData);
    router.push('/shift/new');
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Header hint */}
        {/* Mode toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'cashout' && styles.toggleBtnActive]}
            onPress={() => { setMode('cashout'); setSelectedImages([]); setResult(null); setError(null); }}
          >
            <Text style={[styles.toggleBtnText, mode === 'cashout' && styles.toggleBtnTextActive]}>💰 Cashout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, mode === 'schedule' && styles.toggleBtnActive]}
            onPress={() => { setMode('schedule'); setSelectedImages([]); setResult(null); setError(null); }}
          >
            <Text style={[styles.toggleBtnText, mode === 'schedule' && styles.toggleBtnTextActive]}>📅 Schedule</Text>
          </TouchableOpacity>
        </View>

        {/* Header hint */}
        <View style={styles.hint}>
          <Text style={styles.hintText}>
            {mode === 'cashout'
              ? 'Photograph or select up to 3 Toast washout slips. GPT-4o will read all the numbers and pre-fill your shift.'
              : 'Photograph or select your HotSchedules weekly view. GPT-4o will extract all shifts and pre-fill them.'}
          </Text>
        </View>

        {/* Image previews */}
        {selectedImages.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewScroll}>
            {selectedImages.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.preview} />
            ))}
          </ScrollView>
        )}

        {/* Pick buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btn} onPress={snapPhoto}>
            <Text style={styles.btnText}>📷 Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnOutline} onPress={pickImages}>
            <Text style={styles.btnOutlineText}>🖼 Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Process button */}
        {selectedImages.length > 0 && !result && (
          <TouchableOpacity
            style={[styles.processBtn, loading && styles.processBtnDisabled]}
            onPress={handleProcess}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <Text style={styles.processBtnText}>{mode === 'cashout' ? 'Process Receipt' : 'Process Schedule'}</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* OCR Result */}
        {result?.success && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>Receipt Parsed ✓</Text>

            <ResultRow label="Date" value={result.date} />
            <ResultRow label="Clock In" value={result.clockIn} />
            <ResultRow label="Clock Out" value={result.clockOut} />
            <ResultRow label="Credit Tips" value={result.tipsCredit} prefix="$" />
            <ResultRow label="Cash Tips" value={result.tipsCash} prefix="$" />
            <ResultRow label="3% Tax Withheld" value={result.tipsWithheld} prefix="$" />
            <ResultRow label="Total Sales" value={result.sales} prefix="$" />
            <ResultRow label="Covers" value={result.covers} />

            {result.tipOutByCategory && Object.keys(result.tipOutByCategory).length > 0 && (
              <>
                <Text style={styles.sectionHeader}>Tip-Out Breakdown</Text>
                {Object.entries(result.tipOutByCategory).map(([key, val]) => (
                  <ResultRow
                    key={key}
                    label={formatCategory(key)}
                    value={val}
                    prefix="$"
                  />
                ))}
              </>
            )}

            <View style={styles.resultActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save Shift</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editBtn} onPress={handleOpenForm}>
                <Text style={styles.editBtnText}>Edit Before Saving</Text>
              </TouchableOpacity>
            </View>
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

function formatCategory(key: string): string {
  const map: Record<string, string> = {
    busser: 'Busser',
    runner: 'Runner',
    bar: 'Bar',
    oyster: 'Oyster',
    expo: 'Expo',
    host: 'Host',
    foodRunner: 'Food Runner',
    support: 'Support',
    other: 'Other',
  };
  return map[key] ?? key;
}

function buildShiftFromResult(r: ToastReceiptData) {
  const tipsCredit = r.tipsCredit ?? 0;
  const tipsCash = r.tipsCash ?? 0;
  const sales = r.sales ?? 0;
  const covers = r.covers ?? 0;
  const tipOutByCategory = r.tipOutByCategory ?? {};

  const computed = computeShift({
    tipsCash,
    tipsCredit,
    sales,
    covers,
    tipOutByCategory,
    clockIn: r.clockIn ?? '',
    clockOut: r.clockOut ?? '',
  });

  return {
    date: r.date ?? new Date().toISOString().slice(0, 10),
    jobId: '',
    clockIn: r.clockIn ?? '17:00',
    clockOut: r.clockOut ?? '23:00',
    tipsCash,
    tipsCredit,
    sales,
    covers,
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
  btn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  btnText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.md },
  btnOutline: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  btnOutlineText: { color: Colors.accent, fontWeight: '700', fontSize: FontSize.md },
  processBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  processBtnDisabled: { opacity: 0.6 },
  processBtnText: { color: Colors.bg, fontWeight: '800', fontSize: FontSize.lg },
  errorCard: {
    backgroundColor: Colors.error + '22',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.error + '44',
    marginBottom: Spacing.md,
  },
  errorText: { color: Colors.error, fontSize: FontSize.sm },
  resultCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accentSoft,
  },
  resultTitle: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.accent, marginBottom: Spacing.md },
  sectionHeader: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  resultLabel: { fontSize: FontSize.md, color: Colors.textSecondary },
  resultValue: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  resultActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  saveBtn: {
    flex: 1,
    backgroundColor: Colors.success,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  saveBtnText: { color: Colors.bg, fontWeight: '800', fontSize: FontSize.md },
  editBtn: {
    flex: 1,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  editBtnText: { color: Colors.bg, fontWeight: '700', fontSize: FontSize.md },
  cancelBtn: { alignItems: 'center', padding: Spacing.md },
  cancelBtnText: { color: Colors.textMuted, fontSize: FontSize.md },
});
