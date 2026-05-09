import * as SecureStore from 'expo-secure-store';

import { SECURE_STORE_KEYS } from '../config/constants';

const KEYCHAIN_ACCESSIBLE = SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

export async function saveSlackToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('トークンが空です');
  }
  await SecureStore.setItemAsync(SECURE_STORE_KEYS.slackUserToken, trimmed, {
    keychainAccessible: KEYCHAIN_ACCESSIBLE,
  });
}

export async function loadSlackToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SECURE_STORE_KEYS.slackUserToken, {
    keychainAccessible: KEYCHAIN_ACCESSIBLE,
  });
}

export async function deleteSlackToken(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_STORE_KEYS.slackUserToken);
}

export function maskToken(token: string | null | undefined): string {
  if (!token) return '未設定';
  if (token.length <= 8) return '****';
  return `${token.slice(0, 5)}…${token.slice(-4)}`;
}
