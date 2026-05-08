# Phase 3 開発計画書: Slack 多人数 OAuth 連携追加 & 並列アクション化

作成日: 2026-05-08
対象: 開発フェーズ第3段階（**Phase 2 のリポジトリを継続拡張**）
前提: Phase 2 の M365 SSO + Outlook 終日予定登録機能が安定稼働している

---

## 1. ゴール

Phase 2 で構築した「iBeacon 検知 → Outlook に【出社】登録」基盤に、
**社員それぞれの Slack アカウントへのカスタムステータス自動更新** を追加する。

1. **各ユーザーが自分の Slack アカウントで OAuth 認可**
   - Slack User OAuth Token を **端末の Secure Storage に保管**
   - Phase 1 の手動トークン貼り付けは廃止し、認可フローで取得
2. **iBeacon 検知時、Outlook 登録と並列で Slack ステータス更新を実行**
   - `status_emoji = ":kinmu:"` / `status_text = "出社中"`
   - 同日重複は防止（Outlook 側と同じ思想）
   - 片方失敗でもう片方は完遂（部分成功を許容）

---

## 2. スコープ（やること / やらないこと）

| 区分 | 項目 |
|---|---|
| ✅ やる | Slack App の OAuth 配布対応（Workspace 内配布） |
| ✅ やる | アプリ側で `expo-auth-session` を使った Slack OAuth フロー |
| ✅ やる | **トークン交換用の最小バックエンド or 手動方式の選択** （§4 で判断） |
| ✅ やる | Slack `users.profile.set` 呼出（端末から直接） |
| ✅ やる | Outlook と Slack の **並列実行**（Promise.allSettled） |
| ✅ やる | 同日重複防止（Slack 側にも独立の AsyncStorage キー） |
| ✅ やる | 連携解除UI（Secure Storage の Slack トークン削除） |
| ❌ やらない | 退社検知・Slack ステータスの自動クリア |
| ❌ やらない | Slack へのメッセージ投稿、DM 送信などの追加機能 |
| ❌ やらない | Teams プレゼンス連動、勤怠SaaS連携 |

---

## 3. システム構成

```
[BLEビーコン]  ──iBeacon電波──>  [スマホアプリ（各社員）]
  (オフィス入口)                       │
                                       │ M365 + Slack を連携済
                                       │
                       ┌───────────────┼────────────────┐
                       │ HTTPS         │                 │ HTTPS
                       │ Bearer xoxp-  │                 │ Bearer eyJ...
                       ▼                                 ▼
              Slack Web API                   Microsoft Graph API
        (users.profile.set)                  (POST /me/events)
                       │                                 │
                       ▼                                 ▼
              [Slack ワークスペース]               [Outlook カレンダー]
              status_emoji = :kinmu:           終日予定「【出社】」を登録
```

オプション要素として、Slack OAuth 用の **最小バックエンド（トークン交換専用）** を1関数だけ立てる構成（§4 参照）。

---

## 4. Slack OAuth 設計の選択肢

Slack の `oauth.v2.access`（認可コード → トークン交換）は **Client Secret が必要** で、純粋なオンデバイス完結はできない。Phase 3 着手時に以下の2案を比較して採用方針を確定する。

### 方式A: 最小バックエンド（推奨）

**構成:** Cloudflare Workers / AWS Lambda の **単一エンドポイント** だけを立て、`oauth.v2.access` の Client Secret 注入だけを担う。

```
[アプリ] ──code──> [Backend /slack/exchange] ──code+secret──> [Slack /oauth.v2.access]
                          │
                          ▼ access_token を返す
                     [アプリ]
                       Secure Storage に保管
                       以降の users.profile.set は端末から直接呼ぶ
```

| メリット | デメリット |
|---|---|
| 各ユーザーが自然な OAuth フローでログイン | バックエンドを1つ増やす（最小構成だが運用が発生） |
| Slack App の管理者承認が一度で済む | Cloudflare Workers / AWS のコストと監視責務 |
| トークンは端末側に保管され、バックエンドはステートレスでOK | デプロイパイプラインを整える必要 |

**推奨理由:** 多人数運用の負担と、立てるバックエンドの軽さ（**1 関数のみ・DB 不要・ステートレス**）の天秤で、運用負荷の方が圧倒的に重い。Cloudflare Workers なら無料枠で完結する規模。

