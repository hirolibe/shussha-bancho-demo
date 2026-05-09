/**
 * Phase 1 で使う定数。Phase 2 でバックエンド DB に移しても配置を変えるだけで済むよう、
 * ここに集約する。
 */

export const STATUS_EMOJI = ':kinmu:';
export const STATUS_TEXT = '出社中';

export const RSSI_THRESHOLD_DEFAULT = -75;

export const SECURE_STORE_KEYS = {
  slackUserToken: 'slack_user_token',
} as const;

export const ASYNC_STORAGE_KEYS = {
  lastKinmuSetDate: 'last_kinmu_set_date',
  beaconUuid: 'beacon_uuid',
  beaconMajor: 'beacon_major',
  beaconMinor: 'beacon_minor',
  rssiThreshold: 'rssi_threshold',
} as const;
