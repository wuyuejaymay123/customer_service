import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ChakraProvider,
  Flex,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Heading,
  Text,
  Button,
  useToast,
  HStack,
} from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GeneralSettings from './components/Settings/GeneralSettings';
import AccountSettings from './components/Settings/AccountSettings';
import InstanceShopSettings from './components/Settings/InstanceShopSettings';
import AboutPage from './components/About';
import { trackPageView } from '../common/services/analytics';
import {
  checkConfigActive,
  activeConfig,
  getTasks,
} from '../common/services/platform/controller';
import { Instance } from '../common/services/platform/platform';
import theme from '../common/styles/theme';
import '../common/App.css';

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
    return { appId, instanceId, tab };
  } catch {
    return {};
  }
}

const SettingsCenter = () => {
  const [settings, setSettings] = useState<{
    appId?: string;
    instanceId?: string;
    tab?: string;
  }>(() => readSettingsFromLocation());
  const [shops, setShops] = useState<Instance[]>([]);
  const toast = useToast();

  useEffect(() => {
    trackPageView('Settings');
  }, []);

  const ensureConfigActive = useCallback(
    async (appId: string, instanceId?: string) => {
      try {
        const resp = await checkConfigActive({ appId, instanceId });
        if (!resp.data.active) {
          await activeConfig({ active: true, appId, instanceId });
        }
      } catch (error) {
        const errormsg =
          error instanceof Error ? error.message : JSON.stringify(error);
        toast({
          title: '获取配置失败',
          description: errormsg,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    },
    [toast],
  );

  const refreshShops = useCallback(async () => {
    try {
      const res = await getTasks();
      setShops(res?.data || []);
    } catch {
      setShops([]);
    }
  }, []);

  useEffect(() => {
    const fromUrl = readSettingsFromLocation();
    setSettings(fromUrl);
    if (fromUrl.appId) {
      ensureConfigActive(fromUrl.appId, fromUrl.instanceId);
    }
    refreshShops();

    const onPopState = () => {
      const next = readSettingsFromLocation();
      setSettings(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [ensureConfigActive, refreshShops]);

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
        setSettings((prev) => ({ ...prev, ...next }));
        if (next.appId) ensureConfigActive(next.appId, next.instanceId);
        refreshShops();
      }
    };

    const receivedArgs = electron.getArgs?.() || [];
    handleParams(receivedArgs);

    electron.ipcRenderer.on('update-settings-params', handleParams);
    return () => {
      window.electron.ipcRenderer.remove('update-settings-params');
    };
  }, [ensureConfigActive, refreshShops]);

  const defaultTabIndex = useMemo(() => {
    if (settings.tab === 'account') return 0;
    if (settings.tab === 'reply') return 1;
    if (settings.tab === 'shop' || settings.instanceId) return 2;
    if (settings.tab === 'about') return 3;
    return 0;
  }, [settings.tab, settings.instanceId]);

  const [tabIndex, setTabIndex] = useState(defaultTabIndex);
  useEffect(() => {
    setTabIndex(defaultTabIndex);
  }, [defaultTabIndex]);

  const openKeywords = () => {
    // 与顶栏入口一致；店铺作用域在关键词窗内选择
    window.electron?.ipcRenderer?.sendMessage?.('open-dataview-window', {});
  };

  const selectShop = (inst: Instance, stayOnReplyTab = false) => {
    setSettings({
      appId: inst.app_id,
      instanceId: String(inst.task_id),
      tab: stayOnReplyTab ? 'reply' : 'shop',
    });
    ensureConfigActive(inst.app_id, String(inst.task_id));
    if (!stayOnReplyTab) {
      setTabIndex(2);
    }
  };

  return (
    <Flex direction="row" height="99vh">
      <Tabs
        variant="enclosed"
        orientation="vertical"
        flex="1"
        index={tabIndex}
        onChange={setTabIndex}
      >
        <TabList
          p={4}
          width="200px"
          bg="gray.100"
          borderRight="1px solid"
          borderColor="gray.200"
        >
          <Tab
            _selected={{ bg: 'gray.200' }}
            _hover={{ bg: 'gray.300' }}
            textAlign="left"
          >
            账户与点数
          </Tab>
          <Tab
            _selected={{ bg: 'gray.200' }}
            _hover={{ bg: 'gray.300' }}
            textAlign="left"
          >
            回复策略
          </Tab>
          <Tab
            _selected={{ bg: 'gray.200' }}
            _hover={{ bg: 'gray.300' }}
            textAlign="left"
          >
            本店资料
          </Tab>
          <Tab
            _selected={{ bg: 'gray.200' }}
            _hover={{ bg: 'gray.300' }}
            textAlign="left"
          >
            关于
          </Tab>
        </TabList>
        <TabPanels flex="1" overflowY="auto" p={4}>
          <TabPanel>
            <Heading as="h3" size="md" mb={4}>
              账户与点数
            </Heading>
            <AccountSettings />
          </TabPanel>
          <TabPanel>
            <Heading as="h3" size="md" mb={4}>
              回复策略
            </Heading>
            {shops.length > 0 && (
              <HStack spacing={2} mb={3} flexWrap="wrap">
                <Button
                  size="xs"
                  variant={!settings.instanceId ? 'solid' : 'outline'}
                  colorScheme="gray"
                  onClick={() => {
                    setSettings((prev) => ({
                      ...prev,
                      appId: undefined,
                      instanceId: undefined,
                      tab: 'reply',
                    }));
                  }}
                >
                  全局默认
                </Button>
                {shops.map((s) => (
                  <Button
                    key={`reply-${s.task_id}`}
                    size="xs"
                    variant={
                      String(settings.instanceId) === String(s.task_id)
                        ? 'solid'
                        : 'outline'
                    }
                    colorScheme="teal"
                    onClick={() => selectShop(s, true)}
                  >
                    {s.shop_name || `#${s.task_id}`}
                  </Button>
                ))}
              </HStack>
            )}
            <Text fontSize="sm" color="gray.600" mb={4}>
              {settings.instanceId
                ? `正在编辑店铺「${
                    shops.find(
                      (s) =>
                        String(s.task_id) === String(settings.instanceId),
                    )?.shop_name || `#${settings.instanceId}`
                  }」的等待时间、超时接管、安抚语等。卖点／物流请到「本店资料」。`
                : '正在编辑全局默认（未单独设置的店铺会用这里的值）。可选上方某店改为只改那一家。'}
            </Text>
            <GeneralSettings
              style={{ width: '100%' }}
              appId={settings.appId}
              instanceId={settings.instanceId}
            />
          </TabPanel>
          <TabPanel>
            <Heading as="h3" size="md" mb={2}>
              本店资料
            </Heading>
            <Text fontSize="sm" color="gray.600" mb={3}>
              选择店铺后可编辑政策与卖点；关键词工作台由此进入。
            </Text>
            {shops.length > 0 && (
              <HStack spacing={2} mb={4} flexWrap="wrap">
                {shops.map((s) => (
                  <Button
                    key={s.task_id}
                    size="xs"
                    variant={
                      String(settings.instanceId) === String(s.task_id)
                        ? 'solid'
                        : 'outline'
                    }
                    colorScheme="teal"
                    onClick={() => selectShop(s)}
                  >
                    {s.shop_name || `#${s.task_id}`}
                  </Button>
                ))}
              </HStack>
            )}
            {settings.instanceId ? (
              <>
                <HStack mb={4}>
                  <Button size="sm" colorScheme="orange" onClick={openKeywords}>
                    打开关键词工作台
                  </Button>
                </HStack>
                <InstanceShopSettings
                  appId={settings.appId}
                  instanceId={settings.instanceId}
                />
              </>
            ) : (
              <Text fontSize="sm" color="gray.500">
                {shops.length === 0
                  ? '请先在主窗口添加拼多多店铺并扫码，再回到此处编辑本店资料。'
                  : '请从上方选择一家店铺。'}
              </Text>
            )}
          </TabPanel>
          <TabPanel>
            <AboutPage />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Flex>
  );
};

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <SettingsCenter />
      </ChakraProvider>
    </QueryClientProvider>
  );
};

export default App;
