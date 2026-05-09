# Phase 1 開発計画書: iBeacon検知 → Slack ステータスを `:kinmu:` に自動切替

作成日: 2026-05-08
対象: 開発フェーズ第1段階（**開発者1名のみで動かす最小PoC**）

---

## 1. ゴール

オフィス入口の iBeacon を **開発者本人のスマホアプリ** が検知したら、
**開発者本人の Slack カスタムステータスを `:kinmu:` に自動で切り替える。**

- このフェーズは **動作検証が目的**。1ユーザー・1端末で動けば成功
- MSSO認証・Outlook連携は Phase 2 以降

---

## 2. スコープ（やること / やらないこと）

| 区分 | 項目 |
|---|---|
| ✅ やる | iBeacon 検知、Slack ステータス更新 API 呼出、最小限のUI |
| ✅ やる | 同日重複更新の抑止（既に `:kinmu:` ならスキップ） |
| ✅ やる | バックグラウンド検知（iOS Region Monitoring / Android Foreground Service） |
| ❌ やらない | **バックエンドAPI（不要、アプリから直接 Slack を叩く）** |
| ❌ やらない | **OAuth 認可フロー（手動でトークン発行して埋め込む）** |
| ❌ やらない | **複数ユーザー対応**（Phase 2 で OAuth 化と同時に対応） |
| ❌ やらない | Microsoft365 SSO、Outlook 予定登録（Phase 2） |
| ❌ やらない | 退社検知・ステータス戻し |

---

## 3. システム構成

```
[BLEビーコン]  ──iBeacon電波──>  [スマホアプリ（開発者1名）]
  (オフィス入口)                       │
                                       │ HTTPS（直接呼出）
                                       │ Authorization: Bearer xoxp-...
                                       ▼
                               Slack Web API
                               users.profile.set
                                       │
                                       ▼
                          開発者本人のカスタムステータス更新
                          status_emoji = ":kinmu:"
```

**特徴:**
- バックエンドなし
- DBなし
- AWSなし
- アプリから Slack API を直接呼ぶだけ

---

## 4. 技術選定

### 4.1 フレームワーク
- **Expo Dev Client + React Native + TypeScript**

### 4.2 主要ライブラリ
| ライブラリ | 用途 |
|---|---|
| `react-native-beacon-radar` | iBeacon 検知 |
| `expo-secure-store` | **Slack トークンの安全な保管**（iOS Keychain / Android Keystore） |
| `expo-task-manager` | バックグラウンドタスク基盤 |
| `expo-location` | iOS Region Monitoring 起動用 |
| `axios` または `fetch` | Slack API 呼出 |

### 4.3 ハードウェア
- サンワサプライ MM-BLEBC3 1セット（¥12,000 / 3個）

---

## 5. Slack 連携設計（OAuth なし版）

### 5.1 Slack App の準備（一度だけ・開発者本人が実施）

1. https://api.slack.com/apps で社内ワークスペースに Slack App を新規作成
   - App名: 例 `出社番長 (Dev)`
2. **OAuth & Permissions** で以下の **User Token Scopes** を設定
   - `users.profile:write`（ステータス書き換え）
   - `users.profile:read`（現状確認・冪等化用）
3. **Install to Workspace** で自分のワークスペースに直接インストール
   - Slack の管理者承認が必要な場合あり（社内ポリシー次第）
4. インストール完了後、画面に表示される **User OAuth Token (`xoxp-...`)** をコピー
5. `:kinmu:` 絵文字をワークスペースに登録（カスタム絵文字）
6. 入口に設置するビーコンの UUID / Major / Minor を控える

**重要:** OAuth コールバック URL は不要。Slack ログイン画面も不要。トークン1個を手動コピーして使う。

### 5.2 トークンの保管方法

