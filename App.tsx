import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavigationProvider, useNav, type Tab } from './src/navigation';
import { AlertsScreen } from './src/screens/alerts';
import { ClientScreen, DatabaseScreen, DomainScreen, EmailScreen } from './src/screens/details';
import { DnsRecordScreen, DnsScreen, DnsSoaScreen } from './src/screens/dns';
import { DashboardScreen } from './src/screens/dashboard';
import { ClientFormScreen, DatabaseFormScreen, DomainFormScreen, EmailFormScreen } from './src/screens/forms';
import { ListScreen, ResourcesScreen } from './src/screens/resources';
import { ConnectScreen, ServersScreen } from './src/screens/servers';
import { SettingsScreen, TokensScreen } from './src/screens/settings';
import { AppProvider, useApp } from './src/state/AppProvider';
import { Loading, styles, T } from './src/ui/kit';

const TABS: { tab: Tab; label: 'tab.dashboard' | 'tab.resources' | 'tab.alerts' | 'tab.settings'; icon: string }[] = [
  { tab: 'dashboard', label: 'tab.dashboard', icon: '◉' },
  { tab: 'resources', label: 'tab.resources', icon: '☰' },
  { tab: 'alerts', label: 'tab.alerts', icon: '△' },
  { tab: 'settings', label: 'tab.settings', icon: '⚙' },
];

function TabBar() {
  const { t, theme } = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  return (
    <View
      role="tablist"
      style={[
        styles.row,
        {
          backgroundColor: theme.color.surface,
          borderTopWidth: 1,
          borderTopColor: theme.color.border,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {TABS.map(({ tab, label, icon }) => {
        const selected = nav.tab === tab;
        const color = selected ? theme.color.accentText : theme.color.textMuted;
        return (
          <Pressable
            key={tab}
            role="tab"
            aria-selected={selected}
            aria-label={t(label)}
            onPress={() => nav.setTab(tab)}
            testID={`tab-${tab}`}
            style={{ flex: 1, alignItems: 'center', paddingVertical: theme.space(2.5), gap: 2 }}
          >
            <T variant="heading" style={{ color, lineHeight: 22 }}>
              {icon}
            </T>
            <T variant="caption" style={{ color, fontWeight: selected ? '700' : '500' }}>
              {t(label)}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

function CurrentScreen() {
  const { route, pop } = useNav();
  switch (route.name) {
    case 'dashboard':
      return <DashboardScreen />;
    case 'resources':
      return <ResourcesScreen />;
    case 'alerts':
      return <AlertsScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'servers':
      return <ServersScreen />;
    case 'connect':
      return <ConnectScreen onBack={pop} onDone={pop} />;
    case 'list':
      return <ListScreen kind={route.kind} />;
    case 'client':
      return <ClientScreen id={route.id} />;
    case 'clientForm':
      return <ClientFormScreen id={route.id} />;
    case 'domain':
      return <DomainScreen id={route.id} />;
    case 'domainForm':
      return <DomainFormScreen clientId={route.clientId} />;
    case 'email':
      return <EmailScreen id={route.id} />;
    case 'emailForm':
      return <EmailFormScreen clientId={route.clientId} />;
    case 'databaseForm':
      return <DatabaseFormScreen clientId={route.clientId} />;
    case 'database':
      return <DatabaseScreen id={route.id} />;
    case 'dns':
      return <DnsScreen domainId={route.domainId} />;
    case 'dnsRecord':
      return <DnsRecordScreen domainId={route.domainId} index={route.index} />;
    case 'dnsSoa':
      return <DnsSoaScreen domainId={route.domainId} />;
    case 'tokens':
      return <TokensScreen />;
  }
}

function Shell() {
  const { ready, servers, theme, language } = useApp();

  // The page language and background follow the app on the web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.lang = language;
    document.documentElement.style.colorScheme = theme.mode;
    document.body.style.backgroundColor = theme.color.canvas;
  }, [language, theme]);

  return (
    <View style={[styles.fill, { backgroundColor: theme.color.canvas }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      {!ready ? (
        <Loading />
      ) : servers.length === 0 ? (
        <ConnectScreen />
      ) : (
        <NavigationProvider>
          <View style={styles.fill}>
            <CurrentScreen />
          </View>
          <TabBar />
        </NavigationProvider>
      )}
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ Sora: require('./assets/fonts/Sora-Variable.ttf') as number });
  if (!fontsLoaded && !fontError) return null;
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </SafeAreaProvider>
  );
}
