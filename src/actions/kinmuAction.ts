import AsyncStorage from '@react-native-async-storage/async-storage';

import { isAlreadyKinmu, setKinmuStatus, SlackError } from '../api/slackClient';
import { ASYNC_STORAGE_KEYS } from '../config/constants';
import { loadSlackToken } from '../storage/secureToken';

/** Slack を連打しないためのクールダウン (仕様書 §11) */
const COOLDOWN_MS = 60_000;
const LAST_ATTEMPT_KEY = 'last_kinmu_attempt_epoch_ms';

export type KinmuActionResult =
  | { kind: 'set'; jstDate: string }
  | { kind: 'skipped_already_today'; jstDate: string }
  | { kind: 'skipped_cooldown'; remainingMs: number }
  | { kind: 'no_token' }
  | { kind: 'error'; error: SlackError | Error };

export type KinmuActionOptions = {
  /**
   * 仕様書 §5.4 の任意ガード: Slack 側の現在ステータスを `users.profile.get` で確認し、
   * 既に :kinmu: になっていれば API を叩かない。Phase 1 PoC では false 推奨（API 呼び出し増を避ける）。
   */
  doubleCheckRemote?: boolean;
};

export function getJstDateString(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getLastKinmuSetDate(): Promise<string | null> {
  return AsyncStorage.getItem(ASYNC_STORAGE_KEYS.lastKinmuSetDate);
}

export async function clearLastKinmuSetDate(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.lastKinmuSetDate),
    AsyncStorage.removeItem(LAST_ATTEMPT_KEY),
  ]);
}

/**
 * iBeacon 検知時もホーム画面の「今すぐ」ボタンも、ここを通る。
 * Phase 2 でバックエンド経由に差し替えるときも、この関数のシグネチャは保てる。
 */
export async function performKinmuAction(
  options?: KinmuActionOptions,
): Promise<KinmuActionResult> {
  const today = getJstDateString();

  // 1) 同日重複チェック (AsyncStorage)
  const lastSet = await AsyncStorage.getItem(ASYNC_STORAGE_KEYS.lastKinmuSetDate);
  if (lastSet === today) {
    return { kind: 'skipped_already_today', jstDate: today };
  }

  // 2) クールダウンチェック (連打防止)
  const lastAttemptStr = await AsyncStorage.getItem(LAST_ATTEMPT_KEY);
  const lastAttempt = lastAttemptStr ? Number.parseInt(lastAttemptStr, 10) : 0;
  const now = Date.now();
  if (Number.isFinite(lastAttempt) && now - lastAttempt < COOLDOWN_MS) {
    return { kind: 'skipped_cooldown', remainingMs: COOLDOWN_MS - (now - lastAttempt) };
  }

  // 3) トークンロード
  const token = await loadSlackToken();
  if (!token) {
    return { kind: 'no_token' };
  }

  // ここからネットワーク呼び出し。失敗時もクールダウンに記録する
  await AsyncStorage.setItem(LAST_ATTEMPT_KEY, String(now));

  // 4) (任意) Slack 側で既に :kinmu: なら API を叩かない
  if (options?.doubleCheckRemote) {
    try {
      if (await isAlreadyKinmu(token)) {
        await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.lastKinmuSetDate, today);
        return { kind: 'skipped_already_today', jstDate: today };
      }
    } catch {
      // 二重ガード失敗時は黙って set に進む
    }
  }

  // 5) Slack ステータス更新
  try {
    await setKinmuStatus(token);
    await AsyncStorage.setItem(ASYNC_STORAGE_KEYS.lastKinmuSetDate, today);
    return { kind: 'set', jstDate: today };
  } catch (e) {
    if (e instanceof SlackError) {
      return { kind: 'error', error: e };
    }
    return { kind: 'error', error: e instanceof Error ? e : new Error(String(e)) };
  }
}
