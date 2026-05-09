import { DeviceEventEmitter, EmitterSubscription, Platform } from 'react-native';
// react-native-beacon-radar は型定義に乱れがあるため any 経由で扱う。
// （isBluetoothEnabled / getBluetoothState は宣言されているが Swift 側に実装が無い。
//  getAuthorizationStatus は文字列を直接返すが d.ts は { status: string } となっている。）
import * as BeaconRadar from 'react-native-beacon-radar';

import { performKinmuAction, type KinmuActionResult } from '../actions/kinmuAction';
import type { BeaconConfig } from '../storage/beaconConfig';

export type DetectedBeacon = {
  uuid: string;
  major: number;
  minor: number;
  rssi: number;
  distance: number;
};

export type AuthorizationStatus =
  | 'notDetermined'
  | 'restricted'
  | 'denied'
  | 'authorizedAlways'
  | 'authorizedWhenInUse'
  | 'unknown';

export type BeaconScanListener = {
  /** 受信した beacon (フィルタ前の全件) を渡す。デバッグ表示向け */
  onRawBeacons?: (beacons: DetectedBeacon[]) => void;
  /** UUID/Major/Minor/RSSI でフィルタ後の beacon */
  onMatched?: (beacons: DetectedBeacon[]) => void;
  /** performKinmuAction が走った後の結果 */
  onAction?: (result: KinmuActionResult) => void;
};

let subscription: EmitterSubscription | null = null;
let isScanning = false;
let activeConfig: BeaconConfig | null = null;
const listeners = new Set<BeaconScanListener>();

/** 認可状態を取得。d.ts と実装の差異を吸収して文字列で返す */
export async function getAuthorizationStatus(): Promise<AuthorizationStatus> {
  const raw = (await (BeaconRadar as { getAuthorizationStatus: () => Promise<unknown> }).getAuthorizationStatus()) as
    | string
    | { status: string };
  const status = typeof raw === 'string' ? raw : raw.status;
  return (status as AuthorizationStatus) ?? 'unknown';
}

export async function requestAlwaysAuthorization(): Promise<AuthorizationStatus> {
  const result = (await BeaconRadar.requestAlwaysAuthorization()) as
    | string
    | { status: string };
  return ((typeof result === 'string' ? result : result.status) as AuthorizationStatus) ?? 'unknown';
}

export async function requestWhenInUseAuthorization(): Promise<AuthorizationStatus> {
  const result = (await BeaconRadar.requestWhenInUseAuthorization()) as
    | string
    | { status: string };
  return ((typeof result === 'string' ? result : result.status) as AuthorizationStatus) ?? 'unknown';
}

/** Beacon の UUID/Major/Minor/RSSI を BeaconConfig と突き合わせる */
export function isMatchingBeacon(b: DetectedBeacon, cfg: BeaconConfig): boolean {
  if (cfg.uuid && b.uuid.toLowerCase() !== cfg.uuid.toLowerCase()) return false;
  if (cfg.major !== null && b.major !== cfg.major) return false;
  if (cfg.minor !== null && b.minor !== cfg.minor) return false;
  // RSSI は負値。閾値が -75 のとき、b.rssi が -50 (近い) なら通過、-90 (遠い) なら除外
  if (b.rssi < cfg.rssiThreshold) return false;
  // distance < 0 は不明値 (CLBeacon.accuracy の仕様)。Phase 1 では弾かない
  return true;
}

export type BeaconScanState = 'idle' | 'scanning';

export function getScanState(): BeaconScanState {
  return isScanning ? 'scanning' : 'idle';
}

export function getActiveConfig(): BeaconConfig | null {
  return activeConfig;
}

export function addBeaconScanListener(l: BeaconScanListener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function notifyRaw(beacons: DetectedBeacon[]) {
  for (const l of listeners) l.onRawBeacons?.(beacons);
}
function notifyMatched(beacons: DetectedBeacon[]) {
  for (const l of listeners) l.onMatched?.(beacons);
}
function notifyAction(r: KinmuActionResult) {
  for (const l of listeners) l.onAction?.(r);
}

export async function startBeaconScanning(config: BeaconConfig): Promise<void> {
  if (!config.uuid) {
    throw new Error('Beacon UUID が設定されていません (設定画面で保存してください)');
  }
  if (isScanning) {
    return;
  }

  // 認可確認 (Always 必須はバックグラウンド検知のため)
  const status = await getAuthorizationStatus();
  if (status !== 'authorizedAlways' && status !== 'authorizedWhenInUse') {
    const requested = await requestAlwaysAuthorization();
    if (requested !== 'authorizedAlways' && requested !== 'authorizedWhenInUse') {
      throw new Error(`位置情報の権限が許可されていません (${requested})`);
    }
  }

  // イベント購読 (1 つだけ。複数リスナーへの fan-out は内側で行う)
  subscription = DeviceEventEmitter.addListener(
    'onBeaconsDetected',
    (raw: DetectedBeacon[] | DetectedBeacon | undefined | null) => {
      const beacons: DetectedBeacon[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      notifyRaw(beacons);

      const matched = beacons.filter((b) => isMatchingBeacon(b, config));
      if (matched.length === 0) return;

      notifyMatched(matched);

      // 検知 → 冪等アクション。失敗は飲み込む（イベントハンドラなので throw しない）
      performKinmuAction()
        .then((result) => notifyAction(result))
        .catch(() => undefined);
    },
  );

  // ネイティブ側スキャン開始 (返り値は同期 / void)
  BeaconRadar.startScanning(config.uuid, {
    useForegroundService: Platform.OS === 'android',
    useBackgroundScanning: true,
  });
  isScanning = true;
  activeConfig = config;
}

export function stopBeaconScanning(): void {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  try {
    BeaconRadar.stopScanning();
  } catch {
    /* 既に停止済み or ネイティブ未初期化 */
  }
  isScanning = false;
  activeConfig = null;
}
