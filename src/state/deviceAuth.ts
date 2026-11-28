// Confirms a sensitive step (turning read-only mode off) with the device owner's biometrics or
// device code, where the device has one set up. The web has no such check.

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type DeviceAuthResult =
  /** The owner confirmed. */
  | 'ok'
  /** Cancelled or not recognised. */
  | 'failed'
  /** No biometrics and no device code set up, or the web: the app asks with a dialog instead. */
  | 'unavailable';

type LocalAuth = Pick<typeof LocalAuthentication, 'getEnrolledLevelAsync' | 'authenticateAsync' | 'SecurityLevel'>;

export async function confirmWithDevice(
  prompt: { title: string; cancel: string },
  auth: LocalAuth = LocalAuthentication,
  os: string = Platform.OS
): Promise<DeviceAuthResult> {
  if (os === 'web') return 'unavailable';
  let level: LocalAuthentication.SecurityLevel;
  try {
    level = await auth.getEnrolledLevelAsync();
  } catch {
    return 'unavailable';
  }
  if (level === auth.SecurityLevel.NONE) return 'unavailable';
  try {
    // The device code is accepted too (disableDeviceFallback false), so a phone without
    // biometrics but with a PIN still asks for it.
    const result = await auth.authenticateAsync({ promptMessage: prompt.title, cancelLabel: prompt.cancel, disableDeviceFallback: false });
    return result.success ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}
