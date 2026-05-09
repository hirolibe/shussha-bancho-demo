# Step 4: iBeacon 検知（フォアグラウンド）

`react-native-beacon-radar` で iBeacon の電波を取り、UUID/Major/Minor/RSSI でフィルタした上で
**Step 5 で作った `performKinmuAction()` を呼ぶ**。本ステップではフォアグラウンドのみを扱う。
バックグラウンドは Step 6。

## 完了条件

- [ ] `BeaconRadar` 由来の `onBeaconsDetected` イベントを受信できる
- [ ] UUID / Major / Minor / RSSI 閾値でフィルタリングが効く
- [ ] フィルタ通過時に `performKinmuAction()` が走る
- [ ] ホーム画面の「Beacon スキャン開始 / 停止」が動く
- [ ] 検知ログが画面に表示される

> 実機が必須。iOS Simulator / Android Emulator は CoreLocation の Beacon Ranging に対応していない。

## 4.1 ライブラリの実態を把握する

`react-native-beacon-radar@0.3.2` には型定義と実装にズレがある。実装してから「動かない」となるのを
避けるため、最初に把握しておく:

| API | 実装状況 (iOS) |
|---|---|
| `startScanning(uuid, config)` | ✅ あり (CoreLocation の `startMonitoring` + `startRangingBeacons`) |
| `stopScanning()` | ✅ あり |
| `requestAlwaysAuthorization()` / `requestWhenInUseAuthorization()` | ✅ あり (`{status: string}` を返す) |
| `getAuthorizationStatus()` | ✅ あり (**string を直接返す。`{status: ...}` ではない**) |
| `isBluetoothEnabled()` / `getBluetoothState()` | ❌ d.ts にはあるが iOS bridge に実装無し。呼ぶと例外 |
| `startForegroundService()` / `stopForegroundService()` | iOS は Android 側の API。iOS では呼ばない |
| `startRadar(config)` | Android 専用 |

ペイロード:

```ts
type DetectedBeacon = {
  uuid: string;     // 大文字
  major: number;
  minor: number;
  rssi: number;     // 負値 dBm
  distance: number; // CLBeacon.accuracy。-1 は不明
};
```

イベント名: `'onBeaconsDetected'` (DeviceEventEmitter)

## 4.2 `src/beacon/beaconScanner.ts`

設計は **検知ロジックを UI / 認証から独立** (仕様書 §13)。
HomeScreen からは `startBeaconScanning(config, callbacks)` / `stopBeaconScanning()` のみ呼ぶ。

### 公開 API

```ts
startBeaconScanning(config: BeaconConfig, callbacks?: BeaconScanCallbacks): Promise<void>
stopBeaconScanning(): void
getScanState(): 'idle' | 'scanning'
isMatchingBeacon(b, cfg): boolean
getAuthorizationStatus(): Promise<AuthorizationStatus>
requestAlwaysAuthorization(): Promise<AuthorizationStatus>
```

### マッチング規則

```ts
function isMatchingBeacon(b, cfg) {
  if (cfg.uuid && b.uuid.toLowerCase() !== cfg.uuid.toLowerCase()) return false;
  if (cfg.major !== null && b.major !== cfg.major) return false;
  if (cfg.minor !== null && b.minor !== cfg.minor) return false;
  if (b.rssi < cfg.rssiThreshold) return false; // -50 dBm > -75 dBm: 通過
  return true;
}
```

- UUID は **大文字小文字を無視して比較** (iOS は大文字、Android は小文字で返す実装が多い)
- Major / Minor は `null` (= 設定で空欄) なら不問
- RSSI は **負値の大小**: -50 > -75 で通過、-90 で除外
- `distance` < 0 は不明値だが Phase 1 では除外しない（誤検知が多そうなら追加）

### イベントハンドラ内で `performKinmuAction()` を呼ぶ

```ts
performKinmuAction()
  .then((result) => callbacks?.onAction?.(result))
  .catch(() => undefined); // ハンドラ内では throw しない
```

