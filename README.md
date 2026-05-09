# 出社番長 (Shussha-Bancho)

オフィス入口に設置した BLE ビーコン（iBeacon）をスマホアプリが検知し、社員の出社を自動的に記録するアプリ。Expo で iOS/Android 両対応。

## 概要

社員が出社してオフィス入口を通過すると、スマホアプリが iBeacon 信号を検知し、以下を自動実行する:

- Slack カスタムステータスを `:kinmu:` に自動切替
- Outlook カレンダーに「【出社】」の終日予定を登録

これらの機能を **3 段階のフェーズ** に分けて開発する。

---

## 開発フェーズ

### [Phase 1: iBeacon 検知 → Slack ステータス自動切替](docs/仕様書/Phase1_Slackステータス連携.md)

- **開発者 1 名のみで動かす最小 PoC**
- iBeacon の検知ロジックが実用に耐えるかを最小コストで検証する
- Slack トークンは手動取得して端末に保管、OAuth フローは省略
- バックエンドなし
- **このリポジトリで実装**（実装手順書: [docs/実装手順書/](docs/実装手順書/README.md)）

### [Phase 2: Microsoft365 SSO + Outlook 終日予定登録](docs/仕様書/Phase2_M365SSO_Outlook予定登録.md)

- **多人数対応・本番想定の本実装**
- 各社員が自分の M365 アカウントでアプリにログイン（Entra ID / OAuth 2.0 PKCE）
- iBeacon 検知日の Outlook カレンダーに「【出社】」終日予定を自動登録
- Microsoft Graph API をスマホアプリから直接呼出
- **バックエンドレス・オンデバイス完結**

### [Phase 3: Slack 多人数 OAuth 連携](docs/仕様書/Phase3_Slack多人数連携.md)

- Phase 2 を継続拡張
- 各社員の Slack アカウントに対して `:kinmu:` ステータスを自動更新
- Outlook 登録と並列実行（片方失敗でも他方は完遂）
- Slack の `oauth.v2.access` 用に **最小バックエンド（Cloudflare Workers 1 関数）** を追加

---

## 技術選定（共通方針）

| 領域 | 採用 |
|---|---|
| フレームワーク | Expo Dev Client + React Native + TypeScript |
| iBeacon 検知 | `react-native-beacon-radar` |
| 認証 | `expo-auth-session`（OAuth 2.0 PKCE）※Phase 2 以降 |
| トークン保管 | `expo-secure-store`（iOS Keychain / Android Keystore） |
| バックグラウンド検知 | `expo-task-manager` + iOS Region Monitoring / Android Foreground Service |
| ハードウェア | サンワサプライ MM-BLEBC3（iBeacon 対応・技適取得済） |

詳細な選定根拠は各 Phase の計画書に記載。

---

## ドキュメント

- 仕様書
  - [Phase 1 計画書](docs/仕様書/Phase1_Slackステータス連携.md)
  - [Phase 2 計画書](docs/仕様書/Phase2_M365SSO_Outlook予定登録.md)
  - [Phase 3 計画書](docs/仕様書/Phase3_Slack多人数連携.md)
- 実装手順書
  - [Phase 1 実装手順書 INDEX](docs/実装手順書/README.md)

---

## クイックスタート（Phase 1）

```bash
# 依存導入
npm install

# 健康診断
npx expo-doctor
npx tsc --noEmit

# Dev Client ビルド（実機接続が必要）
npx expo run:ios
# または
npx expo run:android
```

詳細は [docs/実装手順書/01_プロジェクトセットアップ.md](docs/実装手順書/01_プロジェクトセットアップ.md) 参照。
