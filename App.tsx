import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { autoStartScanIfConfigured } from '@/beacon/autoStart';
import { addBeaconScanListener } from '@/beacon/beaconScanner';
import { configureNotifications, notifyKinmuError, notifyKinmuSet } from '@/notifications/setup';
import HomeScreen from '@/screens/HomeScreen';
import SettingsScreen from '@/screens/SettingsScreen';

export type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  useEffect(() => {
    let cancelled = false;

    // 1) 通知初期化
    void configureNotifications();

    // 2) 検知 → 打刻成功 / 失敗で通知を発火
    const unsubscribe = addBeaconScanListener({
      onAction: (result) => {
        if (result.kind === 'set') {
          void notifyKinmuSet(result.jstDate);
        } else if (result.kind === 'error') {
          void notifyKinmuError(result.error.message);
        }
      },
    });

    // 3) 設定が揃っていれば自動でスキャン開始 (アプリ再起動時の復帰)
    void autoStartScanIfConfigured().then((r) => {
      if (cancelled) return;
      if (!r.started && r.reason === 'permission') {
        // 権限拒否は UI 側で表示する。ここでは通知を出さない。
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: '出社番長' }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '設定' }} />
        </Stack.Navigator>
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
