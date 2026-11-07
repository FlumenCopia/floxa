import { Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { AudioService } from './audio';

export type FloxaPermissionType = 'camera' | 'microphone' | 'mediaLibrary' | 'notifications';

export interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

export const PermissionService = {
  /**
   * Request or check camera permission
   */
  async requestCamera(): Promise<PermissionResult> {
    try {
      const current = await ImagePicker.getCameraPermissionsAsync();
      if (current.granted) {
        return { granted: true, canAskAgain: true, status: 'granted' };
      }

      const res = await ImagePicker.requestCameraPermissionsAsync();
      return {
        granted: res.granted,
        canAskAgain: res.canAskAgain,
        status: res.granted ? 'granted' : 'denied',
      };
    } catch {
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  },

  /**
   * Request or check microphone permission
   */
  async requestMicrophone(): Promise<PermissionResult> {
    try {
      if (AudioService.isSupported()) {
        const res = await AudioService.requestPermissionsAsync();
        return {
          granted: res.granted,
          canAskAgain: true,
          status: res.granted ? 'granted' : 'denied',
        };
      }
      return { granted: true, canAskAgain: true, status: 'granted' };
    } catch {
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  },

  /**
   * Request or check media library / photo gallery permission
   */
  async requestMediaLibrary(): Promise<PermissionResult> {
    try {
      const current = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (current.granted) {
        return { granted: true, canAskAgain: true, status: 'granted' };
      }

      const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return {
        granted: res.granted,
        canAskAgain: res.canAskAgain,
        status: res.granted ? 'granted' : 'denied',
      };
    } catch {
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  },

  /**
   * Request or check push notifications permission
   */
  async requestNotifications(): Promise<PermissionResult> {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED) {
        return { granted: true, canAskAgain: true, status: 'granted' };
      }

      const res = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });

      const isGranted =
        res.granted || res.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;

      return {
        granted: isGranted,
        canAskAgain: res.canAskAgain,
        status: isGranted ? 'granted' : 'denied',
      };
    } catch {
      return { granted: false, canAskAgain: true, status: 'denied' };
    }
  },

  /**
   * Directs the user to the device Settings page for this app
   */
  async openSettings(): Promise<void> {
    try {
      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
      } else {
        await Linking.openSettings();
      }
    } catch {
      await Linking.openSettings();
    }
  },
};

