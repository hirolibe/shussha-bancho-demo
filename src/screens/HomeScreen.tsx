import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { RootStackParamList } from '../../App';
import {
  authTest,
  getCurrentProfile,
  SlackError,
  type AuthTestResponse,
  type ProfileGetResponse,
} from '../api/slackClient';
import {
  getLastKinmuSetDate,
  performKinmuAction,
  type KinmuActionResult,
} from '../actions/kinmuAction';
import {
  addBeaconScanListener,
  getScanState,
  startBeaconScanning,
  stopBeaconScanning,
  type DetectedBeacon,
} from '../beacon/beaconScanner';
import { loadBeaconConfig } from '../storage/beaconConfig';
import { loadSlackToken, maskToken } from '../storage/secureToken';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<AuthTestResponse | null>(null);
  const [profile, setProfile] = useState<ProfileGetResponse['profile'] | null>(null);
  const [lastSet, setLastSet] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [scanning, setScanning] = useState(getScanState() === 'scanning');
  const [lastRaw, setLastRaw] = useState<DetectedBeacon[]>([]);
  const [lastMatched, setLastMatched] = useState<DetectedBeacon[]>([]);
  const [lastActionResult, setLastActionResult] = useState<KinmuActionResult | null>(null);

  // Beacon イベント購読 (画面マウント中のみ反映)
  useEffect(() => {
    const unsubscribe = addBeaconScanListener({
      onRawBeacons: setLastRaw,
      onMatched: setLastMatched,
      onAction: (r) => {
        setLastActionResult(r);
        // 状態更新は最小限に。打刻成功時のみリフレッシュ
        if (r.kind === 'set') void refreshState();
      },
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      void refreshState();
    });
    return unsubscribe;
  }, [navigation]);

  async function refreshState() {
    const [t, last] = await Promise.all([loadSlackToken(), getLastKinmuSetDate()]);
    setToken(t);
    setLastSet(last);
    setScanning(getScanState() === 'scanning');
  }

  async function handleAuthTest() {
    if (!token) {
      Alert.alert('未設定', '設定画面で Slack トークンを保存してください');
      return;
    }
    setBusy(true);
    try {
      const [auth, prof] = await Promise.all([authTest(token), getCurrentProfile(token)]);
      setAuthInfo(auth);
      setProfile(prof.profile);
    } catch (e) {
      handleSlackError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handlePunchIn() {
    setBusy(true);
    try {
      const result = await performKinmuAction();
      setLastActionResult(result);
      await refreshState();
      explainResult(result);
      if (token && result.kind === 'set') {
        const prof = await getCurrentProfile(token);
        setProfile(prof.profile);
      }
    } catch (e) {
      handleSlackError(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartScan() {
    setBusy(true);
    try {
      const cfg = await loadBeaconConfig();
      await startBeaconScanning(cfg);
      setScanning(true);
      Alert.alert('スキャン開始', `UUID=${cfg.uuid} の Beacon を監視中`);
    } catch (e) {
      Alert.alert('開始失敗', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function handleStopScan() {
    stopBeaconScanning();
    setScanning(false);
    Alert.alert('スキャン停止', 'Beacon 監視を停止しました');
  }

  function explainResult(r: KinmuActionResult) {
    switch (r.kind) {
      case 'set':
        Alert.alert('打刻完了', `本日 (${r.jstDate}) の :kinmu: をセットしました`);
        return;
      case 'skipped_already_today':
        Alert.alert('スキップ', `本日 (${r.jstDate}) はすでに打刻済みです`);
        return;
      case 'skipped_cooldown':
        Alert.alert('スキップ', `クールダウン中: あと ${Math.ceil(r.remainingMs / 1000)} 秒`);
        return;
      case 'no_token':
        Alert.alert('未設定', '設定画面で Slack トークンを保存してください');
        return;
      case 'error':
        handleSlackError(r.error);
        return;
    }
  }

  function handleSlackError(e: unknown) {
    if (e instanceof SlackError) {
      const detail = e.slackError ? `\nslack_error: ${e.slackError}` : '';
      const retry = e.retryAfterSec ? `\n再試行まで ${e.retryAfterSec} 秒` : '';
      Alert.alert('Slack エラー', `${e.message}${detail}${retry}`);
    } else if (e instanceof Error) {
      Alert.alert('エラー', e.message);
    } else {
      Alert.alert('エラー', String(e));
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>出社番長 Phase 1</Text>
      <Text style={styles.body}>
        iBeacon を検知すると Slack のカスタムステータスを :kinmu: に自動で切り替えます。
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Slack トークン</Text>
        <Text style={styles.cardValue}>{maskToken(token)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>本日の打刻 (JST)</Text>
        <Text style={styles.cardValue}>{lastSet ?? '未打刻'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Beacon スキャン状態</Text>
        <Text style={styles.cardValue}>{scanning ? '稼働中' : '停止中'}</Text>
      </View>

      {lastMatched.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>直近の一致 Beacon</Text>
          {lastMatched.map((b, i) => (
            <Text key={i} style={styles.cardValue}>
              major={b.major} minor={b.minor} rssi={b.rssi} dist={b.distance.toFixed(2)}m
            </Text>
          ))}
        </View>
      )}

      {lastRaw.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>直近の生 Beacon ({lastRaw.length} 件)</Text>
          {lastRaw.slice(0, 5).map((b, i) => (
            <Text key={i} style={styles.cardValue}>
              uuid={b.uuid.slice(0, 8)}… major={b.major} minor={b.minor} rssi={b.rssi}
            </Text>
          ))}
        </View>
      )}

      {lastActionResult && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>直近の打刻アクション</Text>
          <Text style={styles.cardValue}>{describeAction(lastActionResult)}</Text>
        </View>
      )}

      {authInfo && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>auth.test</Text>
          <Text style={styles.cardValue}>
            user: {authInfo.user}
            {'\n'}team: {authInfo.team}
          </Text>
        </View>
      )}

      {profile && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>現在のカスタムステータス</Text>
          <Text style={styles.cardValue}>
            {profile.status_emoji || '(なし)'} {profile.status_text || ''}
          </Text>
        </View>
      )}

      <View style={styles.gap} />
      {scanning ? (
        <Button title="Beacon スキャン停止" color="#c00" onPress={handleStopScan} disabled={busy} />
      ) : (
        <Button title="Beacon スキャン開始" onPress={handleStartScan} disabled={busy} />
      )}
      <View style={styles.gap} />
      <Button title="出社打刻 (冪等・手動)" onPress={handlePunchIn} disabled={busy} />
      <View style={styles.gap} />
      <Button title="Slack 接続テスト" onPress={handleAuthTest} disabled={busy || !token} />
      <View style={styles.gap} />
      <Button title="設定" onPress={() => navigation.navigate('Settings')} />
    </ScrollView>
  );
}

function describeAction(r: KinmuActionResult): string {
  switch (r.kind) {
    case 'set':
      return `set (${r.jstDate})`;
    case 'skipped_already_today':
      return `already today (${r.jstDate})`;
    case 'skipped_cooldown':
      return `cooldown ${Math.ceil(r.remainingMs / 1000)}s`;
    case 'no_token':
      return 'no token';
    case 'error':
      return `error: ${r.error.message}`;
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 64,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 16,
  },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    backgroundColor: '#fafafa',
  },
  cardTitle: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 13,
    color: '#222',
    lineHeight: 18,
  },
  gap: {
    height: 12,
  },
});
