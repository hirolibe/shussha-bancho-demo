import AsyncStorage from '@react-native-async-storage/async-storage';

import { ASYNC_STORAGE_KEYS, RSSI_THRESHOLD_DEFAULT } from '../config/constants';

export type BeaconConfig = {
  uuid: string | null;
  major: number | null;
  minor: number | null;
  rssiThreshold: number;
};

const EMPTY: BeaconConfig = {
  uuid: null,
  major: null,
  minor: null,
  rssiThreshold: RSSI_THRESHOLD_DEFAULT,
};

function parseIntOrNull(s: string | null): number | null {
  if (s === null || s === '') return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export async function loadBeaconConfig(): Promise<BeaconConfig> {
  const [uuid, major, minor, rssi] = await Promise.all([
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.beaconUuid),
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.beaconMajor),
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.beaconMinor),
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.rssiThreshold),
  ]);
  return {
    uuid: uuid && uuid.length > 0 ? uuid : null,
    major: parseIntOrNull(major),
    minor: parseIntOrNull(minor),
    rssiThreshold: parseIntOrNull(rssi) ?? EMPTY.rssiThreshold,
  };
}

export async function saveBeaconConfig(cfg: BeaconConfig): Promise<void> {
  const ops: Promise<void>[] = [];

  ops.push(
    cfg.uuid && cfg.uuid.length > 0
      ? AsyncStorage.setItem(ASYNC_STORAGE_KEYS.beaconUuid, cfg.uuid)
      : AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.beaconUuid),
  );

  ops.push(
    cfg.major !== null
      ? AsyncStorage.setItem(ASYNC_STORAGE_KEYS.beaconMajor, String(cfg.major))
      : AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.beaconMajor),
  );

  ops.push(
    cfg.minor !== null
      ? AsyncStorage.setItem(ASYNC_STORAGE_KEYS.beaconMinor, String(cfg.minor))
      : AsyncStorage.removeItem(ASYNC_STORAGE_KEYS.beaconMinor),
  );

  ops.push(
    AsyncStorage.setItem(ASYNC_STORAGE_KEYS.rssiThreshold, String(cfg.rssiThreshold)),
  );

  await Promise.all(ops);
}

export function isUuidValid(uuid: string): boolean {
  // 8-4-4-4-12 の hex
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);
}
