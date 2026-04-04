import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleShiftReminder(hourStr: string): Promise<void> {
  // Cancel any existing reminder first
  await cancelShiftReminder();

  const [hour, minute] = hourStr.split(':').map(Number);
  if (isNaN(hour) || isNaN(minute)) return;

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
  await Notifications.cancelScheduledNotificationAsync('shift-reminder');
}

export async function getScheduledReminders() {
  return Notifications.getAllScheduledNotificationsAsync();
}