### 方式B: 各ユーザーが手動でトークン発行

Phase 1 と同様に「Install to Workspace」を各ユーザー自身が実行して `xoxp-` をコピー、アプリの設定画面に貼り付ける。

| メリット | デメリット |
|---|---|
| バックエンド完全不要、Phase 2 の方針を維持 | ユーザー全員が Slack 開発者画面で操作する必要あり |
| インフラ運用ゼロ | 説明・サポートコストが大きい |
| 退職者対応も Slack 側で完結 | 社員ごとの導入オペレーションがバラつく |

**現実性:** 数名規模なら可。数十名以上では運用が破綻するため非推奨。

### 方式C: Slack 管理者が代行発行

ワークスペース管理者が User OAuth Token を社員ごとに発行 → 配布。
**評価:** Slack 側でセルフサービスすべきものを管理者が肩代わりする形になり、現実的でない。

### 採用方針（初期案）
- **方式A（最小バックエンド）を本命**
- バックエンドは **Cloudflare Workers** で `/slack/exchange` 1 ルートだけ
- 1 リクエスト ≈ 数 ms、無料枠（100k req/day）に余裕で収まる規模
- 認証は Slack の `state` パラメータで CSRF 対策

---

## 5. Slack App の準備（管理者作業）

1. https://api.slack.com/apps で社内ワークスペースに **Slack App を新規作成**（Phase 1 とは別 App として作成）
2. **OAuth & Permissions**:
   - **User Token Scopes**: `users.profile:write`, `users.profile:read`
   - **Redirect URLs**: `https://api.shussha-bancho.example.com/slack/exchange`（方式A）
     - ※ アプリの deep link（`shussha-bancho://oauth/slack`）はバックエンドからアプリに戻す経路で使用
3. **Distribution**: Workspace 内のみ配布（Public Distribution 化はしない）
4. `:kinmu:` 絵文字をワークスペースに登録（既登録ならスキップ）

---

## 6. アプリ側の OAuth フロー（方式A前提）

```
[アプリ]
  │ 1. ユーザーが「Slack を連携する」をタップ
  │ 2. expo-auth-session で認可URL生成（state, redirect_uri）
  ▼
[Slack 認可画面]（システムブラウザ or in-app browser）
  │ 3. ユーザーが認可
  ▼
[Backend /slack/exchange?code=...]
  │ 4. Backend が Client Secret 付きで oauth.v2.access を呼出
  │ 5. access_token 取得 → アプリへ deep link で戻す
  ▼
[アプリ]
  │ 6. expo-secure-store に slack_user_token を保管
  │ 7. 連携完了UI表示
```

バックエンドは **トークンを保存しない**（ステートレス）。トークン保管はあくまで端末側の Secure Storage。

---

## 7. ステータス更新 API 呼出（端末から直接）

```ts
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
        status_expiration: 0,
      },
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json;
}
```

冪等化:
- AsyncStorage に `last_kinmu_set_date = YYYY-MM-DD（JST）` を保存
- Outlook 側の `last_outlook_register_date` とは別キーで独立管理

---

## 8. 検知 → 並列アクション設計

```
iBeacon 検知時:
  ↓
ビーコン UUID/Major/Minor 一致 + RSSI 閾値クリア
  ↓
   ├──> [Action: SlackStatus]    Slack ステータスを :kinmu: に
   │       ├ AsyncStorage で当日処理済みかチェック
   │       └ 未処理なら users.profile.set 呼出
   │
   └──> [Action: OutlookEvent]   Outlook に【出社】終日予定を登録
           ├ AsyncStorage で当日処理済みかチェック
           └ 未処理なら POST /me/events 呼出
  ↓
両アクションを Promise.allSettled で並列実行（片方失敗でもう片方は完遂）
  ↓
それぞれ成功時のみ AsyncStorage に当日日付を記録
  ↓
（任意）通知: "出社を打刻しました（Slack ✅ / Outlook ✅）"
```

実装上のポイント:
- Phase 2 で仕込んだ **Action 抽象化** を活用
- 新規アクション `SlackStatusAction` を追加するだけで既存パイプラインに組込み可能
- 部分成功（Outlook 失敗 / Slack 成功 など）はログとUIで区別表示

