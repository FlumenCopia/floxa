import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';

// Configure how incoming notifications are presented when app is foregrounded
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (e) {
  console.warn('[Notifications] setNotificationHandler skipped in Expo Go');
}

export async function registerForPushNotificationsAsync(
  role: 'consultant' | 'client',
  portalToken?: string | null
): Promise<string | null> {
  // Push notifications only work on real physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied by user');
      return null;
    }

    // Configure notification channels for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366f1',
      });

      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Incoming Calls',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 500, 500, 500],
        lightColor: '#ef4444',
      });
    }

    // Get Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    // Send token to Floxa backend
    await api.post('/auth/device-token/', {
      token: pushToken,
      platform: Platform.OS,
      role,
      portalToken: role === 'client' ? portalToken : undefined,
      deviceName: Device.modelName || 'Mobile Device',
      appVersion: '1.0.0',
    });

    return pushToken;
  } catch (err: any) {
    console.warn('Failed to register push token with Floxa backend:', err.message);
    return null;
  }
}

export function subscribeToNotificationReceived(
  onReceived: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(onReceived);
}

export function subscribeToNotificationResponse(
  onResponse: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(onResponse);
}