| タイミング | 保管場所 | 方法 |
|---|---|---|
| 開発時 | `.env.local` （**git ignore**） | `SLACK_USER_TOKEN=xoxp-...` |
| 初回起動時 | `expo-secure-store` | アプリ起動 → 設定画面でトークンを貼り付け → Secure Storage に保存 |
| 以降 | `expo-secure-store` から都度ロード | 平文では一切扱わない |

`.env` をリポジトリに **絶対コミットしない**（`.gitignore` 必須）。万一漏れたら Slack 管理画面から該当 App をアンインストールしてトークン即無効化。

### 5.3 ステータス更新 API 呼出

```ts
// アプリから直接呼ぶ
async function setKinmuStatus(token: string) {
  const res = await fetch('https://slack.com/api/users.profile.set', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      profile: {
        status_text: '出社中',
        status_emoji: ':kinmu:',
        status_expiration: 0, // 自動クリアしないなら 0
      },
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json;
}
```

### 5.4 冪等化（同日重複防止）

サーバーがないので **アプリのローカルストレージで管理**:
- AsyncStorage に `last_kinmu_set_date = YYYY-MM-DD（JST）` を保存
- 検知時に「今日の日付と一致するか」をチェック
- 一致 → API 呼ばずスキップ
- 不一致 → API 呼出、成功したら日付を更新

万一の取りこぼし用に `users.profile.get` で実際の現在ステータスも確認して二重ガードしてもよい（任意）。

---

## 6. アプリ側の処理フロー

```
初回起動:
  1. 設定画面で Slack トークン (xoxp-...) を入力 → expo-secure-store に保存
  2. 検知対象ビーコンの UUID / Major / Minor を入力（or 環境変数で固定）
  3. iBeacon Region Monitoring 開始

iBeacon 検知時（フォアグラウンド/バックグラウンド共通）:
  1. UUID / Major / Minor が登録値と一致するか確認
  2. RSSI 閾値（例: -75 dBm 以上）を満たすか確認
  3. AsyncStorage で「今日すでに :kinmu: セット済か」を確認
  4. 未セットなら:
       a. expo-secure-store から Slack トークン取得
       b. fetch('https://slack.com/api/users.profile.set') 実行
       c. 成功したら AsyncStorage に今日の日付を保存
  5. （任意）通知: "出社を打刻しました"
```

---

## 7. 設定値（環境変数 / アプリ内設定）

| キー | 用途 | 保管場所 |
|---|---|---|
| `SLACK_USER_TOKEN` | Slack User OAuth Token | `expo-secure-store`（推奨） or `.env.local` |
| `BEACON_UUID` | 受け付けるビーコンUUID | アプリ内定数 or `.env` |
| `BEACON_MAJOR` | Major（任意） | アプリ内定数 |
| `BEACON_MINOR` | Minor（任意） | アプリ内定数 |
| `RSSI_THRESHOLD` | 検知判定するRSSI下限（例: -75） | アプリ内定数 |
| `STATUS_EMOJI` | `:kinmu:` | アプリ内定数 |
| `STATUS_TEXT` | `出社中` | アプリ内定数 |

`.env.local` は `.gitignore` で必ず除外。EAS Build 時は EAS Secrets / `eas.json` の env で渡す。

---

## 8. WBS（開発工程）

| # | フェーズ | 期間目安 | 主な作業 |
|---|---|---|---|
| 1 | 準備 | 2〜3日 | ビーコン購入・設定、Slack App 作成、`xoxp-` トークン取得、`:kinmu:` 絵文字登録 |
| 2 | アプリPoC（フォアグラウンド） | 3〜5日 | Expo Dev Client セットアップ、`react-native-beacon-radar` で検知ログ表示 |
| 3 | Slack API 呼出実装 | 2〜3日 | `users.profile.set` 直接呼出、トークン Secure Storage 保管、設定画面 |
| 4 | 冪等化 | 1〜2日 | AsyncStorage で日付管理、重複呼出防止 |
| 5 | バックグラウンド対応 | 1週間 | iOS Region Monitoring / Android Foreground Service |
| 6 | 個人検証 | 3〜5日 | 自分が出社して動作確認、誤検知率測定、RSSI 閾値チューニング |

