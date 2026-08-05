import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Box, Button, Flex, Heading, useToast } from '@chakra-ui/react';
import GeneralSettings, {
  GeneralSettingsHandle,
} from '../../settings-window/components/Settings/GeneralSettings';
import AccountSettings, {
  AccountPanel,
} from '../../settings-window/components/Settings/AccountSettings';
import AboutPage from '../../settings-window/components/About';
import DataViewBody from '../../dataview-window/DataViewBody';
import ShopManagePanel from './ShopManagePanel';
import {
  activeConfig,
  checkConfigActive,
} from '../services/platform/controller';

export type SettingsSection =
  | 'voice'
  | 'reply'
  | 'shop'
  | 'points'
  | 'points-bal'
  | 'points-rech'
  | 'points-usage'
  | 'account'
  | 'about'
  | 'kw-match'
  | 'kw-replace'
  | 'kw-transfer'
  | 'kw-history';

export function normalizeSettingsSection(
  section: SettingsSection,
): SettingsSection {
  if (
    section === 'points-bal' ||
    section === 'points-rech' ||
    section === 'points-usage'
  ) {
    return 'points';
  }
  // 回复策略入口已并入规则
  if (section === 'reply') return 'voice';
  return section;
}

type Props = {
  section: SettingsSection;
  appId?: string;
  instanceId?: string;
  onOpenKeywords?: (tab?: number) => void;
  onShopContextChange?: (next: { appId?: string; instanceId?: string }) => void;
};

const sectionTitle: Record<SettingsSection, string> = {
  voice: '规则',
  reply: '规则',
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

function accountPanelFor(section: SettingsSection): AccountPanel {
  if (section === 'voice' || section === 'reply') return 'voice';
  if (section === 'account') return 'account';
  if (
    section === 'points' ||
    section === 'points-bal' ||
    section === 'points-rech' ||
    section === 'points-usage'
  ) {
    return section === 'points' ? 'points-bal' : section;
  }
  return 'all';
}

function keywordTab(section: SettingsSection): number | null {
  if (section === 'kw-match') return 0;
  if (section === 'kw-replace') return 1;
  if (section === 'kw-transfer') return 2;
  if (section === 'kw-history') return 3;
  return null;
}

/**
 * SettingsCenter 内容区：按领域 section 渲染既有能力。
 */
const SettingsCenter = ({
  section,
  appId: appIdProp,
  instanceId: instanceIdProp,
  onShopContextChange,
}: Props) => {
  const toast = useToast();
  const [appId, setAppId] = useState<string | undefined>(appIdProp);
  const [instanceId, setInstanceId] = useState<string | undefined>(
    instanceIdProp,
  );

  useEffect(() => {
    setAppId(appIdProp);
    setInstanceId(instanceIdProp);
  }, [appIdProp, instanceIdProp]);

  const ensureConfigActive = useCallback(
    async (nextAppId: string, nextInstanceId?: string) => {
      try {
        const resp = await checkConfigActive({
          appId: nextAppId,
          instanceId: nextInstanceId,
        });
        if (!resp.data.active) {
          await activeConfig({
            active: true,
            appId: nextAppId,
            instanceId: nextInstanceId,
          });
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
    if (appId) ensureConfigActive(appId, instanceId);
  }, [appId, instanceId, ensureConfigActive]);

  const view = normalizeSettingsSection(section);
  const kwTab = useMemo(() => keywordTab(view), [view]);
  const generalRef = useRef<GeneralSettingsHandle>(null);

  if (kwTab != null) {
    return (
      <Box className="cs-main-fill" p={2}>
        <DataViewBody initialTab={kwTab} hideSidebar />
      </Box>
    );
  }

  if (view === 'shop') {
    return (
      <Box className="cs-main-fill">
        <ShopManagePanel
          appId={appId}
          instanceId={instanceId}
          onShopContextChange={onShopContextChange}
        />
      </Box>
    );
  }

  if (view === 'voice') {
    return (
      <Box className="cs-page">
        <Flex
          justify="space-between"
          align="center"
          mb={4}
          position="sticky"
          top={0}
          zIndex={5}
          bg="white"
          py={2}
          borderBottomWidth="1px"
          borderColor="gray.100"
        >
          <Heading as="h3" size="md">
            规则
          </Heading>
          <Button
            colorScheme="teal"
            size="md"
            px={8}
            fontWeight="bold"
            onClick={() => generalRef.current?.save()}
          >
            保存
          </Button>
        </Flex>

        <AccountSettings panel={accountPanelFor(section)} />

        <Box mt={6}>
          <GeneralSettings ref={generalRef} style={{ width: '100%' }} />
        </Box>
      </Box>
    );
  }

  return (
    <Box className="cs-page">
      <Heading as="h3" size="md" mb={4}>
        {sectionTitle[section]}
      </Heading>

      {(view === 'account' || view === 'points') && (
        <AccountSettings panel={accountPanelFor(section)} />
      )}

      {view === 'about' && <AboutPage />}
    </Box>
  );
};

export default SettingsCenter;
