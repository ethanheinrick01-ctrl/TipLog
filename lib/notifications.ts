import { Platform } from 'react-native';

// expo-notifications is not supported on web — guard every call.
const isWeb = Platform.OS === 'web';

// Only set the notification handler on native platforms where the module works.
if (!isWeb) {
  // Dynamic require so the module is never evaluated on web.
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isWeb) return false;

  const Notifications = require('expo-notifications');
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleShiftReminder(hourStr: string): Promise<void> {
  if (isWeb) return;

  // Cancel any existing reminder first
  await cancelShiftReminder();

  const [hour, minute] = hourStr.split(':').map(Number);
  if (isNaN(hour) || isNaN(minute)) return;

  const Notifications = require('expo-notifications');
  await Notifications.scheduleNotificationAsync({
    identifier: 'shift-reminder',
    content: {
      title: "Log your shift 💵",
      body: "Don't forget to record today's tips in Gratuitize Me.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelShiftReminder(): Promise<void> {
  if (isWeb) return;

  const Notifications = require('expo-notifications');
  await Notifications.cancelScheduledNotificationAsync('shift-reminder');
}

export async function getScheduledReminders() {
  if (isWeb) return [];

  const Notifications = require('expo-notifications');
  return Notifications.getAllScheduledNotificationsAsync();
}