---

## 9. ローカル保管データ（Phase 3 で追加分）

| キー | 保管場所 | 用途 |
|---|---|---|
| `slack_user_token` | `expo-secure-store` | Slack `users.profile.set` 呼出用 |
| `slack_user_id` | `expo-secure-store` | 表示・冪等化補助 |
| `slack_team_id` | `expo-secure-store` | 表示・連携先ワークスペース確認 |
| `last_kinmu_set_date` | AsyncStorage | Slack 重複防止（Outlook と独立） |

Phase 2 の保管データはそのまま継続使用。

---

## 10. 環境変数（Phase 3 で追加）

| 変数 | 用途 |
|---|---|
| `SLACK_CLIENT_ID` | Slack App のClient ID（アプリ・バックエンド両方で使用） |
| `SLACK_CLIENT_SECRET` | **バックエンドのみ**。アプリには絶対埋め込まない |
| `SLACK_REDIRECT_URI` | OAuth コールバック URL（バックエンドのエンドポイント） |
| `SLACK_APP_DEEPLINK` | アプリへ戻すための deep link（例: `shussha-bancho://oauth/slack`） |
| `STATUS_EMOJI` | `:kinmu:` |
| `STATUS_TEXT` | `出社中` |

---

## 11. バックエンド（最小構成・方式A）

### 11.1 構成
- **ランタイム**: Cloudflare Workers（または AWS Lambda + API Gateway）
- **エンドポイント**: 1 つだけ（`GET /slack/exchange`）
- **DB**: なし（ステートレス）
- **環境変数**: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `ALLOWED_ORIGINS`

