import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { showAlert, showConfirm } from '../../lib/webAlert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useEffect, useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { useShiftStore } from '../../store/shiftStore';
import { Job } from '../../lib/types';
import { randomUUID } from 'expo-crypto';
import {
  getPayPeriodForDate,
  DEFAULT_PAY_PERIOD_ANCHOR,
} from '../../lib/calculations';
import { format, parseISO, addDays, subDays } from 'date-fns';
import {
  requestNotificationPermission,
  scheduleShiftReminder,
  cancelShiftReminder,
} from '../../lib/notifications';
import { exportShiftsToCSV } from '../../lib/export';
import { supabase } from '../../lib/supabase';

const JOB_COLORS = [
  '#F5A623', '#FF6B6B', '#4ECDC4', '#45B7D1',
  '#96CEB4', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type AdminSignup = {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  confirmed: boolean;
  shiftsTotal: number;
  shiftsLast7d: number;
  shiftsLast30d: number;
  lastActivity?: string | null;
};

export default function SettingsScreen() {
  const { user, signOut } = useAuthStore();
  const { jobs, shifts, saveJob, deleteJob, sync, syncing } = useShiftStore();

  // Jobs
  const [addingJob, setAddingJob] = useState(false);
  const [jobName, setJobName] = useState('');
  const [jobPosition, setJobPosition] = useState('Server');
  const [jobWage, setJobWage] = useState('2.13');
  const [jobColor, setJobColor] = useState(JOB_COLORS[0]);

  // Notifications
  const [reminderEnabled, setReminderEnabled] = useState(user?.reminderEnabled ?? false);
  const [reminderTime, setReminderTime] = useState(user?.reminderTime ?? '23:00');
  const [notifSaving, setNotifSaving] = useState(false);

  // Pay week start (for weekly view)
  const [payWeekStart, setPayWeekStart] = useState(user?.payWeekStart ?? 1);
  const [weekSaving, setWeekSaving] = useState(false);

  // Pay period anchor
  const [anchorInput, setAnchorInput] = useState(
    user?.payPeriodAnchor ?? DEFAULT_PAY_PERIOD_ANCHOR,
  );
  const [anchorSaving, setAnchorSaving] = useState(false);
  const anchorPreview = useMemo(() => {
    try {
      const pp = getPayPeriodForDate(anchorInput, new Date());
      return `Current period: ${format(pp.start, 'EEE MMM d')} – ${format(pp.end, 'EEE MMM d')}`;
    } catch {
      return 'Invalid date';
    }
  }, [anchorInput]);

  // Export
  const [exporting, setExporting] = useState(false);

  // Admin: team signups
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSignups, setAdminSignups] = useState<AdminSignup[]>([]);
  const isAdmin = (user?.email ?? '').toLowerCase() === 'ethanheinrick01@gmail.com';

  useEffect(() => {
    setReminderEnabled(user?.reminderEnabled ?? false);
    setReminderTime(user?.reminderTime ?? '23:00');
    setPayWeekStart(user?.payWeekStart ?? 1);
    setAnchorInput(user?.payPeriodAnchor ?? DEFAULT_PAY_PERIOD_ANCHOR);
  }, [user]);

  useEffect(() => {
    if (isAdmin) {
      loadAdminSignups();
    }
  }, [isAdmin]);

  async function handleAnchorSave() {
    // Validate: must be a Thursday
    try {
      const d = parseISO(anchorInput);
      if (isNaN(d.getTime())) throw new Error();
      if (d.getDay() !== 4) {
        showAlert(
          'Must be a Thursday',
          `${format(d, 'EEEE MMM d')} is a ${format(d, 'EEEE')}. Pay periods start on Thursdays — pick the Thursday that started your last pay period.`,
        );
        return;
      }
    } catch {
      showAlert('Invalid Date', 'Enter a date in YYYY-MM-DD format.');
      return;
    }
    setAnchorSaving(true);
    try {
      if (user) {
        await supabase.from('users').update({ payPeriodAnchor: anchorInput }).eq('id', user.id);
      }
    } finally {
      setAnchorSaving(false);
    }
  }

  async function handleReminderToggle(val: boolean) {
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        showAlert('Permission Required', 'Allow notifications in Settings to enable shift reminders.');
        return;
      }
    }
    setReminderEnabled(val);
    await saveReminderPrefs(val, reminderTime);
  }

  async function saveReminderPrefs(enabled: boolean, time: string) {
    setNotifSaving(true);
    try {
      if (enabled) {
        await scheduleShiftReminder(time);
      } else {
        await cancelShiftReminder();
      }
      // Persist to Supabase
      if (user) {
        await supabase
          .from('users')
          .update({ reminderEnabled: enabled, reminderTime: time })
          .eq('id', user.id);
      }
    } catch (e) {
      console.warn('Reminder save error:', e);
    } finally {
      setNotifSaving(false);
    }
  }

  async function handleTimeChange(time: string) {
    setReminderTime(time);
    if (reminderEnabled) {
      await saveReminderPrefs(true, time);
    }
  }

  async function handlePayWeekChange(day: number) {
    setPayWeekStart(day);
    setWeekSaving(true);
    try {
      if (user) {
        await supabase
          .from('users')
          .update({ payWeekStart: day })
          .eq('id', user.id);
      }
    } finally {
      setWeekSaving(false);
    }
  }

  function handleAddJob() {
    if (!jobName.trim()) return;
    const job: Job = {
      id: randomUUID(),
      name: jobName.trim(),
      color: jobColor,
      position: jobPosition.trim() || 'Server',
      defaultWage: parseFloat(jobWage) || 2.13,
      createdAt: new Date().toISOString(),
    };
    saveJob(job);
    setJobName('');
    setJobPosition('Server');
    setJobWage('2.13');
    setAddingJob(false);
  }

  function confirmDeleteJob(job: Job) {
    const count = shifts.filter((s) => s.jobId === job.id).length;
    const msg = `Remove "${job.name}"? It has ${count} logged shift${count !== 1 ? 's' : ''}.`;
    showConfirm('Delete Job', msg, () => deleteJob(job.id), 'Delete');
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportShiftsToCSV(shifts, jobs);
    } catch (e: any) {
      showAlert('Export Failed', e.message ?? 'Unknown error');
    } finally {
      setExporting(false);
    }
  }

  async function loadAdminSignups() {
    if (!isAdmin) return;
    setAdminLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not signed in');
      }

      const projectRef = (process.env.EXPO_PUBLIC_SUPABASE_URL || '')
        .replace('https://', '')
        .replace('.supabase.co', '');
      const endpoint = `https://${projectRef}.supabase.co/functions/v1/admin-signups`;

      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          // Supabase gateway auth context
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
          // Real signed-in user JWT for the edge function to verify
          'x-user-token': session.access_token,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
      }

      const json = await res.json();
      setAdminSignups((json?.users ?? []) as AdminSignup[]);
    } catch (e: any) {
      showAlert('Admin load failed', e?.message ?? 'Could not load signups');
    } finally {
      setAdminLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        {/* ── Account ────────────────────────────────── */}
        <SectionLabel label="Account" />
        <View style={styles.card}>
          <Row icon="person-outline" label={user?.name ?? 'Unknown'} />
          <Sep />
          <Row icon="mail-outline" label={user?.email ?? ''} />
          <Sep />
          <TouchableOpacity onPress={() => user?.id && sync(user.id)} disabled={syncing}>
            <View style={styles.row}>
              {syncing
                ? <ActivityIndicator size="small" color={Colors.accent} style={{ marginRight: Spacing.sm }} />
                : <Ionicons name="cloud-upload-outline" size={20} color={Colors.accent} style={styles.rowIcon} />}
              <Text style={[styles.rowLabel, { color: Colors.accent }]}>
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Pay Week ───────────────────────────────── */}
        <SectionLabel label="Pay Week Starts On" />
        <View style={styles.card}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ padding: Spacing.sm }}>
            {DAY_NAMES.map((name, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.dayChip, payWeekStart === i && styles.dayChipActive]}
                onPress={() => handlePayWeekChange(i)}
              >
                <Text style={[styles.dayChipText, payWeekStart === i && styles.dayChipTextActive]}>
                  {name.slice(0, 3)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {weekSaving && <Text style={styles.saving}>Saving...</Text>}
        </View>

        {/* ── Pay Period Anchor ──────────────────────── */}
        <SectionLabel label="Pay Period Anchor" />
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={20} color={Colors.textSecondary} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Pay Period Start (Thursday)</Text>
              <Text style={styles.rowSub}>{anchorPreview}</Text>
            </View>
          </View>
          <Sep />
          <View style={[styles.row, { gap: Spacing.sm }]}>
            <TextInput
              style={[styles.timeInput, { flex: 1, width: undefined, textAlign: 'left', paddingHorizontal: Spacing.sm }]}
              value={anchorInput}
              onChangeText={setAnchorInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />
            <TouchableOpacity
              style={styles.anchorSaveBtn}
              onPress={handleAnchorSave}
              disabled={anchorSaving}
            >
              {anchorSaving
                ? <ActivityIndicator size="small" color={Colors.textPrimary} />
                : <Text style={styles.anchorSaveBtnText}>Set</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.anchorHint}>
            Enter any Thursday that was the first day of a pay period. The app calculates all other periods from there.
          </Text>
        </View>

        {/* ── Reminders ──────────────────────────────── */}
        <SectionLabel label="Shift Reminders" />
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} style={styles.rowIcon} />
            <Text style={styles.rowLabel}>Daily Reminder</Text>
            <Switch
              value={reminderEnabled}
              onValueChange={handleReminderToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={reminderEnabled ? Colors.accentActive : Colors.textMuted}
            />
          </View>
          {reminderEnabled && (
            <>
              <Sep />
              <View style={styles.row}>
                <Ionicons name="time-outline" size={20} color={Colors.textSecondary} style={styles.rowIcon} />
                <Text style={styles.rowLabel}>Reminder Time</Text>
                <TextInput
                  style={styles.timeInput}
                  value={reminderTime}
                  onChangeText={handleTimeChange}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              {notifSaving && <Text style={styles.saving}>Saving...</Text>}
            </>
          )}
        </View>

        {/* ── Jobs ───────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <SectionLabel label="Jobs & Positions" />
          <TouchableOpacity onPress={() => setAddingJob(!addingJob)} style={{ paddingRight: Spacing.md }}>
            <Ionicons
              name={addingJob ? 'close-circle-outline' : 'add-circle-outline'}
              size={22}
              color={Colors.accent}
            />
          </TouchableOpacity>
        </View>

        {addingJob && (
          <View style={styles.addJobCard}>
            <TextInput
              style={styles.input}
              placeholder="Restaurant name"
              placeholderTextColor={Colors.textMuted}
              value={jobName}
              onChangeText={setJobName}
            />
            <TextInput
              style={styles.input}
              placeholder="Position (Server, Bartender...)"
              placeholderTextColor={Colors.textMuted}
              value={jobPosition}
              onChangeText={setJobPosition}
            />
            <TextInput
              style={styles.input}
              placeholder="Hourly wage (e.g. 2.13)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="decimal-pad"
              value={jobWage}
              onChangeText={setJobWage}
            />
            <Text style={styles.colorLabel}>Color</Text>
            <View style={styles.colorRow}>
              {JOB_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.colorDot, { backgroundColor: c }, jobColor === c && styles.colorDotSelected]}
                  onPress={() => setJobColor(c)}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={handleAddJob}>
              <Text style={styles.saveBtnText}>Add Job</Text>
            </TouchableOpacity>
          </View>
        )}

        {jobs.length === 0 && !addingJob && (
          <View style={[styles.card, { padding: Spacing.lg, alignItems: 'center' }]}>
            <Text style={{ color: Colors.textMuted }}>No jobs yet. Tap + to add one.</Text>
          </View>
        )}

        {jobs.map((job) => (
          <View key={job.id} style={styles.jobRow}>
            <View style={[styles.jobColorBar, { backgroundColor: job.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.jobName}>{job.name}</Text>
              <Text style={styles.jobSub}>{job.position} · ${job.defaultWage.toFixed(2)}/hr</Text>
            </View>
            <TouchableOpacity onPress={() => confirmDeleteJob(job)}>
              <Ionicons name="trash-outline" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}

        {/* ── Admin ──────────────────────────────────── */}
        {isAdmin && (
          <>
            <SectionLabel label="Admin" />
            <View style={styles.card}>
              <TouchableOpacity onPress={loadAdminSignups} disabled={adminLoading}>
                <View style={styles.row}>
                  {adminLoading
                    ? <ActivityIndicator size="small" color={Colors.accent} style={{ marginRight: Spacing.sm }} />
                    : <Ionicons name="people-outline" size={20} color={Colors.accent} style={styles.rowIcon} />}
                  <Text style={[styles.rowLabel, { color: Colors.accent }]}>Refresh Team Signups</Text>
                  <Text style={styles.adminCount}>{adminSignups.length}</Text>
                </View>
              </TouchableOpacity>
              {adminSignups.map((u) => (
                <View key={u.id}>
                  <Sep />
                  <View style={styles.adminUserRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.adminUserEmail}>{u.email}</Text>
                      <Text style={styles.adminUserMeta}>
                        {(u.name?.trim() || 'No profile name')} · Joined {new Date(u.createdAt).toLocaleDateString()} · {u.confirmed ? 'Confirmed' : 'Unconfirmed'}
                      </Text>
                      <Text style={styles.adminUserMeta}>
                        Activity: {u.shiftsLast7d} shifts / 7d · {u.shiftsLast30d} / 30d · Total {u.shiftsTotal}
                        {u.lastActivity ? ` · Last ${new Date(u.lastActivity).toLocaleString()}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Data ───────────────────────────────────── */}
        <SectionLabel label="Data" />
        <View style={styles.card}>
          <TouchableOpacity onPress={handleExport} disabled={exporting}>
            <View style={styles.row}>
              {exporting
                ? <ActivityIndicator size="small" color={Colors.accent} style={{ marginRight: Spacing.sm }} />
                : <Ionicons name="download-outline" size={20} color={Colors.accent} style={styles.rowIcon} />}
              <Text style={[styles.rowLabel, { color: Colors.accent }]}>
                {exporting ? 'Exporting...' : `Export CSV (${shifts.length} shifts)`}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Danger ─────────────────────────────────── */}
        <SectionLabel label="Danger Zone" />
        <View style={styles.card}>
          <TouchableOpacity
            onPress={() => {
              showConfirm('Sign Out', 'Are you sure?', signOut, 'Sign Out');
            }}
          >
            <View style={styles.row}>
              <Ionicons name="log-out-outline" size={20} color={Colors.error} style={styles.rowIcon} />
              <Text style={[styles.rowLabel, { color: Colors.error }]}>Sign Out</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Gratuitize Me v1.0 · Mike Anderson's Seafood · Baton Rouge</Text>
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function Row({ icon, label }: { icon: any; label: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={Colors.textSecondary} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
    </View>
  );
}

function Sep() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: '600',
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  card: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  rowIcon: { marginRight: Spacing.sm, color: Colors.textMuted },
  rowLabel: { flex: 1, fontSize: FontSize.md, fontWeight: '500', color: Colors.textPrimary },
  separator: { height: 1, backgroundColor: Colors.borderSubtle, marginLeft: Spacing.md + 28 },
  timeInput: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    borderWidth: 1,
    borderColor: Colors.border,
    width: 70,
    textAlign: 'center',
  },
  saving: { fontSize: FontSize.xs, color: Colors.textMuted, paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs },
  dayChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginRight: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  dayChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  dayChipTextActive: { color: Colors.textPrimary, fontWeight: '600' },
  addJobCard: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: Radius.sm,
    padding: Spacing.md,
    color: Colors.textPrimary,
    fontSize: FontSize.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  colorLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  colorRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  colorDot: { width: 28, height: 28, borderRadius: Radius.full },
  colorDotSelected: { borderWidth: 2, borderColor: Colors.textPrimary },
  saveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    alignItems: 'center',
  },
  saveBtnText: { color: Colors.textPrimary, fontWeight: '600', fontSize: FontSize.md },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.borderSubtle,
  },
  jobColorBar: { width: 3, height: 32, borderRadius: 2 },
  jobName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  jobSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  rowSub: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  adminCount: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  adminUserRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  adminUserEmail: {
    color: Colors.textPrimary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  adminUserMeta: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: 2,
  },
  anchorSaveBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minWidth: 48,
    alignItems: 'center',
  },
  anchorSaveBtnText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: FontSize.sm,
  },
  anchorHint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    lineHeight: 18,
  },
  version: {
    textAlign: 'center',
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: Spacing.lg,
  },
});
