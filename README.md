# IoTエッジアプリ開発 学習リソースまとめ

Expoを使ってAndroid/iOSの両方で動作するIoTエッジアプリケーションを開発するための学習リソース集です。

## 想定するアプリ要件

- Expoを使ってAndroid/iOSの両方で動作するIoTエッジアプリケーション
- BLEセンサーからのAdvertiseを受信して、AWS IoT Coreに送信する
- アプリを閉じてもバックグラウンドで動作し続けること
- ブラウザから特定のURLへアクセスすることで、BLEセンサーの情報が可視化されること

---

## 1. Expo / React Native の基礎

### 公式ドキュメント

- [Expo Tutorial](https://docs.expo.dev/tutorial/introduction/) - 基礎の足固め(全9章、約2時間)
- [Expo SDK Reference](https://docs.expo.dev/versions/latest/) - 全SDK APIの一覧
- [React Native 公式ドキュメント](https://reactnative.dev/docs/getting-started) - React Native本体の概念

### 補助ツール

- [Expo Snack](https://snack.expo.dev/) - ブラウザ上でExpoコードを試せる環境

---

## 2. EAS Build / Custom Dev Client(BLE使用に必須)

> ⚠️ BLEは **Expo Goでは動かない** ため、Custom Dev ClientとEAS Buildの理解が必須です。

### 公式ドキュメント

- [EAS Tutorial](https://docs.expo.dev/tutorial/eas/introduction/) - EAS全体のチュートリアル(全11章)
- [Adding custom native code](https://docs.expo.dev/workflow/customizing/) - prebuildとconfig pluginの理解
- [Development builds](https://docs.expo.dev/develop/development-builds/introduction/) - Dev Clientの基本

---

## 3. BLE(Bluetooth Low Energy)

### 公式ドキュメント

- [react-native-ble-plx 公式ドキュメント](https://dotintent.github.io/react-native-ble-plx/) - APIリファレンス。`BleManager`、スキャン、接続、`onStateChange`、Background Mode設定など
- [react-native-ble-plx GitHub](https://github.com/dotintent/react-native-ble-plx) - Expo config plugin設定例、Android権限設定
- [react-native-ble-plx Wiki: Expo](https://github.com/dotintent/react-native-ble-plx/wiki/Expo) - Expo環境下での詳細設定

### 公式技術ブログ

- [How to build a Bluetooth Low Energy powered Expo app](https://expo.dev/blog/how-to-build-a-bluetooth-low-energy-powered-expo-app) - Expo公式ブログのBLEチュートリアル

### サンプルコード

- [react-native-ble-expo-app](https://github.com/watadarkstar/react-native-ble-expo-app) - スタータテンプレート

### プラットフォーム別公式

- [Apple: Core Bluetooth](https://developer.apple.com/documentation/corebluetooth) - iOSのBLE仕様(背景知識)
- [Android Bluetooth LE Guide](https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview) - Android BLE公式

---

## 4. AWS IoT Core 連携

### 公式ドキュメント

- [AWS IoT Core Developer Guide - MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/mqtt.html) - MQTT、QoS、永続セッションなど
- [AWS IoT Device SDK for JavaScript v2](https://github.com/aws/aws-iot-device-sdk-js-v2) - 公式SDK
- [AWS IoT React Sample](https://github.com/aws/aws-iot-device-sdk-js-v2/blob/main/samples/browser/react_sample/README.md) - React向けの公式サンプル(可視化Webアプリの参考にも)
- [AWS Amplify PubSub (React Native)](https://docs.amplify.aws/gen1/react-native/build-a-backend/more-features/pubsub/set-up-pubsub/) - React Nativeから使う場合のもっとも実践的な選択肢

### 認証関連

- [Amazon Cognito Identity Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-identity.html) - モバイルアプリからの認証

### 技術記事

- [PubSub with AWS IoT Core and React Native](https://pedromarta.medium.com/pub-sub-implementation-using-aws-iot-core-and-react-native-2228e77e8699) - 実装ステップ解説

---

## 5. バックグラウンド動作(最大の難所)

### Expo公式ドキュメント

- [expo-background-task](https://docs.expo.dev/versions/latest/sdk/background-task/) - **SDK 53以降の推奨API**(`expo-background-fetch`は非推奨化)
- [expo-task-manager](https://docs.expo.dev/versions/latest/sdk/task-manager/) - バックグラウンドタスク基盤
- [Expo公式ブログ: Goodbye background-fetch, hello expo-background-task](https://expo.dev/blog/goodbye-background-fetch-hello-expo-background-task) - 移行ガイド

### プラットフォーム公式(背景知識として必須)

- [iOS: Core Bluetooth Background Execution Modes](https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html) - State Preservation/Restorationの理解必須
- [Android: WorkManager](https://developer.android.com/topic/libraries/architecture/workmanager) - Androidのバックグラウンド処理
- [Android: Foreground Services](https://developer.android.com/develop/background-work/services/foreground-services) - 常駐通知付きサービス(BLE常時受信に有効)
- [dontkillmyapp.com](https://dontkillmyapp.com/) - メーカー別バッテリー最適化問題のリファレンス(中国系メーカー対策)

### 実装事例

- [PowerSync: Keep Background Apps Fresh with Expo Background Tasks](https://www.powersync.com/blog/keep-background-apps-fresh-with-expo-background-tasks-and-powersync) - 実装パターン

### ネイティブモジュール自作が必要になった場合

- [Expo Modules API](https://docs.expo.dev/modules/overview/) - Swift/Kotlinでネイティブ機能を拡張

---

## 6. データ可視化Web(ブラウザからアクセスする画面)

### バックエンド構成の選択肢

- [AWS IoT → Kinesis → Timestream](https://docs.aws.amazon.com/timestream/latest/developerguide/what-is-timestream.html) - 時系列データ向け
- [AWS IoT Rules Engine](https://docs.aws.amazon.com/iot/latest/developerguide/iot-rules.html) - データルーティング
- [AWS IoT SiteWise / Grafana](https://aws.amazon.com/grafana/) - ダッシュボード即席構築

### フロントエンド

- [AWS Amplify (Web)](https://docs.amplify.aws/) - 認証付きWebダッシュボード
- [Recharts](https://recharts.org/) - Reactのグラフライブラリ
- [Chart.js](https://www.chartjs.org/) - 汎用グラフライブラリ

---

## 推奨学習順序

1. **Expoチュートリアル**(基礎) → React Nativeに慣れる
2. **EAS Tutorial** → Custom Dev Clientを作れるようにする
3. **react-native-ble-plx** → ローカルでBLE Advertise受信を実装
4. **AWS IoT Core + Cognito + Amplify PubSub** → クラウド送信
5. **バックグラウンド処理** → iOS/Androidそれぞれのハマりどころと向き合う
6. **可視化Web** → AWS側のデータ蓄積とダッシュボード構築

---

## ⚠️ 注意事項

- バックグラウンドBLE受信は **OS制約が厳しい** 領域です。要件次第ではExpo Modules APIで **ネイティブモジュールを自作** する必要が出てくる可能性があります。
- iOSではアプリを完全終了(swipe kill)した後はBLE受信ができないという制約があります。
- Androidはメーカーごとにバッテリー最適化の挙動が大きく異なるため、実機検証が必須です。
