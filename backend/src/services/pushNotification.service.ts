import { DeviceToken, IDeviceToken } from '../models/deviceToken.model.js';

interface PushMessagePayload {
  to: string;
  sound?: 'default' | null;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  badge?: number;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Sends push notifications to an array of Expo push tokens
 */
export async function sendExpoPushNotifications(messages: PushMessagePayload[]): Promise<void> {
  if (!messages || messages.length === 0) return;

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Expo Push Notification API error:', response.status, errText);
    }
  } catch (err: any) {
    console.warn('Failed to send Expo push notification:', err.message);
  }
}

/**
 * Notify a consultant across all their registered mobile devices
 */
export async function notifyConsultant(
  consultantId: string,
  notification: { title: string; body: string; data?: Record<string, any>; isCall?: boolean }
): Promise<void> {
  try {
    const tokens: IDeviceToken[] = await DeviceToken.find({
      userId: consultantId,
      role: 'consultant',
      isActive: true,
    });

    if (tokens.length === 0) return;

    const messages: PushMessagePayload[] = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      priority: notification.isCall ? 'high' : 'default',
      channelId: notification.isCall ? 'calls' : 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
    }));

    await sendExpoPushNotifications(messages);
  } catch (err: any) {
    console.warn('Error notifying consultant:', err.message);
  }
}

/**
 * Notify a client across all their registered mobile devices for a project portal token
 */
export async function notifyClient(
  portalToken: string,
  notification: { title: string; body: string; data?: Record<string, any>; isCall?: boolean }
): Promise<void> {
  try {
    const tokens: IDeviceToken[] = await DeviceToken.find({
      portalToken,
      role: 'client',
      isActive: true,
    });

    if (tokens.length === 0) return;

    const messages: PushMessagePayload[] = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      priority: notification.isCall ? 'high' : 'default',
      channelId: notification.isCall ? 'calls' : 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
    }));

    await sendExpoPushNotifications(messages);
  } catch (err: any) {
    console.warn('Error notifying client:', err.message);
  }
}

