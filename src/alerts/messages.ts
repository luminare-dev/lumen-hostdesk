import type { Translate } from '../i18n';
import type { Alert } from './evaluate';

/** The sentence for one alert on one server. */
export function alertMessage(alert: Alert, serverName: string, t: Translate): string {
  const params = { ...alert.params, name: serverName };
  switch (alert.kind) {
    case 'certificateExpiring':
      return t('alerts.certificateExpiring', params);
    case 'certificateExpired':
      return t('alerts.certificateExpired', params);
    case 'disk':
      return t('alerts.disk', params);
    case 'inodes':
      return t('alerts.inodes', params);
    case 'memory':
      return t('alerts.memory', params);
    case 'service':
      return t('alerts.service', params);
    case 'quota':
      return t('alerts.quota', params);
    case 'backup':
      return t('alerts.backup', params);
  }
}