**合計目安: 約 3〜4 週間**（OAuth とバックエンドを省いたので大幅短縮）

---

## 9. 必要パーミッション

### iOS（`app.json` / Info.plist）
- `NSLocationAlwaysAndWhenInUseUsageDescription`（"オフィス入口でのビーコン検知に使用します"）
- `NSBluetoothAlwaysUsageDescription`
- Background Modes: `location`, `bluetooth-central`

### Android
- `ACCESS_FINE_LOCATION`
- `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`
- `FOREGROUND_SERVICE`
- `POST_NOTIFICATIONS`（Android 13+）

---

## 10. セキュリティ上の注意点（単一ユーザー版）

| リスク | 対策 |
|---|---|
| トークンの git 漏洩 | `.env.local` を `.gitignore`、本体は `expo-secure-store` で扱う |
| 端末紛失時のトークン悪用 | 紛失時は Slack 管理画面から App をアンインストール → トークン即無効化 |
| トークン平文ログ | `console.log` でトークンを出さない、エラーレスポンスもマスキング |
| スコープ過剰付与 | `users.profile:write` と `users.profile:read` のみに絞る（メッセージ送信権限は付けない） |
| ビルド成果物への埋込 | 配布バイナリにトークンをハードコードしない（必ず Secure Storage 経由） |

---

## 11. リスクと対策（機能面）

| リスク | 影響 | 対策 |
|---|---|---|
| `:kinmu:` 絵文字未登録 | テキストのみ表示で見栄え悪 | App 作成時にカスタム絵文字登録を済ませる |
| iOS でアプリ完全終了状態 | 検知不能 | Region Monitoring は OS が起こすが、swipe kill 後は不可（既知の制約） |
| Slack トークン失効 | 更新失敗 | アプリ起動時に `auth.test` で死活確認、失効時は再貼り付け促す |
| 同日複数回検知（外出→戻り） | 重複API呼出 | AsyncStorage 日付ガード |
| Slack レート制限（429） | 一時的失敗 | クライアント側クールダウン（例: 1分以内の再呼出を抑止） |

---

## 12. 受け入れ基準（Phase 1 完了条件）

- [ ] 開発者本人の端末でアプリが iBeacon を検知できる
- [ ] 検知から 3 秒以内に Slack カスタムステータスが `:kinmu:` に切り替わる
- [ ] 同日2回目以降の検知では Slack API が呼ばれない（冪等性）
- [ ] iOS で動作確認済み
- [ ] バックグラウンド（アプリ未操作）で 10 回中 5 回以上検知できる（Phase 2 で改善）
- [ ] Slack トークンがソースコード/git に含まれない

---

## 13. Phase 2 への引き継ぎ事項

Phase 2 では複数ユーザー対応のためにバックエンドと OAuth が必要になる。Phase 1 のコードを以下の方針で書いておくと移行が楽:

- **Slack 呼出処理を `slackClient.setStatus(token, ...)` のような関数に分離**
  → Phase 2 でバックエンド経由呼出に差し替え可能
- **検知ロジックは UI / 認証から独立**させる
  → トリガーされた時に「何をするか」を Action インターフェースで切り出す
- **設定値（UUID / Major / Minor / RSSI閾値）はアプリ内定数 or `.env`**
  → Phase 2 でバックエンド DB に移しても配置を変えるだけで済む構造に

---

## 14. 次のアクション

1. Slack App を社内ワークスペースに作成、`Install to Workspace` で `xoxp-` トークン取得
2. `:kinmu:` 絵文字をワークスペースに登録
3. Expo プロジェクト作成（`npx create-expo-app`、Dev Client 構成）
4. `react-native-beacon-radar` 動作確認（フォアグラウンド検知）
5. Slack `users.profile.set` 直接呼出 → ステータス変更動作確認
