# Phase 2 開発計画書: Microsoft365 SSO & Outlook 終日予定「【出社】」登録

作成日: 2026-05-08
対象: 開発フェーズ第2段階（**Phase 1 とは別リポジトリで新規開発**）
位置付け: Phase 1 は開発者個人での iBeacon 検知 PoC として完了させ、本フェーズ以降は別リポジトリに移管して本番想定の多人数アプリとしてゼロから構築する

---

## 1. ゴール

社員それぞれが自分の M365 アカウントでログインして利用できる、
**iBeacon 検知日の Outlook カレンダーに「【出社】」終日予定を自動登録するアプリ** を新規構築する。

1. **Microsoft365（Entra ID）による SSO 認証**
   - 各ユーザーが自分の M365 アカウントでアプリにログイン
   - Entra ID の発行するアクセストークンを **端末の Secure Storage に保管**
2. **iBeacon 検知日の Outlook カレンダーに終日予定「【出社】」を登録**
   - アプリから Microsoft Graph API を **直接呼出**（バックエンドなし）
   - 同日重複登録は防止

**設計方針:** **バックエンドレス・オンデバイス完結**。M365 SSO もスマホアプリ単独で完結する PKCE フローを使う。

---

## 2. スコープ（やること / やらないこと）

| 区分 | 項目 |
|---|---|
| ✅ やる | 新規 Expo プロジェクトを別リポジトリで作成 |
| ✅ やる | iBeacon 検知（`react-native-beacon-radar` 採用、Phase 1 と同じ選定） |
| ✅ やる | Entra ID アプリ登録、`expo-auth-session` で **オンデバイス OAuth 2.0 PKCE** |
| ✅ やる | Microsoft Graph API `POST /me/events`（端末から直接） |
| ✅ やる | リフレッシュトークンによる自動更新（端末内で完結） |
| ✅ やる | 同日重複登録防止（AsyncStorage + Graph 事前チェック） |
| ✅ やる | 多人数（社員ごとに自分の M365 でログイン）対応 |
| ❌ やらない | **Slack 連携（Phase 3 で多人数 OAuth として新規導入）** |
| ❌ やらない | **バックエンドAPI / DB / AWS** |
| ❌ やらない | Teams 連携、退社時の予定編集 |
| ❌ やらない | 勤怠SaaS連携、管理者ダッシュボード |

---

## 3. システム構成（Phase 2 完成形・バックエンドレス）

```
[BLEビーコン]  ──iBeacon電波──>  [スマホアプリ（各社員）]
  (オフィス入口)                       │
                                       │ 起動時に M365 SSO ログイン
                                       │  → access_token / refresh_token を Secure Storage に保管
                                       │
                                       │ HTTPS
                                       │ Authorization: Bearer eyJ...
                                       ▼
                               Microsoft Graph API
                               POST /me/events
                                       │
                                       ▼
                               [Outlook カレンダー]
                          終日予定「【出社】」を登録
```

**特徴:**
- バックエンドなし
- DBなし
- AWSなし
- アプリから Microsoft Graph を直接呼ぶ

---

## 4. 認証アーキテクチャ

### 4.1 Entra ID 設定（管理者作業）

> Phase 2 は **モバイルアプリ + PKCE** 方式。
> Web アプリの SSO（remote-switch 等）と異なり **クライアントシークレットは作成しない**。

#### 4.1.1 アプリ登録

