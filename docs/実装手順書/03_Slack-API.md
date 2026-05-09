# Step 3: Slack API クライアント

`users.profile.set` をアプリから直接呼び、カスタムステータスを `:kinmu:` に切り替える。
あわせて `auth.test` / `users.profile.get` を実装してデバッグ・冪等化に備える。

> 本ステップは **バックエンドを介さずアプリから直接 Slack に HTTPS リクエスト**する PoC 構成。
> Phase 2 以降でバックエンド経由に切り替えるため、**呼び出し点を `slackClient.ts` 1 ファイルに集約**しておく。

## 完了条件

- [ ] `slackClient.authTest(token)` で `ok: true` が取れる
- [ ] `slackClient.setKinmuStatus(token)` を呼ぶと Slack 上のカスタムステータスが :kinmu: に変わる
- [ ] エラー時は `SlackError` でラップされ、UI から `slack_error` まで取れる
- [ ] 429 (rate-limited) を受け取ると `retryAfterSec` がエラーから取れる
- [ ] ホーム画面の「Slack 接続テスト」「今すぐ :kinmu: にする (手動)」が両方動く

## 3.1 `src/api/slackClient.ts`

外部から触る関数は以下:

```ts
authTest(token: string): Promise<AuthTestResponse>
setKinmuStatus(token: string, input?: SetStatusInput): Promise<{ ok: true }>
getCurrentProfile(token: string): Promise<ProfileGetResponse>
isAlreadyKinmu(token: string): Promise<boolean>
```

### 設計のポイント

| ポイント | 理由 |
|---|---|
| 関数の **第1引数で `token` を受け取る** | Phase 2 でバックエンド経由に差し替えるとき、`token` をバックエンド呼び出し用 ID/JWT に置き換えるだけで済む |
| **`SlackError` クラス**にラップ | UI で `slack_error` の値（`token_revoked`, `not_authed`, `ratelimited` 等）を見て分岐できる |
| `429` を専用に拾い、`retryAfterSec` を抽出 | 仕様書 §11 のクールダウン要件に対応するため |
| 共通 `callSlack()` 内部関数 | エンドポイントを増やすときも HTTP / JSON のハンドリングを再利用 |
| **`status_expiration: 0`** | 自動クリアしない（Phase 1 §5.3）。Phase 2 で日付指定可能なシグネチャに拡張予定 |

### よくある Slack エラー

| `slackError` | 意味 | 対処 |
|---|---|---|
| `not_authed` | Authorization ヘッダ無し | コードのバグ。`token` が空でないか確認 |
| `invalid_auth` | トークン誤り | 設定画面でトークン再貼り付け |
| `token_revoked` / `account_inactive` | アンインストール / 退職等で失効 | Slack で再インストール → 新しい `xoxp-` を保存 |
| `missing_scope` | スコープ不足 | `users.profile:write` / `users.profile:read` を付け直して再インストール |
| `ratelimited` | レート上限 | `retryAfterSec` の秒数だけ待つ。Phase 1 ではクライアント側でクールダウン |
| `profile_set_failed` | 値が長すぎる等 | `status_text` を短くする（Slack は 100 文字まで） |

## 3.2 ホーム画面に検証 UI を追加

`src/screens/HomeScreen.tsx`:

| 表示 | 内容 |
|---|---|
| Slack トークン | `loadSlackToken()` の結果を `maskToken()` でマスク表示 |
| auth.test | `user`, `team` を表示 (ボタン押下後) |
| 現在のカスタムステータス | `getCurrentProfile()` の `status_emoji status_text` |

| ボタン | 動作 |
|---|---|
| Slack 接続テスト | `authTest()` + `getCurrentProfile()` を並列実行 |
| 今すぐ :kinmu: にする (手動) | `setKinmuStatus()` → `getCurrentProfile()` で結果反映 |
| 設定 | Settings 画面へ遷移 |

`navigation.addListener('focus', ...)` を使い、Settings 画面でトークンを保存/削除した後にホームに戻ったとき自動で再ロード。

## 3.3 動作確認（実機）

### 手順

1. 設定画面で **有効な `xoxp-...`** を保存して戻る
2. ホーム画面の **「Slack 接続テスト」** をタップ
   - `auth.test` カードに `user: <your_user>` と表示されれば成功
3. **「今すぐ :kinmu: にする (手動)」** をタップ
   - 「成功」アラート → 「現在のカスタムステータス」カードが `:kinmu: 出社中` に更新
   - 実際の Slack クライアント (PC/スマホ) でも自分のステータスが切り替わっていることを確認
4. **トークンを 1 文字書き換えて保存** → 「Slack 接続テスト」
   - `Slack エラー: invalid_auth` が出れば SlackError ハンドリング OK

### curl での突き合わせ確認 (任意)

アプリが失敗するときの原因切り分けに、Mac から同じトークンで curl してみる:

```bash
TOKEN="xoxp-..."
curl -s -X POST https://slack.com/api/auth.test \
  -H "Authorization: Bearer $TOKEN" | jq

curl -s -X POST https://slack.com/api/users.profile.set \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"profile":{"status_text":"出社中","status_emoji":":kinmu:","status_expiration":0}}' | jq
```

`{"ok": true}` が返ればトークン側は問題なし。アプリ側の問題に絞り込める。

## 3.4 commit

```bash
git add src/api src/screens/HomeScreen.tsx
git commit -m "Phase1: Step3 - Slack API クライアントと手動切替 UI"
```

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `:kinmu:` が反映されず `:speech_balloon:` 等になる | `:kinmu:` カスタム絵文字がワークスペース未登録。Step 2.1 の手順に戻る。 |
| 「成功」が出るのに Slack 上で変わらない | Slack クライアントのキャッシュ。10秒待つか別端末で確認。`getCurrentProfile()` でも反映されているか確認 |
| ネットワークエラーが出続ける | 社内 Wi-Fi のプロキシ。モバイル回線でも試す。`fetch` は React Native の組み込み実装 |
| `console.log(token)` を書きたくなる | **書かない**。マスクして `maskToken(token)` で出す。万一漏れたら Slack 管理画面から App をアンインストール |