### 11.2 処理内容
```ts
// 疑似コード
export default {
  async fetch(req: Request, env: Env) {
    const { code, state } = parseQuery(req.url);
    if (!isValidState(state)) return new Response('Invalid state', { status: 400 });

    const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.SLACK_CLIENT_ID,
        client_secret: env.SLACK_CLIENT_SECRET,
        code,
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenJson.ok) return new Response('Slack error', { status: 400 });

    // アプリへ deep link で戻す。トークンは Backend では保持しない
    const deepLink = `shussha-bancho://oauth/slack?token=${encodeURIComponent(tokenJson.authed_user.access_token)}&user=${tokenJson.authed_user.id}&team=${tokenJson.team.id}`;
    return Response.redirect(deepLink, 302);
  }
};
```

### 11.3 セキュリティ
- `state` で CSRF 防止（アプリ側でランダム生成、バックエンドは受領のみ）
- Slack 以外からの呼出を防ぐため、Cloudflare の WAF で Slack 認可フロー以外をブロック（任意）
- ログには **トークンを出力しない**

### 11.4 デプロイ
- Cloudflare Workers なら `wrangler deploy` 一発
- 独自ドメイン（例: `api.shussha-bancho.example.com`）を Workers にバインド
- ステージング / 本番でシークレット分離

---

## 12. アプリ側変更点（Phase 2 → Phase 3 差分）

### 12.1 ライブラリ追加
- なし（`expo-auth-session` は Phase 2 で導入済、Slack 用にも流用）

### 12.2 画面追加 / 変更
- **メイン画面**: Slack 連携状態の表示追加
- **連携画面**: 「Slack を連携する」ボタン追加
- **設定画面**: Slack 連携解除（Secure Storage の `slack_user_token` 削除）

### 12.3 既存検知ロジック
- Phase 2 の Action 配列に `SlackStatusAction` を追加するだけ
- 検知トリガー部分は変更なし

---

## 13. WBS（Phase 3 開発工程）

| # | フェーズ | 期間目安 | 主な作業 |
|---|---|---|---|
| 1 | 方式判断 | 2〜3日 | 方式A（最小バックエンド）か方式B（手動）の最終決定、運用負荷見積 |
| 2 | Slack App 準備 | 1〜2日 | アプリ作成、Scopes 設定、Redirect URL 登録、`:kinmu:` 絵文字確認 |
| 3 | 最小バックエンド構築 | 3〜5日 | Cloudflare Workers セットアップ、`/slack/exchange` 実装、デプロイ |
| 4 | アプリ Slack OAuth 実装 | 1週間 | `expo-auth-session` で認可フロー、deep link 受け取り、Secure Storage 保管 |
| 5 | Slack ステータス更新 | 2〜3日 | `users.profile.set` 直接呼出、冪等化、エラーハンドリング |
| 6 | 並列アクション組込み | 2〜3日 | Outlook と並列実行、部分成功 UI、ログ整備 |
| 7 | 結合テスト | 1週間 | 入退場テスト、両連携の整合、トークン期限切れ復旧 |
| 8 | 社内βテスト | 1〜2週間 | 数十名規模、誤検知率・成功率の継続観測 |
| 9 | 本番リリース | 1週間 | アプリ更新配布、社員向けマニュアル更新 |

**合計目安: 約 4〜6 週間**

---

## 14. セキュリティ

| 項目 | 対策 |
|---|---|
| Slack トークン保管 | アプリ: `expo-secure-store`（OS のセキュアエリア） |
| Client Secret | **バックエンドのみ**、Cloudflare Workers のシークレットに格納 |
| OAuth CSRF | `state` パラメータで対策 |
| スコープ最小化 | `users.profile:write` / `users.profile:read` のみ（メッセージ送信権限は付与しない） |
| 退職者対応 | Slack 管理者が該当ユーザーをワークスペースから除外 → トークン無効化 |
| 通信 | HTTPS / TLS 1.2+ 必須 |
| ログにトークンを出さない | バックエンド・アプリ双方で `console.log` マスキング |

---

## 15. リスクと対策

| リスク | 影響 | 対策 |
|---|---|---|
| Slack トークンの長期失効 | ステータス更新失敗 | アプリ起動時に `auth.test` で死活確認、失効時は再認可 UI へ誘導 |
| `:kinmu:` 絵文字未登録 | テキストのみ表示 | リリース前にワークスペース管理者へ事前登録依頼 |
| 同日複数回検知（外出→戻り） | 重複API呼出 | AsyncStorage の `last_kinmu_set_date` で抑止 |
| Slack レート制限（Tier1, ~1 req/sec） | 一時的失敗 | クライアント側クールダウン、Outlook と並列でも同一エンドポイントは1回のみ |
| バックエンド障害 | 新規 OAuth フロー停止（既存ユーザーは影響なし） | Cloudflare Workers は SLA 高、ヘルスチェック + Slack 通知 |
| Outlook 成功 / Slack 失敗の片側障害 | 出社状態に齟齬 | UI で「Outlook ✅ / Slack ❌（再試行）」を表示、手動再試行ボタン |
| 社員が Slack 認可を拒否 | Slack 側のみ機能しない | Outlook 連携のみで動作継続（Phase 2 と同等の挙動） |

---

## 16. 受け入れ基準（Phase 3 完了条件）

- [ ] 各社員が自分の Slack アカウントで認可を完了できる（バックエンド経由 OAuth）
- [ ] iBeacon 検知時、Slack ステータス更新と Outlook 予定登録が **両方** 5秒以内に完了
- [ ] 同日2回目以降の検知で **どちらも** 重複実行されない
- [ ] Outlook と Slack 片方の失敗が他方の処理に影響しない（部分成功）
- [ ] 設定画面から Slack 連携解除ができる（トークン即破棄）
- [ ] バックエンドはステートレス（トークン保管しない）であることをコードで確認
- [ ] Slack トークンがソースコード/git/ログに含まれない

---

## 17. Phase 4 以降の拡張余地（参考）

- 退社検知（離脱判定）→ Slack ステータス自動クリア、Outlook 予定の終了時刻を実時間に更新
- Teams プレゼンス連動
- 勤怠 SaaS（freee人事労務、ジョブカン等）への打刻連携
- 管理者ダッシュボード（出社実績の集約、Phase 3 のバックエンドを拡張）

---

## 18. 次のアクション

1. 方式A／方式B の最終決定（推奨は方式A・最小バックエンド）
2. Slack App を社内ワークスペースに新規作成、Scopes と Redirect URL 設定
3. Cloudflare Workers アカウント開設、独自ドメイン（or workers.dev）でエンドポイント確保
4. `/slack/exchange` 実装 → ステージングで OAuth フロー疎通確認
5. Phase 2 アプリに Slack 連携 UI を追加、検知時の並列アクションに組込み
6. 社内数名で結合テスト → β → 本番