1. [Microsoft Entra 管理センター](https://entra.microsoft.com/) にサインイン
2. 左メニュー「ID」→「アプリケーション」→「アプリの登録」
3. 「新規登録」をクリック
4. 以下を入力して「登録」:

| 項目 | 値 |
|---|---|
| 名前 | `Shussha Bancho`（任意） |
| サポートされているアカウントの種類 | **組織ディレクトリ内のアカウントのみ（シングルテナント）** |
| リダイレクト URI | ここでは未設定（4.1.2 で追加） |

5. 登録完了後、概要画面で以下を記録:
   - **アプリケーション (クライアント) ID** → `M365_CLIENT_ID`
   - **ディレクトリ (テナント) ID** → `M365_TENANT_ID`

#### 4.1.2 プラットフォーム = Mobile and desktop applications

1. 左メニュー「認証」
2. 「プラットフォームを追加」→ **「Mobile and desktop applications」** を選択
3. 「カスタム リダイレクト URI」に以下を **両方** 登録:
   - iOS 用: `msauth.<iOS Bundle ID>://auth`
     - 例: `msauth.co.fusic.shusshabancho://auth`
   - Android 用: `msauth://<Android Package Name>/<base64 signature hash>`
     - signature hash の取得:
       ```bash
       keytool -exportcert -alias <key alias> -keystore <keystore path> \
         | openssl sha1 -binary | openssl base64
       ```
4. 「構成」→「保存」

> ⚠️ **「Web」プラットフォームを選んではいけない**。Web 登録だと Client Secret 必須になり PKCE 単独では認証が通らない。

#### 4.1.3 パブリック クライアント フローの許可

1. 「認証」画面の最下部「詳細設定」
2. **「パブリック クライアント フローを許可する」を「はい」** に変更
3. 「保存」

> モバイルアプリは Client Secret を保持できない＝「パブリック クライアント」扱い。
> この設定が無効だと `AADSTS7000218: client_assertion or client_secret required` で失敗する。

#### 4.1.4 API アクセス許可（委任権限）

1. 左メニュー「API のアクセス許可」
2. 「アクセス許可の追加」→「Microsoft Graph」→ **「委任されたアクセス許可」**
3. 以下にチェックを入れて「アクセス許可の追加」:

| スコープ | 用途 |
|---|---|
| `User.Read` | サインインユーザーのプロフィール取得 |
| `Calendars.ReadWrite` | Outlook カレンダー読み書き（**本アプリの核**） |
| `offline_access` | refresh_token 発行（端末内で更新） |
| `openid` | OIDC 必須 |
| `profile` | UPN・表示名取得 |
| `email` | メールアドレス取得 |

4. **「<テナント名> に管理者の同意を与えます」** をクリック → 「はい」
   - `Calendars.ReadWrite` は管理者同意が必要なケースが多い → **情シスとの事前調整を §15 の次アクションに含める**

#### 4.1.5 設定検証チェックリスト

- [ ] テナント ID / クライアント ID を控えた
- [ ] プラットフォームが **Mobile and desktop applications**
- [ ] リダイレクト URI に iOS/Android 両方が登録済み
- [ ] **「パブリック クライアント フローを許可する」= はい**
- [ ] API のアクセス許可に上記 6 スコープが揃い、ステータスが **「<テナント> に付与済み」**
- [ ] **クライアントシークレットを作成していない**（作ってあったら削除）

#### 4.1.6 よくあるエラーと対処

| エラー | 原因 | 対処 |
|---|---|---|
| `AADSTS50011: redirect_uri_mismatch` | アプリ実装の redirectUri と Entra ID 登録値が不一致 | 4.1.2 の URI とアプリ側 `AuthSession.makeRedirectUri` 等の出力を一致させる |
| `AADSTS7000218: client_assertion or client_secret required` | パブリック クライアント フロー無効 | 4.1.3 を有効化 |
| `AADSTS65001: consent_required` | 管理者同意未完了 / スコープ追加後に同意し直していない | 4.1.4 で再度「管理者の同意」を実施 |
| `invalid_grant: PKCE verification failed` | code_verifier と code_challenge が不一致 | アプリ側の PKCE 生成・保管ロジックを確認（`expo-auth-session` の標準フローに乗っていれば通常発生しない） |
| `AADSTS90008` / `insufficient_scope` | `Calendars.ReadWrite` が付与されていない | 4.1.4 でスコープを追加して管理者同意 |

### 4.2 オンデバイス PKCE フロー（バックエンド経由しない）

```
[アプリ]
  │ 1. PKCE verifier / challenge をローカル生成
  │ 2. AuthSession.useAuthRequest({ ..., codeChallenge })
  ▼
[Entra ID ログイン画面]（システムブラウザ or in-app browser）
  │ 3. ユーザーが M365 認証
  ▼
[アプリ] ← code がリダイレクトURIで戻る
  │ 4. fetch('https://login.microsoftonline.com/.../oauth2/v2.0/token') を直接呼出
  │    grant_type=authorization_code, code, code_verifier, client_id
  ▼
[Entra ID] → access_token / refresh_token / id_token を返す
  │
  ▼
[アプリ]
  expo-secure-store に access_token / refresh_token を保管
  以降は Graph API を直接呼ぶ
```

- **PKCE 必須**（モバイルアプリは Client Secret を持てないため）
- リフレッシュトークンも **アプリの Secure Storage に保管**
  - access_token 期限切れ時はアプリが直接 `/token` エンドポイントで refresh

### 4.3 トークン保管

| トークン | 保管場所 | 用途 |
|---|---|---|
| M365 access_token | `expo-secure-store` | `POST /me/events` |
| M365 refresh_token | `expo-secure-store` | access_token 更新用 |
| M365 id_token | メモリ or `expo-secure-store` | UI 表示の名前/メアド表示 |

すべて **iOS Keychain / Android Keystore** で保護。アプリ削除でトークンも消える。

---

## 5. Outlook 予定登録仕様

### 5.1 Microsoft Graph API（端末から直接呼出）
- エンドポイント: `POST https://graph.microsoft.com/v1.0/me/events`
- 認証: `Authorization: Bearer <access_token>`
- 必要スコープ: `Calendars.ReadWrite`（取得済の前提）

```json
POST https://graph.microsoft.com/v1.0/me/events
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "subject": "【出社】",
  "isAllDay": true,
  "start": { "dateTime": "2026-05-08T00:00:00", "timeZone": "Tokyo Standard Time" },
  "end":   { "dateTime": "2026-05-09T00:00:00", "timeZone": "Tokyo Standard Time" },
  "showAs": "free",
  "categories": ["出社"]
}
```

ポイント:
- `isAllDay: true` のとき `start` / `end` は **同タイムゾーン00:00**、終了は翌日00:00
- `showAs: "free"` で他予定との競合表示を回避
- 検知日付は **JST** で確定してから渡す（夜間検知の翌日ズレ防止）

### 5.2 重複登録防止
1. **AsyncStorage** に `last_outlook_register_date = YYYY-MM-DD` を保存
2. **Graph API 事前チェック**（オプション）:
   `GET /me/events?$filter=subject eq '【出社】' and start/dateTime ge '2026-05-08T00:00:00' and start/dateTime lt '2026-05-09T00:00:00'`
   - 既に存在 → スキップ
   - 存在しない → 新規作成
3. **タイムゾーン**: 常に `Tokyo Standard Time` 固定

### 5.3 失敗時のリトライ
- **401（access_token 期限切れ）**: 端末上で refresh_token を使ってトークン更新 → 自動リトライ1回
- **429（レート制限）**: `Retry-After` ヘッダ尊重、指数バックオフ最大3回
- **その他**: `console.warn` ログ + ユーザーへトースト通知（任意）

### 5.4 トークン自動更新
```ts
async function getValidAccessToken(): Promise<string> {
  let token = await SecureStore.getItemAsync('m365_access_token');
  const exp = await SecureStore.getItemAsync('m365_access_exp');
  if (!token || Date.now() > Number(exp) - 60_000) {
    token = await refreshM365Token(); // /token エンドポイントを直接叩く
  }
  return token;
}
```

---

## 6. 検知 → アクション設計

```
iBeacon 検知時:
  ↓
ビーコン UUID/Major/Minor 一致 + RSSI 閾値クリア
  ↓
AsyncStorage で「今日すでに Outlook 登録済か」確認
  ↓
未登録なら:
  ├─ M365 access_token 取得（必要なら refresh）
  ├─ Graph API 直接呼出 (POST /me/events)
  ├─ 成功時に AsyncStorage に当日日付を記録
  └─ 失敗時はリトライまたは通知
  ↓
（任意）通知: "出社を打刻しました（Outlook ✅）"
```

実装上のポイント:
- 検知トリガー部 → アクション実行部 を **疎結合に設計**
- 新規追加: `graphClient.registerKinmuEvent(date)` の関数
- Phase 3 で Slack を追加する想定で、**Action 抽象化（小さくてよい）** を最初から入れておく

---

## 7. ローカル保管データ

すべてアプリ端末内に閉じる。サーバー側 DB は無し。

| キー | 保管場所 | 用途 |
|---|---|---|
| `m365_access_token` | `expo-secure-store` | Graph API 呼出用 |
| `m365_access_exp` | `expo-secure-store` | 期限切れ判定 |
| `m365_refresh_token` | `expo-secure-store` | access_token 更新用 |
| `m365_oid` | `expo-secure-store` | 表示・ログ用（Entra ID オブジェクトID） |
| `m365_upn` | `expo-secure-store` | 表示用 UPN（user@example.com） |
| `last_outlook_register_date` | AsyncStorage | Outlook 重複防止 |
| `outlook_event_id_<date>` | AsyncStorage | 当日の Graph event ID（取消時用、任意） |

---

## 8. 環境変数（EAS Secrets / アプリ内定数）

| 変数 | 用途 |
|---|---|
| `M365_TENANT_ID` | Entra ID テナントID |
| `M365_CLIENT_ID` | アプリ登録のクライアントID |
| `M365_REDIRECT_URI_IOS` | iOS 用リダイレクトURI |
| `M365_REDIRECT_URI_ANDROID` | Android 用リダイレクトURI |
| `M365_SCOPES` | `User.Read Calendars.ReadWrite offline_access openid profile email` |
| `EVENT_TIMEZONE` | `Tokyo Standard Time` |
| `EVENT_SUBJECT` | `【出社】` |
| `BEACON_UUID` | 検知対象ビーコンUUID |
| `BEACON_MAJOR` / `BEACON_MINOR` | Major/Minor（任意） |
| `RSSI_THRESHOLD` | 検知判定するRSSI下限（例: -75） |

Tenant ID / Client ID は秘匿性が低いのでアプリ内定数でも可。本物の secret は **存在しない**（PKCE はクライアントシークレット不要）のがオンデバイス方式の利点。

---

## 9. アプリ構成（新規プロジェクト）

### 9.1 主要ライブラリ
- `react-native-beacon-radar`（iBeacon 検知）
- `expo-auth-session`（M365 PKCE フロー）
- `expo-web-browser`（認可画面表示、`expo-auth-session` の依存）
- `expo-secure-store`（トークン保管）
- `expo-task-manager` + `expo-location`（バックグラウンド検知 / Region Monitoring）
- `@react-native-async-storage/async-storage`（重複防止フラグ）
- Microsoft Graph 呼出は **`fetch` で十分**（公式 SDK は不要）

### 9.2 画面
- **初回起動**: 「Microsoft でサインイン」ボタンを最初に表示
- **メイン画面**: ログインユーザー名・連携状態・直近の打刻履歴
- **設定画面**: ログアウト（Secure Storage クリア）、再ログイン

### 9.3 必要パーミッション
- iOS: `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSBluetoothAlwaysUsageDescription`, Background Modes（`location`, `bluetooth-central`）
- Android: `ACCESS_FINE_LOCATION`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE`, `POST_NOTIFICATIONS`

---

## 10. WBS（Phase 2 開発工程）

| # | フェーズ | 期間目安 | 主な作業 |
|---|---|---|---|
| 1 | 新規リポジトリ立ち上げ | 2〜3日 | Expo プロジェクト作成、Dev Client 構成、CI/CD 雛形、Lint/型 |
| 2 | iBeacon 検知 | 3〜5日 | `react-native-beacon-radar` 導入、フォアグラウンド検知 |
| 3 | Entra ID 準備 | 3〜5日 | アプリ登録、リダイレクトURI、`Calendars.ReadWrite` 管理者同意 |
| 4 | M365 ログイン実装 | 1週間 | `expo-auth-session` で PKCE フロー、Secure Storage 保管、UI |
| 5 | トークン自動更新 | 2〜3日 | refresh_token フロー、期限切れ検知、エラーハンドリング |
| 6 | Outlook 連携実装 | 1週間 | `POST /me/events` 直接呼出、重複防止、リトライ |
| 7 | バックグラウンド対応 | 1〜2週間 | iOS Region Monitoring / Android Foreground Service |
| 8 | 多端末・多ユーザー検証 | 1〜2週間 | 数名で社内βテスト、誤検知率・成功率の継続観測 |
| 9 | 本番リリース | 1週間 | MDM 配布 or TestFlight / Internal Testing、社員向けマニュアル |

**合計目安: 約 7〜10 週間**

---

## 11. セキュリティ

| 項目 | 対策 |
|---|---|
| トークン保管 | アプリ: `expo-secure-store`（OS のセキュアエリア） |
| 通信 | TLS 1.2+ 必須（Microsoft Graph は標準対応） |
| スコープ最小化 | `Calendars.ReadWrite` のみ。`Mail.*` は要求しない |
| 退職者対応 | Entra ID で無効化 → 次回起動時に refresh が失敗してアプリ自動ログアウト |
| プライバシー | Outlook 予定登録の旨を社内ポリシーに明記、利用前に社員へ同意取得 |
| ログにトークンを出さない | `console.log` でアクセストークンを露出させない |

---

## 12. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| `Calendars.ReadWrite` の管理者同意が下りない | Outlook 連携不可 | 事前に情シス・セキュリティ部門と要件すり合わせ、必要性を文書化 |
| refresh_token 期限切れ | 検知時に予定登録失敗 | 端末側で再ログインを促す UI、起動時に死活チェック |
| 同日二重登録（再検知） | Outlook に複数の【出社】 | AsyncStorage 日付ガード + Graph 事前チェックの二重防御 |
| タイムゾーン誤り（夜間検知） | 翌日に予定が入る | 検知日付は **JST 固定で確定** してから Graph に渡す |
| Entra ID 条件付きアクセスでブロック | 一部社員が利用不可 | 情シスと連携、対象アプリを条件付きアクセスの例外に登録 |
| バックエンドレス＝集中監査が困難 | 失敗の全社把握ができない | 必要なら Phase 3 以降で軽量バックエンド（ログ集約のみ）を追加検討 |
| iOS のバックグラウンド検知が起動しない | 出社時に検知失敗 | iBeacon Region Monitoring 採用、フォアグラウンド補助検知 |

---

## 13. 受け入れ基準（Phase 2 完了条件）

- [ ] アプリ起動時に M365 ログインフローが正常動作（iOS/Android）
- [ ] M365 ログイン後、access_token / refresh_token が Secure Storage に保管される
- [ ] iBeacon 検知時、5秒以内に Outlook 予定登録が完了
- [ ] 同日2回目以降の検知で重複登録されない
- [ ] access_token 期限切れ時に refresh_token で自動更新 → 1回のリトライで成功
- [ ] 退職者を Entra ID で無効化すると、次回起動時にアプリのトークンが無効化される
- [ ] 複数名の社員が自分の M365 で正常にログイン・予定登録できる
- [ ] バックエンドが存在しないこと（オンデバイス完結方針が維持されていること）

---

## 14. Phase 3 以降の拡張余地（参考）

### 14.1 Phase 3: Slack 連携の多人数 OAuth 化（最有力）
社員それぞれの Slack アカウントで `users.profile:write` 認可を取得し、iBeacon 検知時に Outlook 登録と並列で Slack カスタムステータスを `:kinmu:` に切り替える。

- iBeacon 検知時、**Outlook 登録と Slack ステータス更新を並列実行**（Phase 2 で仕込んだ Action 抽象化を活用）
- 課題: Slack の `oauth.v2.access` は Client Secret が必要 → トークン交換専用の最小バックエンド（Cloudflare Workers / 単一 Lambda 関数）を1つだけ追加するか、各ユーザーが「Install to Workspace」で自前トークン取得を継続するかを Phase 3 着手時に判断

### 14.2 その他の拡張余地
- 退社検知（離脱判定）→ Outlook 予定の終了時刻を実時間に更新、Slack ステータス自動クリア
- Teams プレゼンス連動

---

## 15. 次のアクション

1. 新規リポジトリを作成、Expo Dev Client プロジェクトの雛形を整備
2. 情シス・セキュリティ部門と `Calendars.ReadWrite` の管理者同意取得を調整
3. Entra ID テナントでアプリ登録、リダイレクトURI 確定
4. `expo-auth-session` を組み込んで M365 ログインの PoC（数日）
5. Graph API `POST /me/events` を端末から直接呼ぶ動作確認
6. iBeacon 検知 → Outlook 登録の最小フロー疎通
