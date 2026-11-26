// A small stack navigator per tab. The app has few screens and no deep links, so a router
// dependency would add more than it saves. Android's back button pops the stack.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';

export type ResourceKind = 'clients' | 'domains' | 'certificates' | 'emails' | 'databases' | 'ftp' | 'cron' | 'backups';
export type Tab = 'dashboard' | 'resources' | 'alerts' | 'settings';

export type Route =
  | { name: 'dashboard' }
  | { name: 'resources' }
  | { name: 'alerts' }
  | { name: 'settings' }
  | { name: 'servers' }
  | { name: 'connect' }
  | { name: 'list'; kind: ResourceKind }
  | { name: 'client'; id: number }
  | { name: 'clientForm'; id?: number }
  | { name: 'domain'; id: number }
  | { name: 'domainForm'; clientId?: number }
  | { name: 'email'; id: number }
  | { name: 'emailForm'; clientId?: number }
  | { name: 'databaseForm'; clientId?: number }
  | { name: 'tokens' };

export interface Navigation {
  tab: Tab;
  route: Route;
  depth: number;
  push(route: Route): void;
  pop(): void;
  setTab(tab: Tab): void;
}

const NavContext = createContext<Navigation | null>(null);

export function useNav(): Navigation {
  const value = useContext(NavContext);
  if (!value) throw new Error('useNav outside NavigationProvider');
  return value;
}

export function NavigationProvider({ children, initialTab = 'dashboard' }: { children: ReactNode; initialTab?: Tab }) {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [stacks, setStacks] = useState<Record<Tab, Route[]>>({
    dashboard: [{ name: 'dashboard' }],
    resources: [{ name: 'resources' }],
    alerts: [{ name: 'alerts' }],
    settings: [{ name: 'settings' }],
  });
  const stack = stacks[tab];

  const push = useCallback((route: Route) => setStacks((s) => ({ ...s, [tab]: [...s[tab], route] })), [tab]);
  const pop = useCallback(() => setStacks((s) => (s[tab].length > 1 ? { ...s, [tab]: s[tab].slice(0, -1) } : s)), [tab]);
  const setTab = useCallback(
    (next: Tab) => {
      // Tapping the open tab again goes back to its first screen.
      if (next === tab) setStacks((s) => ({ ...s, [tab]: s[tab].slice(0, 1) }));
      setTabState(next);
    },
    [tab]
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const value = useMemo(
    () => ({ tab, route: stack[stack.length - 1], depth: stack.length, push, pop, setTab }),
    [tab, stack, push, pop, setTab]
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}
