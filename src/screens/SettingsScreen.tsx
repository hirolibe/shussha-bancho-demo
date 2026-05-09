import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { clearLastKinmuSetDate, getLastKinmuSetDate } from '../actions/kinmuAction';
import { RSSI_THRESHOLD_DEFAULT } from '../config/constants';
import {
  isUuidValid,
  loadBeaconConfig,
  saveBeaconConfig,
  type BeaconConfig,
} from '../storage/beaconConfig';
import {
  deleteSlackToken,
  loadSlackToken,
  maskToken,
  saveSlackToken,
} from '../storage/secureToken';

export default function SettingsScreen() {
  // Slack token
  const [storedToken, setStoredToken] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Beacon config
  const [uuid, setUuid] = useState('');
  const [major, setMajor] = useState('');
  const [minor, setMinor] = useState('');
  const [rssi, setRssi] = useState(String(RSSI_THRESHOLD_DEFAULT));

  const [loading, setLoading] = useState(true);
  const [lastSet, setLastSet] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [token, beacon, last] = await Promise.all([
          loadSlackToken(),
          loadBeaconConfig(),
          getLastKinmuSetDate(),
        ]);
        setStoredToken(token);
        setUuid(beacon.uuid ?? '');
        setMajor(beacon.major !== null ? String(beacon.major) : '');
        setMinor(beacon.minor !== null ? String(beacon.minor) : '');
        setRssi(String(beacon.rssiThreshold));
        setLastSet(last);
      } catch (e) {
        Alert.alert('読み込み失敗', String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSaveToken() {
    if (!tokenInput.trim()) {
      Alert.alert('入力エラー', 'トークンを入力してください');
      return;
    }
    if (!tokenInput.trim().startsWith('xoxp-')) {
      Alert.alert(
        '形式の確認',
        'Slack User Token は通常 "xoxp-" で始まります。本当にこのトークンで保存しますか？',
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '保存する', onPress: () => persistToken(tokenInput.trim()) },
        ],
      );
      return;
    }
    await persistToken(tokenInput.trim());
  }

  async function persistToken(token: string) {
    try {
      await saveSlackToken(token);
      setStoredToken(token);
      setTokenInput('');
      Alert.alert('保存完了', 'Slack トークンを Secure Storage に保存しました');
    } catch (e) {
      Alert.alert('保存失敗', String(e));
    }
  }

  function handleDeleteToken() {
    Alert.alert('トークン削除', 'Slack トークンを削除します。よろしいですか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSlackToken();
            setStoredToken(null);
            Alert.alert('削除完了', 'Slack トークンを削除しました');
          } catch (e) {
            Alert.alert('削除失敗', String(e));
          }
        },
      },
    ]);
  }

  async function handleSaveBeacon() {
    const trimmedUuid = uuid.trim();
    if (trimmedUuid && !isUuidValid(trimmedUuid)) {
      Alert.alert(
        '入力エラー',
        'UUID の形式が正しくありません (例: 12345678-1234-1234-1234-1234567890ab)',
      );
      return;
    }

    const parsedMajor = major.trim() === '' ? null : Number.parseInt(major, 10);
    const parsedMinor = minor.trim() === '' ? null : Number.parseInt(minor, 10);
    const parsedRssi = Number.parseInt(rssi, 10);

    if (major.trim() !== '' && (parsedMajor === null || Number.isNaN(parsedMajor))) {
      Alert.alert('入力エラー', 'Major は整数で入力してください');
      return;
    }
    if (minor.trim() !== '' && (parsedMinor === null || Number.isNaN(parsedMinor))) {
      Alert.alert('入力エラー', 'Minor は整数で入力してください');
      return;
    }
    if (Number.isNaN(parsedRssi)) {
      Alert.alert('入力エラー', 'RSSI 閾値は整数で入力してください (例: -75)');
      return;
    }

    const cfg: BeaconConfig = {
      uuid: trimmedUuid.length > 0 ? trimmedUuid : null,
      major: parsedMajor,
      minor: parsedMinor,
      rssiThreshold: parsedRssi,
    };

    try {
      await saveBeaconConfig(cfg);
      Alert.alert('保存完了', 'Beacon 設定を保存しました');
    } catch (e) {
      Alert.alert('保存失敗', String(e));
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>読み込み中…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Slack User Token</Text>
        <Text style={styles.label}>現在: {maskToken(storedToken)}</Text>

        <Text style={styles.label}>新しいトークンを貼り付け</Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.flex]}
            value={tokenInput}
            onChangeText={setTokenInput}
            placeholder="xoxp-..."
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showToken}
          />
          <View style={styles.toggle}>
            <Text style={styles.toggleLabel}>表示</Text>
            <Switch value={showToken} onValueChange={setShowToken} />
          </View>
        </View>
        <View style={styles.buttonRow}>
          <View style={styles.flex}>
            <Button title="トークンを保存" onPress={handleSaveToken} />
          </View>
          <View style={styles.gap} />
          <View style={styles.flex}>
            <Button
              title="トークンを削除"
              color="#c00"
              onPress={handleDeleteToken}
              disabled={storedToken === null}
            />
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.section}>iBeacon 設定</Text>

        <Text style={styles.label}>UUID</Text>
        <TextInput
          style={styles.input}
          value={uuid}
          onChangeText={setUuid}
          placeholder="12345678-1234-1234-1234-1234567890ab"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Major (任意)</Text>
        <TextInput
          style={styles.input}
          value={major}
          onChangeText={setMajor}
          placeholder="例: 1"
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Minor (任意)</Text>
        <TextInput
          style={styles.input}
          value={minor}
          onChangeText={setMinor}
          placeholder="例: 1"
          keyboardType="number-pad"
        />

        <Text style={styles.label}>RSSI 閾値 (dBm, デフォルト {RSSI_THRESHOLD_DEFAULT})</Text>
        <TextInput
          style={styles.input}
          value={rssi}
          onChangeText={setRssi}
          placeholder={String(RSSI_THRESHOLD_DEFAULT)}
          keyboardType="numbers-and-punctuation"
        />

        <View style={styles.gap} />
        <Button title="Beacon 設定を保存" onPress={handleSaveBeacon} />

        <View style={styles.divider} />

        <Text style={styles.section}>デバッグ</Text>
        <Text style={styles.label}>本日の打刻 (JST): {lastSet ?? '未打刻'}</Text>
        <Button
          title="本日の打刻記録をクリア"
          color="#c00"
          onPress={async () => {
            await clearLastKinmuSetDate();
            setLastSet(null);
            Alert.alert('クリア完了', '本日の打刻記録とクールダウンを消しました');
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    padding: 24,
    paddingBottom: 64,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  section: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: '#444',
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fafafa',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  toggleLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  gap: {
    width: 12,
    height: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 24,
  },
});