- Step 5 の冪等化が同日重複・クールダウンを吸収するので、**ここでは何のフィルタも入れずそのまま呼ぶ**
- エラーは `KinmuActionResult.kind === 'error'` で返ってくるので、UI 側で表示

### `startScanning` の呼び方

```ts
BeaconRadar.startScanning(config.uuid, {
  useForegroundService: Platform.OS === 'android', // iOS は無視
  useBackgroundScanning: true,
});
```

`useBackgroundScanning: true` で iOS は `allowsBackgroundLocationUpdates = true` になる。
これで **アプリが foreground / background のいずれでも Ranging が走る**（kill 状態は除く）。

## 4.3 HomeScreen の UI

| 表示 | 内容 |
|---|---|
| Beacon スキャン状態 | `稼働中` / `停止中` |
| 直近の一致 Beacon | フィルタ通過した beacon (major/minor/rssi/distance) |
| 直近の生 Beacon | フィルタ前の生データ (デバッグ用、最大5件) |
| 直近の打刻アクション | `set` / `already today` / `cooldown` / `error` |

| ボタン | 動作 |
|---|---|
| Beacon スキャン開始 | `loadBeaconConfig()` → `startBeaconScanning(...)` |
| Beacon スキャン停止 | `stopBeaconScanning()` |

スキャン中の状態はモジュール側に持っているので、画面遷移しても継続する。
画面に戻ったときは `getScanState()` で状態を復元する。

## 4.4 動作確認 (実機 / フォアグラウンド)

### 前提

- 物理 iBeacon（仕様書では MM-BLEBC3）が手元にあり、UUID/Major/Minor を設定画面で保存済み
- Slack トークン保存済み
- `expo run:ios --device` で実機にインストール済み（ネイティブビルドが必要）

### 手順

1. アプリ起動 → ホーム画面で「Beacon スキャン開始」
   - iOS が「位置情報の使用を許可しますか？」ダイアログ → **「常に許可」** を選ぶ
   - Bluetooth アクセスのダイアログが出たら許可
2. iBeacon を手元 50cm 以内に置く
3. 数秒待つ → 「直近の生 Beacon」「直近の一致 Beacon」が更新される
4. 「直近の打刻アクション」が `set (YYYY-MM-DD)` になり、Alert で「打刻完了」が出れば成功
5. iBeacon を置きっぱなしで放置
   - 重複呼出されない（Slack API レート消費しない）ことを画面・curl で確認
   - 画面の「打刻アクション」が `already today` になり続ける

### Beacon を遠ざけて RSSI を測る

1. 設定画面で `RSSI 閾値` を `-50` に変更（厳しめ）
2. iBeacon を 1m 程度離す → 一致しない (生だけ表示、一致は空)
3. 50cm 以内 → 一致する

これで **入口に立った瞬間だけ** 検知させる調整ができる。

## 4.5 commit

```bash
git add src/beacon src/screens
git commit -m "Phase1: Step4 - iBeacon フォアグラウンド検知 + 打刻アクション結合"
```

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| `requireNativeModule('BeaconRadar') ... not linked` | `expo run:ios` で再ビルドしていない。`npx expo prebuild --clean` してから再ビルド |
| 一切検知されない | 1) BLE OFF、2) 位置情報「許可しない」、3) iOS の場合 `Bluetooth & WiFi` のプライバシーが OFF、4) UUID 違い |
| 検知はされるが Slack が動かない | 設定画面でトークンが「未設定」表示 / `xoxp-` で始まらない / curl で `auth.test` が落ちる |
| 同じ UUID / Major / Minor の他人のビーコンも拾う | これは仕様。Phase 1 では Major/Minor を一意にして対処。Phase 2 で複数台識別を考える |
| `getAuthorizationStatus` が `unknown` を返す | 端末初回はこれで正常。`requestAlwaysAuthorization()` が走った後に再取得すると `authorizedAlways` |
| `useBackgroundScanning: true` でアプリが落ちる | `app.json` の `UIBackgroundModes` に `location` が無い。Step 1 を再確認 |
