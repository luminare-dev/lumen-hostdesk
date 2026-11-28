import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { evaluateAlerts } from '../alerts/evaluate';
import type { UsageBlock } from '../api/types';
import { hostOf } from '../api/url';
import { formatBytes } from '../i18n';
import { useNav } from '../navigation';
import { useApp } from '../state/AppProvider';
import { useResource } from '../state/useResource';
import { Badge, Button, Card, ErrorPanel, KeyValue, Loading, Meter, Notice, Screen, Section, styles, T, TypedConfirmDialog } from '../ui/kit';
import { useAction } from './details';
import { NeedsKey } from './servers';

export function DashboardScreen() {
  const { t, client, active, theme, language, settings, readOnly } = useApp();
  const reboot = useAction();
  const [rebootOpen, setRebootOpen] = useState(false);
  const [rebootSent, setRebootSent] = useState(false);
  const nav = useNav();
  const status = useResource(client, 'server', (c) => c.server());
  const certs = useResource(client, 'certificates', (c) => c.certificates());
  const s = status.data;
  const util = s?.utilization;

  const alerts = useMemo(
    () => (s ? evaluateAlerts({ server: s, certificates: certs.data }, settings.thresholds, new Date()) : []),
    [s, certs.data, settings.thresholds]
  );

  const usage = (label: string, block: UsageBlock | undefined, warnAt: number, id: string) =>
    block ? (
      <Meter
        label={label}
        percent={block.percent}
        warnAt={warnAt}
        detail={t('common.of', { used: formatBytes(block.used, language), total: formatBytes(block.total, language) })}
        testID={id}
      />
    ) : null;

  const serverButton = (
    <Pressable onPress={() => nav.push({ name: 'servers' })} role="button" aria-label={t('servers.switch')} testID="switch-server" hitSlop={8}>
      <Badge label={active?.name ?? '—'} tone="accent" />
    </Pressable>
  );

  return (
    <Screen title={t('dashboard.title')} right={serverButton} testID="screen-dashboard">
      {!client ? <NeedsKey /> : null}
      {status.error ? <ErrorPanel error={status.error} onRetry={status.reload} /> : null}
      {!s && status.loading ? <Loading /> : null}
      {s ? (
        <>
          <Card testID="card-server">
            <View style={styles.rowBetween}>
              <View style={{ flexShrink: 1 }}>
                <T variant="heading" numberOfLines={1}>
                  {s.meta?.hostname ?? active?.name ?? ''}
                </T>
                <T variant="caption">
                  {[s.operating_system?.label, s.meta?.panel_version ? t('dashboard.panel', { version: s.meta.panel_version }) : undefined]
                    .filter(Boolean)
                    .join(' · ')}
                </T>
              </View>
              {s.meta?.uptime ? <Badge label={t('dashboard.uptime', { days: s.meta.uptime.days, hours: s.meta.uptime.hours })} tone="success" /> : null}
            </View>
            <Pressable onPress={() => nav.setTab('alerts')} role="button" testID="dashboard-alerts">
              <Notice tone={alerts.some((a) => a.severity === 'critical') ? 'danger' : alerts.length > 0 ? 'warning' : 'success'}>
                {alerts.length > 0 ? t('dashboard.alertsSummary', { count: alerts.length }) : t('dashboard.allGood')}
              </Notice>
            </Pressable>
          </Card>

          <Card testID="card-usage">
            {util?.load ? (
              <Meter
                label={t('dashboard.load')}
                percent={util.load.percent}
                warnAt={80}
                detail={t('dashboard.loadValue', {
                  one: util.load.minute_1.toFixed(2),
                  five: util.load.minute_5.toFixed(2),
                  fifteen: util.load.minute_15.toFixed(2),
                  cpus: util.load.cpu_count,
                })}
                testID="meter-load"
              />
            ) : null}
            {usage(t('dashboard.disk'), util?.disk_space, settings.thresholds.diskPercent, 'meter-disk')}
            {usage(t('dashboard.memory'), util?.memory, settings.thresholds.memoryPercent, 'meter-memory')}
            {util?.swap && util.swap.total > 0 ? usage(t('dashboard.swap'), util.swap, 80, 'meter-swap') : null}
            {util?.inodes ? (
              <Meter
                label={t('dashboard.inodes')}
                percent={util.inodes.percent}
                warnAt={settings.thresholds.diskPercent}
                detail={t('common.of', {
                  used: util.inodes.used.toLocaleString(language === 'de' ? 'de-AT' : 'en-GB'),
                  total: util.inodes.total.toLocaleString(language === 'de' ? 'de-AT' : 'en-GB'),
                })}
                testID="meter-inodes"
              />
            ) : null}
          </Card>

          <Section title={t('dashboard.services')}>
            <Card testID="card-services">
              <View style={[styles.row, { flexWrap: 'wrap', gap: theme.space(2) }]}>
                {(s.ports ?? []).map((port) => (
                  <Badge
                    key={`${port.service}-${port.port}`}
                    label={`${port.service} ${port.status === 'online' ? '●' : '○'} ${port.status === 'online' ? t('dashboard.online') : t('dashboard.offline')}`}
                    tone={port.status === 'online' ? 'success' : 'danger'}
                    testID={`service-${port.service}`}
                  />
                ))}
              </View>
            </Card>
          </Section>

          <Section title={t('dashboard.system')}>
            <Card>
              {s.operating_system?.updates ? (
                <KeyValue
                  label={t('dashboard.updates')}
                  value={t('dashboard.updatesValue', {
                    count: s.operating_system.updates.update_count,
                    security: s.operating_system.updates.security_update_count,
                  })}
                />
              ) : null}
              {s.operating_system?.updates?.reboot_required ? <Badge label={t('dashboard.rebootRequired')} tone="warning" /> : null}
              {util?.emails_in_queue !== undefined ? <KeyValue label={t('dashboard.mailQueue')} value={String(util.emails_in_queue)} /> : null}
              {util?.process_count !== undefined ? <KeyValue label={t('dashboard.processes')} value={String(util.process_count)} /> : null}
              {Object.entries(s.components ?? {}).map(([name, version]) => (
                <KeyValue key={name} label={name} value={version} />
              ))}
            </Card>
          </Section>
          {rebootSent ? (
            <Notice tone="warning" testID="reboot-sent">
              {t('dashboard.rebootSent')}
            </Notice>
          ) : null}
          {!readOnly ? (
            <>
              <Button
                label={t('dashboard.reboot')}
                kind="danger"
                onPress={() => {
                  reboot.reset();
                  setRebootOpen(true);
                }}
                testID="reboot"
              />
              <TypedConfirmDialog
                visible={rebootOpen}
                title={t('dashboard.rebootTitle', { host: s.meta?.hostname ?? (active ? hostOf(active.origin) : '') })}
                body={t('dashboard.rebootBody')}
                accepted={[s.meta?.hostname ?? (active ? hostOf(active.origin) : '')]}
                confirmLabel={t('dashboard.reboot')}
                busy={reboot.busy}
                error={reboot.error}
                onCancel={() => setRebootOpen(false)}
                onConfirm={async () => {
                  const done = await reboot.run(async () => {
                    await client?.rebootServer();
                    return true;
                  });
                  if (done) {
                    setRebootOpen(false);
                    setRebootSent(true);
                  }
                }}
              />
            </>
          ) : null}
          <Button label={t('common.refresh')} kind="secondary" onPress={() => {
              status.reload();
              certs.reload();
            }} busy={status.loading} testID="refresh" />
        </>
      ) : null}
    </Screen>
  );
}
