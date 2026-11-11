import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEYS = {
  ACCESS_TOKEN: 'floxa_access_token',
  REFRESH_TOKEN: 'floxa_refresh_token',
  USER_ROLE: 'floxa_user_role',
  PORTAL_TOKEN: 'floxa_portal_token',
  PORTAL_ACCESS_TOKEN: 'floxa_portal_access_token',
  USER_PROFILE: 'floxa_user_profile',
  API_BASE_URL: 'floxa_api_base_url',
  CSRF_TOKEN: 'floxa_csrf_token',
};

// Memory fallback for platforms where SecureStore is unavailable
const memoryStore: Record<string, string> = {};

export const storage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        memoryStore[key] = value;
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch {
      memoryStore[key] = value;
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return memoryStore[key] || null;
      }
      const val = await SecureStore.getItemAsync(key);
      return val || memoryStore[key] || null;
    } catch {
      return memoryStore[key] || null;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        delete memoryStore[key];
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      delete memoryStore[key];
    }
  },

  KEYS,
};

