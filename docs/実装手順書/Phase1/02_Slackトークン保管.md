# Step 2: Slack トークン保管 + 設定画面

Slack App を作成して `xoxp-` トークンを取得し、アプリの **設定画面で貼り付け → Secure Storage に保存** できるようにする。
あわせて Beacon の UUID / Major / Minor / RSSI 閾値も AsyncStorage に保存する設定 UI を作る。

## 完了条件

- [ ] Slack App が社内ワークスペースに作成され、`xoxp-` トークンが取得できている
- [ ] `:kinmu:` 絵文字がワークスペースに登録されている
- [ ] アプリの設定画面でトークンの **保存 / 表示マスク / 削除** ができる
- [ ] アプリの設定画面で UUID / Major / Minor / RSSI 閾値が保存できる
- [ ] アプリ再起動後も値が残っている (Secure Storage / AsyncStorage)
- [ ] `npx tsc --noEmit` が通る

---

## 2.1 Slack App の作成（一度だけ・開発者本人）

> 仕様書 §5.1 と同じ内容。**OAuth コールバック URL は不要**、トークンを 1 個もらって使う。

1. https://api.slack.com/apps を開き **"Create New App"** → **"From scratch"**
2. App Name: `出社番長 (Dev)`、Workspace: 社内ワークスペース
3. 左メニュー **"OAuth & Permissions"** → "User Token Scopes" に以下を追加
   - `users.profile:write`
   - `users.profile:read`
4. 同画面の上部 **"Install to Workspace"** をクリック
   - Slack 管理者承認が必要な場合は依頼する
5. インストール後に表示される **"User OAuth Token (`xoxp-...`)"** をコピー
   - **このトークンが流出するとあなたの個人ステータスを書き換えられる**。Slack や git に貼らないこと。
6. ワークスペースのカスタム絵文字管理で `:kinmu:` を登録（PNG 1枚）
7. オフィス入口に設置する MM-BLEBC3 の UUID / Major / Minor を控える

### auth.test で動作確認（任意）

Mac 側で curl 1 発で確認しておくと、後で「アプリ実装が悪いのか、トークンが悪いのか」を切り分けやすい。

```bash
curl -s -X POST https://slack.com/api/auth.test \
  -H "Authorization: Bearer xoxp-..." | jq
```

`{"ok": true, "user": "...", ...}` が返ればトークンは有効。

---

## 2.2 Secure Storage ラッパーの実装

`src/storage/secureToken.ts` を作る:

```ts
import * as SecureStore from 'expo-secure-store';
import { SECURE_STORE_KEYS } from '../config/constants';

const KEYCHAIN_ACCESSIBLE = SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

export async function saveSlackToken(token: string): Promise<void> { /* ... */ }
export async function loadSlackToken(): Promise<string | null> { /* ... */ }
export async function deleteSlackToken(): Promise<void> { /* ... */ }
export function maskToken(token: string | null | undefined): string { /* ... */ }
```

ポイント:

- **`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`** を使う。`WHEN_UNLOCKED_*` 系だと、画面ロック中に
  iOS Region Monitoring がバックグラウンド起動されたとき **Secure Store からトークンを取り出せない**。
  Phase 1 はバックグラウンド検知も対象なので、起動から最初のアンロック以降は読める設定にする。
- `THIS_DEVICE_ONLY` を付けることで **iCloud Keychain 同期から除外**。端末紛失時に他端末へ漏れない。
- `maskToken` で UI 表示時は `xoxp-…1a2b` のように先頭5文字 / 末尾4文字だけ表示する。**ログにも生トークンを出さない**。

実体は `src/storage/secureToken.ts` を参照。

## 2.3 Beacon 設定の AsyncStorage ラッパー

`src/storage/beaconConfig.ts`:

- `loadBeaconConfig()` / `saveBeaconConfig()` で `BeaconConfig` を一括ロード / 保存
- UUID は **Apple 標準フォーマット (`8-4-4-4-12` の hex)** を `isUuidValid()` でバリデーション
- Major / Minor は **空文字 → null** として扱う（仕様書で「任意」のため）
- RSSI 閾値はデフォルト `-75 dBm`

実体は `src/storage/beaconConfig.ts` を参照。

## 2.4 設定画面の実装

`src/screens/SettingsScreen.tsx` で以下を実装:

### Slack トークンセクション

| UI | 動作 |
|---|---|
| `現在: xoxp-…1a2b` | `loadSlackToken()` の結果を `maskToken()` でマスク表示 |
| TextInput | `secureTextEntry` でデフォルト非表示。「表示」スイッチで一時的に平文化 |
| 「トークンを保存」 | `xoxp-` 始まりでない場合は確認ダイアログを挟む。OK で `saveSlackToken()` |
| 「トークンを削除」 | 確認ダイアログ → `deleteSlackToken()`、保存済が無ければ disabled |

### iBeacon 設定セクション

| UI | バリデーション |
|---|---|
| UUID | 空 OK / 入っていれば `isUuidValid` で形式チェック |
| Major / Minor | 空 OK / 入っていれば整数 |
| RSSI 閾値 | 必須・整数 (例: -75) |

「Beacon 設定を保存」で `saveBeaconConfig` 呼出。保存に失敗したら Alert で通知。

> Phase 1 PoC として最小実装。状態管理は `useState` で十分。Phase 2 で複数ユーザーやリモート設定が必要になったら React Context や Zustand 等の導入を検討。

## 2.5 動作確認（実機が必要）

`expo-secure-store` は **シミュレータでも動く** が、Keychain アクセシビリティの挙動は実機と微妙に違う。
ここで実機ビルドの初回が必要。

```bash
# iOS 実機を Mac に有線接続して
npx expo run:ios --device
```

Xcode が初回ビルドのために Apple Developer の Signing が必要なので、無料アカウントの Personal Team でも可。
詳細は Step 7 (動作確認) に記載。

確認項目:

1. 設定画面を開く → 何も保存していない状態で `現在: 未設定` 表示
2. `xoxp-...` を貼り付け → 「保存」 → `現在: xoxp-…XXXX` のマスク表示に切り替わる
3. アプリを kill → 再起動 → 同じ設定画面を開く → マスク値が残っている
4. 「削除」 → 確認 → 「未設定」に戻る
5. UUID / Major / Minor / RSSI も同様に保存・再起動後の保持を確認

## 2.6 commit

```bash
git add src/storage src/screens/SettingsScreen.tsx
git commit -m "Phase1: Step2 - Slack トークン Secure Storage + Beacon 設定 UI"
```

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| `SecureStore.setItemAsync is not a function` | `expo-secure-store` 未インストール、または Expo Go で実行している。Dev Client ビルドで実機実行する。 |
| 保存はできるがアプリ再起動で消える | `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` を読み出し時にも指定しているか確認。`load` 側の options にも渡す。 |
| Android で `Failed to encrypt` | Keystore の互換性問題。ターゲット端末を変えるか、`keychainAccessible` を明示しない（OS デフォルト）にしてみる。 |
| `users.profile:read` を付け忘れた | App の OAuth & Permissions 画面でスコープ追加 → "Reinstall to Workspace" → 新しい xoxp- トークンを発行 |
