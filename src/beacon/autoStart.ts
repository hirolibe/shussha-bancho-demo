import { getScanState, startBeaconScanning } from './beaconScanner';
import { loadBeaconConfig } from '../storage/beaconConfig';
import { loadSlackToken } from '../storage/secureToken';

export type AutoStartResult =
  | { started: true; reason?: 'already-scanning' }
  | { started: false; reason: 'no-token' | 'no-uuid' | 'permission' | 'error'; error?: Error };

/**
 * 設定が揃っていれば Beacon スキャンを起動する。アプリ起動時に App.tsx から呼ぶ。
 * - Slack トークンがない / Beacon UUID がないなら何もしない (UI で誘導)
 * - 既にスキャン中なら何もしない
 */
export async function autoStartScanIfConfigured(): Promise<AutoStartResult> {
  if (getScanState() === 'scanning') return { started: true, reason: 'already-scanning' };

  const [token, cfg] = await Promise.all([loadSlackToken(), loadBeaconConfig()]);
  if (!token) return { started: false, reason: 'no-token' };
  if (!cfg.uuid) return { started: false, reason: 'no-uuid' };

  try {
    await startBeaconScanning(cfg);
    return { started: true };
  } catch (e) {
    if (e instanceof Error && /権限/.test(e.message)) {
      return { started: false, reason: 'permission', error: e };
    }
    return { started: false, reason: 'error', error: e instanceof Error ? e : new Error(String(e)) };
  }
}
