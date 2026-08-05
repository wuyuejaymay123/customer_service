import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChakraProvider, Box, Flex } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsCenter, {
  SettingsSection,
} from '../common/settings/SettingsCenter';
import { trackPageView } from '../common/services/analytics';
import theme from '../common/styles/theme';
import '../common/App.css';
import '../common/shell/appShell.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      retry: false,
      cacheTime: 10,
    },
  },
});

function readSettingsFromLocation() {
  try {
    const q = new URLSearchParams(window.location.search);
    const appId = q.get('appId') || undefined;
    const instanceId = q.get('instanceId') || undefined;
    const tab = q.get('tab') || undefined;
    const section = q.get('section') as SettingsSection | null;
    return { appId, instanceId, tab, section: section || undefined };
  } catch {
    return {};
  }
}

function sectionFromLegacyTab(
  tab?: string,
  instanceId?: string,
): SettingsSection {
  if (tab === 'reply') return 'reply';
  if (tab === 'shop' || instanceId) return 'shop';
  if (tab === 'about') return 'about';
  if (tab === 'voice') return 'voice';
  if (tab === 'points') return 'points';
  return 'account';
}

type NavItem =
  | { kind: 'link'; id: SettingsSection; label: string }
  | { kind: 'group'; id: string; label: string; children: SettingsSection[] };

const NAV: NavItem[] = [
  {
    kind: 'group',
    id: 'storewide',
    label: '全店管理',
    children: ['voice', 'reply', 'kw-match', 'kw-replace', 'kw-transfer'],
  },
  { kind: 'link', id: 'shop', label: '单店管理' },
  {
    kind: 'group',
    id: 'points',
    label: '积分',
    children: ['points-bal', 'points-rech', 'points-usage'],
  },
  {
    kind: 'group',
    id: 'account',
    label: '账户',
    children: ['account'],
  },
  { kind: 'link', id: 'kw-history', label: '历史聊天记录' },
];

const LABELS: Record<SettingsSection, string> = {
  voice: '规则',
  reply: '回复策略',
  shop: '单店管理',
  points: '积分',
  'points-bal': '积分余额',
  'points-rech': '充值明细',
  'points-usage': '用量明细',
  account: '修改密码',
  about: '关于',
  'kw-match': '关键词匹配',
  'kw-replace': '关键词替换',
  'kw-transfer': '关键词转接',
  'kw-history': '历史聊天记录',
};

const SettingsShell = () => {
  const initial = readSettingsFromLocation();
  const [section, setSection] = useState<SettingsSection>(
    () =>
      initial.section || sectionFromLegacyTab(initial.tab, initial.instanceId),
  );
  const [appId, setAppId] = useState(initial.appId);
  const [instanceId, setInstanceId] = useState(initial.instanceId);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    storewide: true,
    points: true,
    account: true,
  });

  useEffect(() => {
    trackPageView('Settings');
  }, []);

  useEffect(() => {
    const fromUrl = readSettingsFromLocation();
    if (fromUrl.section) setSection(fromUrl.section);
    else if (fromUrl.tab || fromUrl.instanceId) {
      setSection(sectionFromLegacyTab(fromUrl.tab, fromUrl.instanceId));
    }
    if (fromUrl.appId) setAppId(fromUrl.appId);
    if (fromUrl.instanceId) setInstanceId(fromUrl.instanceId);
  }, []);

  useEffect(() => {
    const { electron } = window;
    if (!electron) return undefined;

    const handleParams = (receivedArgs: unknown) => {
      const list = Array.isArray(receivedArgs)
        ? (receivedArgs as string[])
        : [];
      const next: { appId?: string; instanceId?: string } = {};
      list.forEach((arg) => {
        if (typeof arg !== 'string') return;
        if (arg.includes('settings-app-id-')) {
          next.appId = arg.replace(/^.*settings-app-id-/, '');
        }
        if (arg.includes('settings-instance-id-')) {
          next.instanceId = arg.replace(/^.*settings-instance-id-/, '');
        }
      });
      if (next.appId || next.instanceId) {
        if (next.appId) setAppId(next.appId);
        if (next.instanceId) {
          setInstanceId(next.instanceId);
          setSection('shop');
        }
      }
    };

    const receivedArgs = electron.getArgs?.() || [];
    handleParams(receivedArgs);
    electron.ipcRenderer.on('update-settings-params', handleParams);
    return () => {
      window.electron.ipcRenderer.remove('update-settings-params');
    };
  }, []);

  const activeInGroup = useCallback(
    (children: SettingsSection[]) => children.includes(section),
    [section],
  );

  const navNodes = useMemo(
    () =>
      NAV.map((item) => {
        if (item.kind === 'link') {
          return (
            <div
              key={item.id}
              className={`cs-nav-item${section === item.id ? ' active' : ''}`}
              onClick={() => setSection(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSection(item.id);
              }}
              role="button"
              tabIndex={0}
            >
              {item.label}
            </div>
          );
        }
        const open = openGroups[item.id] || activeInGroup(item.children);
        return (
          <React.Fragment key={item.id}>
            <div
              className={`cs-nav-item expand${open ? ' open' : ''}`}
              onClick={() =>
                setOpenGroups((prev) => ({
                  ...prev,
                  [item.id]: !prev[item.id],
                }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setOpenGroups((prev) => ({
                    ...prev,
                    [item.id]: !prev[item.id],
                  }));
                }
              }}
              role="button"
              tabIndex={0}
            >
              {item.label}
              <span className="caret">▸</span>
            </div>
            {open && (
              <div className="cs-nav-sub">
                {item.children.map((child) => (
                  <div
                    key={child}
                    className={`cs-nav-sub-i${
                      section === child ? ' active' : ''
                    }`}
                    onClick={() => setSection(child)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSection(child);
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    {LABELS[child]}
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        );
      }),
    [section, openGroups, activeInGroup],
  );

  return (
    <Flex className="cs-app" direction="column" height="100vh">
      <div className="cs-titlebar">
        <div className="cs-brand">
          <span className="logo">智</span>
          智能客服 · 设置
        </div>
      </div>
      <div className="cs-body-row">
        <aside className="cs-nav">
          <div className="cs-nav-items">{navNodes}</div>
        </aside>
        <main className="cs-main">
          <Box className="cs-main-scroll" flex="1">
            <SettingsCenter
              section={section}
              appId={appId}
              instanceId={instanceId}
              onShopContextChange={(next) => {
                setAppId(next.appId);
                setInstanceId(next.instanceId);
              }}
            />
          </Box>
        </main>
      </div>
    </Flex>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <SettingsShell />
      </ChakraProvider>
    </QueryClientProvider>
  );
};

export default App;
