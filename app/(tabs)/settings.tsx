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
import { useState, useEffect, useMemo, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius, FontSize } from '../../constants/theme';
import { useAuthStore } from '../../store/authStore';
import { useShiftStore } from '../../store/shiftStore';
import { Job } from '../../lib/types';
import { randomUUID } from 'expo-crypto';
import { getPayPeriodForDate, DEFAULT_PAY_PERIOD_ANCHOR } from '../../lib/calculations';
import { format, parseISO } from 'date-fns';
import { requestNotificationPermission, scheduleShiftReminder, cancelShiftReminder } from '../../lib/notifications';
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
  cashoutTotal: number;
  cashoutLast7d: number;
  cashoutLast30d: number;
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

  // Pay week
  const [payWeekStart, setPayWeekStart] = useState(user?.payWeekStart ?? 1);
  const [weekSaving, setWeekSaving] = useState(false);

  // Pay period anchor
  const [anchorInput, setAnchorInput] = useState(user?.payPeriodAnchor ?? DEFAULT_PAY_PERIOD_ANCHOR);
  const [anchorSaving, setAnchorSaving] = useState(false);
  const anchorPreview = useMemo(() => {
    try {
      const pp = getPayPeriodForDate(anchorInput, new Date());
      return `${format(pp.start, 'MMM d')} – ${format(pp.end, 'MMM d, yyyy')}`;
    } catch { return 'Invalid'; }
  }, [anchorInput]);

  // Export
  const [exporting, setExporting] = useState(false);

  // Admin
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSignups, setAdminSignups] = useState<AdminSignup[]>([]);
  const isAdmin = (user?.email ?? '').toLowerCase() === 'ethanheinrick01@gmail.com';
  const adminAutoLoadedRef = useRef(false);
  const adminTotalCashouts = useMemo(() => adminSignups.reduce((s, u) => s + (u.cashoutTotal ?? 0), 0), [adminSignups]);

  useEffect(() => {
    setReminderEnabled(user?.reminderEnabled ?? false);
    setReminderTime(user?.reminderTime ?? '23:00');
    setPayWeekStart(user?.payWeekStart ?? 1);
    setAnchorInput(user?.payPeriodAnchor ?? DEFAULT_PAY_PERIOD_ANCHOR);
  }, [user]);

  useEffect(() => {
    if (!isAdmin || adminAutoLoadedRef.current) return;
    adminAutoLoadedRef.current = true;
    loadAdminSignups();
  }, [isAdmin]);

  async function handleAnchorSave() {
    try {
      const d = parseISO(anchorInput);
      if (isNaN(d.getTime())) throw new Error();
      if (d.getDay() !== 4) {
        showAlert('Must be a Thursday', `${format(d, 'EEEE MMM d')} isn't a Thursday. Pick the Thursday that started your last pay period.`);
        return;
      }
    } catch {
      showAlert('Invalid Date', 'Enter a date like 2026-03-26.');
      return;
    }
    setAnchorSaving(true);
    try {
      if (user) await supabase.from('users').update({ payPeriodAnchor: anchorInput }).eq('id', user.id);
    } finally { setAnchorSaving(false); }
  }

  async function handleReminderToggle(val: boolean) {
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) { showAlert('Permission Required', 'Allow notifications in Settings to enable reminders.'); return; }
    }
    setReminderEnabled(val);
    await saveReminderPrefs(val, reminderTime);
  }

  async function saveReminderPrefs(enabled: boolean, time: string) {
    setNotifSaving(true);
    try {
      if (enabled) await scheduleShiftReminder(time);
      else await cancelShiftReminder();
      if (user) await supabase.from('users').update({ reminderEnabled: enabled, reminderTime: time }).eq('id', user.id);
    } catch (e) { console.warn('Reminder save error:', e); }
    finally { setNotifSaving(false); }
  }

  async function handleTimeChange(time: string) {
    setReminderTime(time);
    if (reminderEnabled) await saveReminderPrefs(true, time);
  }

  async function handlePayWeekChange(day: number) {
    setPayWeekStart(day);
    setWeekSaving(true);
    try { if (user) await supabase.from('users').update({ payWeekStart: day }).eq('id', user.id); }
    finally { setWeekSaving(false); }
  }

  function handleAddJob() {
    if (!jobName.trim()) return;
    const job: Job = {
      id: randomUUID(), name: jobName.trim(), color: jobColor,
      position: jobPosition.trim() || 'Server', defaultWage: parseFloat(jobWage) || 2.13,
      createdAt: new Date().toISOString(),
    };
    saveJob(job);
    setJobName(''); setJobPosition('Server'); setJobWage('2.13'); setAddingJob(false);
  }

  function confirmDeleteJob(job: Job) {
    const count = shifts.filter((s) => s.jobId === job.id).length;
    const msg = count > 0
      ? `"${job.name}" has ${count} logged shift${count !== 1 ? 's' : ''}. Delete anyway?`
      : `Delete "${job.name}"?`;
    showConfirm('Delete Job', msg, () => deleteJob(job.id), 'Delete');
  }

  async function handleExport() {
    setExporting(true);
    try { await exportShiftsToCSV(shifts, jobs); }
    catch (e: any) { showAlert('Export Failed', e.message ?? 'Unknown error'); }
    finally { setExporting(false); }
  }

  async function loadAdminSignups() {
    if (!isAdmin || adminLoading) return;
    setAdminLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not signed in');
      const projectRef = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace('https://', '').replace('.supabase.co', '');
      const endpoint = `https://${projectRef}.supabase.co/functions/v1/admin-signups`;
      const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey, 'x-user-token': session.access_token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAdminSignups((json?.users ?? []) as AdminSignup[]);
    } catch (e: any) { showAlert('Admin load failed', e?.message ?? 'Could not load signups'); }
    finally { setAdminLoading(false); }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Settings</Text>

        {/* ── Account ────────────────────────────────────────────────── */}
        <SectionLabel label="Account" />
        <View style={styles.card}>
          <View style={styles.accountRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{(user?.name ?? user?.email ?? '?')[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountName}>{user?.name ?? 'No name set'}</Text>
              <Text style={styles.accountEmail}>{user?.email ?? ''}</Text>
            </View>
          </View>
          <View style={styles.sep} />
          <TouchableOpacity style={styles.actionRow} onPress={() => user?.id && sync(user.id)} disabled={syncing}>
            {syncing
              ? <ActivityIndicator size="small" color={Colors.accent} />
              : <Ionicons name="sync-outline" size={18} color={Colors.accent} />}
            <Text style={[styles.actionText, { color: Colors.accent }]}>{syncing ? 'Syncing...' : 'Sync Now'}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Pay Week ─────────────────────────────────────────────── */}
        <SectionLabel label="Pay Week Starts On" />
        <View style={styles.card}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: Spacing.sm }}>
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

        {/* ── Pay Period ──────────────────────────────────────────── */}
        <SectionLabel label="Pay Period Anchor" />
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Current Period</Text>
              <Text style={styles.infoValue}>{anchorPreview}</Text>
            </View>
          </View>
          <View style={styles.sep} />
          <View style={styles.anchorRow}>
            <TextInput
              style={styles.anchorInput}
              value={anchorInput}
              onChangeText={setAnchorInput}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numbers-and-punctuation"
            />
            <TouchableOpacity style={styles.setBtn} onPress={handleAnchorSave} disabled={anchorSaving}>
              {anchorSaving
                ? <ActivityIndicator size="small" color={Colors.textPrimary} />
                : <Text style={styles.setBtnText}>Set</Text>}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>Enter any Thursday — the app calculates all pay periods from there.</Text>
        </View>

        {/* ── Reminders ───────────────────────────────────────────── */}
        <SectionLabel label="Shift Reminders" />
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Daily Reminder</Text>
              <Text style={styles.hintInline}>Remind me to log a shift each day</Text>
            </View>
            <Switch
              value={reminderEnabled}
              onValueChange={handleReminderToggle}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={reminderEnabled ? Colors.accentActive : Colors.textMuted}
            />
          </View>
          {reminderEnabled && (
            <>
              <View style={styles.sep} />
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={18} color={Colors.textMuted} />
                <Text style={[styles.infoLabel, { marginLeft: Spacing.sm }]}>Reminder Time</Text>
                <TextInput
                  style={styles.timeInput}
                  value={reminderTime}
                  onChangeText={handleTimeChange}
                  placeholder="HH:MM"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              {notifSaving && <Text style={[styles.saving, { paddingHorizontal: Spacing.md }]}>Saving...</Text>}
            </>
          )}
        </View>

        {/* ── Jobs ────────────────────────────────────────────────── */}
        <View style={styles.sectionHeadRow}>
          <SectionLabel label="Jobs & Positions" />
          <TouchableOpacity onPress={() => setAddingJob(!addingJob)} hitSlop={8}>
            <Ionicons name={addingJob ? 'close-circle' : 'add-circle'} size={22} color={Colors.accent} />
          </TouchableOpacity>
        </View>

        {addingJob && (
          <View style={styles.addJobCard}>
            <TextInput style={styles.input} placeholder="Restaurant name" placeholderTextColor={Colors.textMuted} value={jobName} onChangeText={setJobName} />
            <TextInput style={styles.input} placeholder="Position (Server, Bartender...)" placeholderTextColor={Colors.textMuted} value={jobPosition} onChangeText={setJobPosition} />
            <TextInput style={styles.input} placeholder="Hourly wage (e.g. 2.13)" placeholderTextColor={Colors.textMuted} keyboardType="decimal-pad" value={jobWage} onChangeText={setJobWage} />
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
          <View style={[styles.card, { padding: Spacing.xl, alignItems: 'center' }]}>
            <Text style={{ color: Colors.textMuted }}>No jobs yet — tap + to add one.</Text>
          </View>
        )}

        {jobs.map((job) => (
          <View key={job.id} style={styles.jobRow}>
            <View style={[styles.jobBar, { backgroundColor: job.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.jobName}>{job.name}</Text>
              <Text style={styles.jobSub}>{job.position} · ${job.defaultWage.toFixed(2)}/hr</Text>
            </View>
            <TouchableOpacity onPress={() => confirmDeleteJob(job)} hitSlop={8}>
              <Ionicons name="trash-outline" size={17} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        ))}

        {/* ── Admin ───────────────────────────────────────────────── */}
        {isAdmin && (
          <>
            <SectionLabel label="Team" />
            <View style={styles.card}>
              <TouchableOpacity style={styles.actionRow} onPress={loadAdminSignups} disabled={adminLoading}>
                {adminLoading
                  ? <ActivityIndicator size="small" color={Colors.accent} />
                  : <Ionicons name="people-outline" size={18} color={Colors.accent} />}
                <Text style={[styles.actionText, { color: Colors.accent }]}>
                  {adminLoading ? 'Loading...' : `Refresh Team (${adminSignups.length} members · ${adminTotalCashouts} cashouts)`}
                </Text>
              </TouchableOpacity>
            </View>

            {adminSignups.map((u) => (
              <View key={u.id} style={styles.adminCard}>
                <View style={styles.adminHeader}>
                  <Text style={styles.adminEmail}>{u.email}</Text>
                  <View style={[styles.badge, u.confirmed ? styles.badgeConfirmed : styles.badgeUnconfirmed]}>
                    <Text style={styles.badgeText}>{u.confirmed ? 'Confirmed' : 'Pending'}</Text>
                  </View>
                </View>
                {u.name?.trim() && <Text style={styles.adminName}>{u.name}</Text>}
                <Text style={styles.adminMeta}>
                  Joined {new Date(u.createdAt).toLocaleDateString()} · {u.shiftsTotal} total shifts · {u.cashoutTotal} cashouts
                </Text>
                <Text style={styles.adminMeta}>
                  Recent: {u.shiftsLast7d} shifts / {u.cashoutLast7d} cashouts in last 7 days
                </Text>
                {u.lastActivity && (
                  <Text style={styles.adminMeta}>Last active {new Date(u.lastActivity).toLocaleString()}</Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* ── Data ────────────────────────────────────────────────── */}
        <SectionLabel label="Data" />
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={handleExport} disabled={exporting}>
            {exporting
              ? <ActivityIndicator size="small" color={Colors.accent} />
              : <Ionicons name="download-outline" size={18} color={Colors.accent} />}
            <Text style={[styles.actionText, { color: Colors.accent }]}>
              {exporting ? 'Exporting...' : `Export ${shifts.length} Shifts to CSV`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Sign Out ───────────────────────────────────────────── */}
        <SectionLabel label="Account" />
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={() => showConfirm('Sign Out', 'Are you sure?', signOut, 'Sign Out')}>
            <Ionicons name="log-out-outline" size={18} color={Colors.error} />
            <Text style={[styles.actionText, { color: Colors.error }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>Gratuitize Me · Mike Anderson's Seafood · Baton Rouge</Text>
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  pageTitle: {
    fontSize: FontSize.xxl, fontWeight: '600', color: Colors.textPrimary,
    paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, marginBottom: Spacing.xs,
  },

  sectionLabel: {
    fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 1.2,
    paddingHorizontal: Spacing.md, marginTop: Spacing.lg, marginBottom: Spacing.xs,
  },
  sectionHeadRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.lg, marginBottom: Spacing.xs, paddingRight: Spacing.md,
  },

  card: {
    marginHorizontal: Spacing.md, backgroundColor: Colors.card,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  cardPadded: { marginHorizontal: Spacing.md, backgroundColor: Colors.card, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md },

  // Account
  accountRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  accountName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  accountEmail: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 1 },

  // Rows
  actionRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  actionText: { fontSize: FontSize.md, fontWeight: '500' },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  infoLabel: { fontSize: FontSize.md, fontWeight: '500', color: Colors.textPrimary },
  infoValue: { fontSize: FontSize.sm, color: Colors.accent, marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  sep: { height: 1, backgroundColor: Colors.borderSubtle, marginLeft: Spacing.md },

  // Pay anchor
  anchorRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  anchorInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    color: Colors.textPrimary, fontSize: FontSize.md, borderWidth: 1, borderColor: Colors.border,
  },
  setBtn: {
    backgroundColor: Colors.accent, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, alignItems: 'center', minWidth: 52,
  },
  setBtnText: { color: Colors.textPrimary, fontWeight: '600', fontSize: FontSize.sm },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, lineHeight: 16 },
  hintInline: { fontSize: FontSize.xs, color: Colors.textMuted },
  saving: { fontSize: FontSize.xs, color: Colors.textMuted, paddingHorizontal: Spacing.md, paddingBottom: Spacing.xs },
  timeInput: {
    marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs, color: Colors.textPrimary,
    fontSize: FontSize.md, borderWidth: 1, borderColor: Colors.border, width: 72, textAlign: 'center',
  },

  // Day chips
  dayChip: {
    paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 1,
    borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.04)',
    marginRight: Spacing.xs, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  dayChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  dayChipText: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: '500' },
  dayChipTextActive: { color: Colors.textPrimary, fontWeight: '700' },

  // Jobs
  addJobCard: {
    marginHorizontal: Spacing.md, backgroundColor: Colors.card,
    borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: Radius.sm,
    padding: Spacing.md, color: Colors.textPrimary, fontSize: FontSize.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  colorLabel: { fontSize: FontSize.xs, color: Colors.textMuted, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 1 },
  colorRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' },
  colorDot: { width: 26, height: 26, borderRadius: 13 },
  colorDotSelected: { borderWidth: 2.5, borderColor: Colors.textPrimary },
  saveBtn: { backgroundColor: Colors.accent, borderRadius: Radius.sm, padding: Spacing.md, alignItems: 'center' },
  saveBtnText: { color: Colors.textPrimary, fontWeight: '700', fontSize: FontSize.md },
  jobRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card,
    marginHorizontal: Spacing.md, marginBottom: Spacing.xs, borderRadius: Radius.md,
    padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  jobBar: { width: 3, height: 36, borderRadius: 2 },
  jobName: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  jobSub: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },

  // Admin
  adminCard: {
    marginHorizontal: Spacing.md, backgroundColor: Colors.card,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.xs,
    borderWidth: 1, borderColor: Colors.borderSubtle,
  },
  adminHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  adminEmail: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  adminName: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  adminMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 3, lineHeight: 16 },
  badge: { borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  badgeConfirmed: { backgroundColor: 'rgba(16,185,129,0.15)' },
  badgeUnconfirmed: { backgroundColor: 'rgba(251,191,36,0.15)' },
  badgeText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },

  version: {
    textAlign: 'center', color: Colors.textMuted, fontSize: FontSize.xs, marginTop: Spacing.xl,
  },
});
