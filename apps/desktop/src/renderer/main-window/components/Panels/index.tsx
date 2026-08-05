import React, { useEffect, useState, useCallback } from 'react';
import { Box, Text, Tooltip } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { FiPause, FiPlay } from 'react-icons/fi';
import { useToast } from '../../hooks/useToast';
import {
  getConfig,
  updateConfig,
} from '../../../common/services/platform/controller';
import { DriverConfig } from '../../../common/services/platform/platform';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';

/**
 * AutoReplyMaster 总开关（运营台）。驱动勾选项已从本屏移除，配置仍按后台已存值生效。
 */
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

  const on = !driverSettings.hasPaused;

  return (
    <Box className={`cs-master${on ? ' on' : ''}`}>
      <Tooltip
        label={
          on
            ? '点击关闭：所有店铺暂停自动回复'
            : '点击开启：已打开本店自动回且已连接的店将自动回复'
        }
      >
        <button
          type="button"
          className={`cs-master-btn${on ? ' on' : ''}`}
          aria-label="AutoReplyMaster"
          onClick={() =>
            handleUpdateConfig({ hasPaused: !driverSettings.hasPaused })
          }
        >
          {on ? <FiPause size={22} /> : <FiPlay size={22} />}
        </button>
      </Tooltip>
      <Text className="cs-master-title">自动接待总开关</Text>
      <Text className="cs-master-sub">
        {on ? '当前已开 · 点击关闭' : '当前已关 · 点击开启'}
      </Text>
    </Box>
  );
};

export default React.memo(Panels);
