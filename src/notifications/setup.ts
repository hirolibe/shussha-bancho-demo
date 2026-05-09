import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const ANDROID_CHANNEL_ID = 'punch-in';

let configured = false;

export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: '出社打刻',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const settings = await Notifications.getPermissionsAsync();
  if (settings.status !== 'granted') {
    await Notifications.requestPermissionsAsync();
  }
}

/**
 * 出社打刻成功の通知。Phase 1 では Beacon 検知 → :kinmu: 設定が完了したことを
 * 視認できるようにする。バックグラウンド検知時は特に重要。
 */
export async function notifyKinmuSet(jstDate: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '出社を打刻しました',
      body: `本日 (${jstDate}) のステータスを :kinmu: にしました`,
      data: { kind: 'kinmu_set', jstDate },
    },
    trigger: null,
  });
}

export async function notifyKinmuError(message: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '出社打刻に失敗',
      body: message.slice(0, 200),
      data: { kind: 'kinmu_error' },
    },
    trigger: null,
  });
}
