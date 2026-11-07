import { NativeModules, Platform } from 'react-native';

/**
 * Safe audio module loader that will never crash runtime if ExponentAV is missing
 */
function loadNativeAudio(): any {
  try {
    // Check if ExponentAV native module exists before attempting require
    const hasNative =
      Boolean(NativeModules?.ExponentAV) ||
      Boolean((globalThis as any)?.ExpoModules?.ExponentAV);

    if (!hasNative) {
      return null;
    }

    const ExpoAv = require('expo-av');
    return ExpoAv?.Audio || null;
  } catch {
    return null;
  }
}

const NativeAudio = loadNativeAudio();

export const AudioService = {
  isSupported(): boolean {
    return Boolean(NativeAudio);
  },

  async requestPermissionsAsync(): Promise<{ granted: boolean }> {
    if (!NativeAudio) return { granted: false };
    try {
      return await NativeAudio.requestPermissionsAsync();
    } catch {
      return { granted: false };
    }
  },

  async setAudioModeAsync(options: any): Promise<void> {
    if (!NativeAudio) return;
    try {
      await NativeAudio.setAudioModeAsync(options);
    } catch {
      // Ignore
    }
  },

  async createRecordingAsync(options: any): Promise<{ recording: any }> {
    if (!NativeAudio?.Recording) {
      throw new Error('Native recording module is not available in current environment.');
    }
    return await NativeAudio.Recording.createAsync(options);
  },

  getPresets(): any {
    return (
      NativeAudio?.RecordingOptionsPresets || {
        HIGH_QUALITY: {},
      }
    );
  },

  async playSoundAsync(url: string): Promise<any> {
    if (!NativeAudio?.Sound) return null;
    try {
      const { sound } = await NativeAudio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true }
      );
      return sound;
    } catch (err) {
      console.warn('AudioService playSoundAsync error:', err);
      return null;
    }
  },
};
