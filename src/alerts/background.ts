// The background check (Android and iOS only). expo-background-task schedules it through
// WorkManager (Android) and BGTaskScheduler (iOS); the system decides when it runs. There is no
// push server: every check runs on the phone and talks to your server directly.
//
// This module must be imported at start-up (index.ts), because the task has to be defined in the
// global scope before the system wakes the app for it.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import { getLocales } from 'expo-localization';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { pickLanguage, translator } from '../i18n';
import { secretStore } from '../state/secrets';
import { loadSettings } from '../state/settings';
import { checkAllServers } from './check';
import { alertMessage } from './messages';

export const TASK_NAME = 'hostdesk-alert-check';
/** Minutes; Android's minimum is 15, iOS treats it as a hint. */
export const INTERVAL_MINUTES = 60;

export const backgroundSupported = Platform.OS === 'android' || Platform.OS === 'ios';

if (backgroundSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  TaskManager.defineTask(TASK_NAME, async () => {
    try {
      const settings = await loadSettings(AsyncStorage);
      if (!settings.backgroundChecks) return BackgroundTask.BackgroundTaskResult.Success;
      const { fresh } = await checkAllServers({ store: AsyncStorage, secrets: secretStore, thresholds: settings.thresholds });
      const language =
        settings.language === 'system' ? pickLanguage(getLocales().map((l) => l.languageCode)) : settings.language;
      const t = translator(language);
      for (const { server, alert } of fresh.slice(0, 5)) {
        await Notifications.scheduleNotificationAsync({
          content: { title: t('alerts.notificationTitle'), body: alertMessage(alert, server, t) },
          trigger: null,
        });
      }
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Turns the background check on or off and asks for the notification permission when needed. */
export async function setBackgroundChecks(enabled: boolean): Promise<boolean> {
  if (!backgroundSupported) return false;
  const registered = await TaskManager.isTaskRegisteredAsync(TASK_NAME);
  if (!enabled) {
    if (registered) await BackgroundTask.unregisterTaskAsync(TASK_NAME);
    return false;
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Alerts',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  if (!registered) await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: INTERVAL_MINUTES });
  return permission.granted;
}
