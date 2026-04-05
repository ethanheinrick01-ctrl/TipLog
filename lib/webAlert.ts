import { Alert, Platform } from 'react-native';

/** Drop-in for Alert.alert — uses window.alert on web so Chrome doesn't swallow it. */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    (window as any).alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Confirmation dialog — uses window.confirm on web.
 * `onConfirm` called when user presses OK/Yes/destructive button.
 */
export function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = 'OK',
  onCancel?: () => void,
): void {
  if (Platform.OS === 'web') {
    if ((window as any).confirm(`${title}\n\n${message}`)) {
      onConfirm();
    } else {
      onCancel?.();
    }
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: onCancel },
      { text: confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
  }
}
