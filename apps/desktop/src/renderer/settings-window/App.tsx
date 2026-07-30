import React, { useEffect, useState, useCallback } from 'react';
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
  useToast,
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
} from '../common/services/platform/controller';
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
    return { appId, instanceId };
  } catch {
    return {};
  }
}

const App = () => {
  const [settings, setSettings] = useState<{
    appId?: string;
    instanceId?: string;
  }>(() => readSettingsFromLocation());
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

  useEffect(() => {
    const fromUrl = readSettingsFromLocation();
    setSettings(fromUrl);
    if (fromUrl.appId) {
      ensureConfigActive(fromUrl.appId, fromUrl.instanceId);
    }

    const onPopState = () => {
      const next = readSettingsFromLocation();
      setSettings(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [ensureConfigActive]);

  // 兼容旧的 argv / update-settings-params
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
        setSettings(next);
        if (next.appId) ensureConfigActive(next.appId, next.instanceId);
      }
    };

    const receivedArgs = electron.getArgs?.() || [];
    handleParams(receivedArgs);

    electron.ipcRenderer.on('update-settings-params', handleParams);
    return () => {
      window.electron.ipcRenderer.remove('update-settings-params');
    };
  }, [ensureConfigActive]);

  const isInstance = Boolean(settings.instanceId);
  const isPlatformOnly = Boolean(settings.appId) && !settings.instanceId;

  if (isInstance && settings.instanceId) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChakraProvider theme={theme}>
          <Flex direction="column" height="99vh" p={6} overflowY="auto">
            <Heading as="h3" size="md" mb={2}>
              本店设置
            </Heading>
            <Text fontSize="sm" color="gray.500" mb={4}>
              当前实例 #{settings.instanceId}
            </Text>
            <InstanceShopSettings
              appId={settings.appId}
              instanceId={settings.instanceId}
            />
          </Flex>
        </ChakraProvider>
      </QueryClientProvider>
    );
  }

  if (isPlatformOnly) {
    return (
      <QueryClientProvider client={queryClient}>
        <ChakraProvider theme={theme}>
          <Flex direction="column" height="99vh" p={6} overflowY="auto">
            <Heading as="h3" size="md" mb={4}>
              自动回复行为（本渠道）
            </Heading>
            <Text fontSize="sm" color="gray.600" mb={4}>
              等待时间、超时接管、默认回复等本机行为。账户与点数请用右上角「设置」；店铺资料请点实例卡片上的齿轮。
            </Text>
            <GeneralSettings
              style={{ width: '100%' }}
              appId={settings.appId}
              instanceId={undefined}
            />
          </Flex>
        </ChakraProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <Flex direction="row" height="99vh">
          <Tabs variant="enclosed" orientation="vertical" flex="1">
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
                网关账户
              </Tab>
              <Tab
                _selected={{ bg: 'gray.200' }}
                _hover={{ bg: 'gray.300' }}
                textAlign="left"
              >
                自动回复默认
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
                  网关账户
                </Heading>
                <AccountSettings />
              </TabPanel>
              <TabPanel>
                <Heading as="h3" size="md" mb={4}>
                  自动回复默认
                </Heading>
                <Text fontSize="sm" color="gray.600" mb={4}>
                  本机自动回复行为（等待时间、超时接管、默认回复等）。店铺物流／商品请点各实例卡片上的齿轮；若某项需按渠道区分，也可在主窗口点平台旁齿轮。
                </Text>
                <GeneralSettings style={{ width: '100%' }} />
              </TabPanel>
              <TabPanel>
                <AboutPage />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Flex>
      </ChakraProvider>
    </QueryClientProvider>
  );
};

export default App;
