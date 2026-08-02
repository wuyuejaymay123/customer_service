import React, { useEffect, useState, useCallback } from 'react';
import {
  Stack,
  HStack,
  Tooltip,
  IconButton,
  Text,
  VStack,
  Checkbox,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { FiPause, FiPlay } from 'react-icons/fi'; // 引入播放器图标
import { useToast } from '../../hooks/useToast';
import {
  getConfig,
  updateConfig,
} from '../../../common/services/platform/controller';
import { DriverConfig } from '../../../common/services/platform/platform';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';

const Panels = () => {
  const { toast } = useToast();
  const { registerEventHandler } = useWebSocketContext();
  const [driverSettings, setDriverSettings] = useState<DriverConfig>({
    hasPaused: true,
    hasKeywordMatch: false,
    hasUseGpt: false,
    hasMouseClose: true,
    hasEscClose: true,
    hasTransfer: true,
    hasReplace: true,
  });

  const { data } = useQuery(['config', 'driver'], async () => {
    try {
      const resp = await getConfig({
        type: 'driver',
      });
      return resp;
    } catch (error) {
      toast({
        title: '获取配置失败',
        description: error instanceof Error ? error.message : String(error),
        status: 'error',
      });

      return null;
    }
  });

  const pausedHandler = useCallback(
    (message: any) => {
      if (message.event === 'has_paused') {
        setDriverSettings((prevSettings) => ({
          ...prevSettings,
          hasPaused: true,
        }));

        toast({
          title: '自动回复总开关已关闭',
          status: 'info',
          position: 'top',
          duration: 5000,
          isClosable: true,
        });
      }
      if (message.event === 'credit_exhausted') {
        setDriverSettings((prevSettings) => ({
          ...prevSettings,
          hasPaused: true,
        }));
        toast({
          title: '点数已耗尽',
          description: '已关闭自动回复总开关，请充值后手动重新开启',
          status: 'error',
          position: 'top',
          duration: 12000,
          isClosable: true,
        });
      }
    },
    [toast],
  );

  useEffect(() => {
    const unregister = registerEventHandler(pausedHandler);

    return () => unregister();
  }, [registerEventHandler, pausedHandler]);

  useEffect(() => {
    if (data) {
      const obj = data.data as DriverConfig;
      setDriverSettings(obj);
    }
  }, [data]);

  useEffect(() => {
    const tick = async () => {
      try {
        const result = await window.electron?.ipcRenderer?.invoke('gateway:me');
        if (result?.ok && result.me?.lowBalance) {
          toast({
            title: '点数余额偏低',
            description: '请联系运营充值，否则智能回复可能中断',
            status: 'warning',
            position: 'top',
            duration: 8000,
            isClosable: true,
          });
        }
      } catch {
        // ignore
      }
    };
    tick();
    const id = setInterval(tick, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [toast]);

  const handleUpdateConfig = async (newConfig: Partial<DriverConfig>) => {
    const updatedConfig = { ...driverSettings, ...newConfig };
    setDriverSettings(updatedConfig);
    try {
      await updateConfig({
        type: 'driver',
        cfg: updatedConfig,
      });

      if ('hasPaused' in newConfig) {
        toast({
          title: '总开关已更新',
          description: newConfig.hasPaused
            ? '已关闭：所有店铺暂停自动回复（各店开关状态保留）'
            : '已开启：仅对已打开本店自动回且已连接的店铺生效',
          status: 'success',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      const errormsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      toast({
        title: '更新配置失败',
        description: errormsg,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  return (
    <Stack spacing={4}>
      <HStack width="full" alignItems="center" justifyContent="space-between">
        <VStack width="35%">
          <Text fontSize="md" fontWeight="medium">
            自动回复总开关
          </Text>
          <Text fontSize="xs" color="gray.500">
            {driverSettings.hasPaused
              ? '当前已关 · 点击开启'
              : '当前已开 · 点击关闭'}
          </Text>
          <IconButton
            icon={driverSettings.hasPaused ? <FiPlay /> : <FiPause />}
            aria-label="AutoReplyMaster"
            size="lg"
            mt={1}
            onClick={() =>
              handleUpdateConfig({ hasPaused: !driverSettings.hasPaused })
            }
            isRound
            colorScheme={driverSettings.hasPaused ? 'green' : 'red'}
          />
        </VStack>
        <VStack width="65%" alignItems="flex-start">
          <HStack>
            <Checkbox
              isChecked={driverSettings.hasKeywordMatch}
              onChange={(e) =>
                handleUpdateConfig({ hasKeywordMatch: e.target.checked })
              }
            >
              <Tooltip label="开启后，命中的关键词会作为素材注入智能回复，不直接发给买家">
                关键词匹配
              </Tooltip>
            </Checkbox>
            <Checkbox
              isChecked={driverSettings.hasUseGpt}
              onChange={(e) =>
                handleUpdateConfig({ hasUseGpt: e.target.checked })
              }
            >
              <Tooltip label="是否开启智能回复；关闭后失败将转人工接管（不再直出关键词）">
                智能回复
              </Tooltip>
            </Checkbox>
          </HStack>
          <HStack>
            <Checkbox
              isChecked={driverSettings.hasTransfer}
              onChange={(e) =>
                handleUpdateConfig({ hasTransfer: e.target.checked })
              }
            >
              <Tooltip label="如果匹配到设置的关键词，将自动转人工">
                关键词转人工
              </Tooltip>
            </Checkbox>
            <Checkbox
              isChecked={driverSettings.hasReplace}
              onChange={(e) =>
                handleUpdateConfig({ hasReplace: e.target.checked })
              }
            >
              <Tooltip label="如果匹配到设置的关键词，将自动替换成自定义的关键词">
                关键词替换
              </Tooltip>
            </Checkbox>
          </HStack>
          <HStack>
            <Checkbox
              isChecked={driverSettings.hasEscClose}
              onChange={(e) =>
                handleUpdateConfig({ hasEscClose: e.target.checked })
              }
            >
              <Tooltip label="当按下 ESC 键时自动暂停">
                按 ESC 键自动暂停
              </Tooltip>
            </Checkbox>
          </HStack>
        </VStack>
      </HStack>
    </Stack>
  );
};

export default React.memo(Panels);
