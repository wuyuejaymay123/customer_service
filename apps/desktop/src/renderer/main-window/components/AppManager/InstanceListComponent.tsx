import React, { useEffect } from 'react';
import { Box, Spinner, Flex, useToast } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import InstanceCardComponent from './InstanceCardComponent';
import { useAppManager } from './AppManagerContext';
import { getConfig } from '../../../common/services/platform/controller';
import { DriverConfig } from '../../../common/services/platform/platform';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';

const InstanceListComponent = () => {
  const {
    filteredInstances,
    selectedInstanceId,
    setSelectedInstanceId,
    handleDelete,
    handleSearch,
    searchTerm,
    isLoading,
    refetchTasks,
  } = useAppManager();

  const toast = useToast();
  const navigate = useNavigate();
  const { registerEventHandler } = useWebSocketContext();

  const { data: driverData } = useQuery(['config', 'driver'], async () => {
    const resp = await getConfig({ type: 'driver' });
    return resp;
  });
  const masterOn = !(
    (driverData?.data as DriverConfig | undefined)?.hasPaused ?? true
  );

  useEffect(() => {
    const handler = (message: { event: string; data?: any }) => {
      if (message.event === 'shop_auto_reply_halt') {
        const shop = message.data?.shopName || '某店铺';
        const reason = message.data?.reasonLabel || '已停用';
        toast({
          title: `${shop} 已停用自动回复`,
          description: reason,
          status: 'warning',
          position: 'top',
          duration: 8000,
          isClosable: true,
        });
        refetchTasks();
      }
      if (
        message.event === 'has_paused' ||
        message.event === 'credit_exhausted'
      ) {
        refetchTasks();
      }
    };
    return registerEventHandler(handler);
  }, [registerEventHandler, toast, refetchTasks]);

  return (
    <Box
      w="100%"
      h="100%"
      display="flex"
      flexDirection="column"
      minH={0}
      bg="#f6f8fb"
    >
      <div className="cs-shop-search">
        <input
          type="search"
          placeholder="搜索店铺"
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      <Box flex="1" overflowY="auto" px={3} pb={3} minH={0} pt={2}>
        {isLoading && filteredInstances.length === 0 ? (
          <Flex justify="center" align="center" py={10}>
            <Spinner />
          </Flex>
        ) : filteredInstances.length > 0 ? (
          filteredInstances.map((instance) => (
            <InstanceCardComponent
              key={instance.task_id}
              instance={instance}
              masterOn={masterOn}
              selectedInstanceId={selectedInstanceId}
              setSelectedInstanceId={setSelectedInstanceId}
              handleDelete={handleDelete}
              hideManageActions
              onShopAutoReplyChanged={() => refetchTasks()}
              openSettings={async () => {
                setSelectedInstanceId(instance.task_id);
                const qs = new URLSearchParams();
                if (instance.app_id) qs.set('appId', instance.app_id);
                qs.set('instanceId', String(instance.task_id));
                navigate({
                  pathname: '/settings/shop',
                  search: `?${qs.toString()}`,
                });
              }}
            />
          ))
        ) : (
          <div className="cs-shop-empty">
            {searchTerm.trim() ? '没有匹配的店铺' : '尚未绑定店铺'}
          </div>
        )}
      </Box>
    </Box>
  );
};

export default InstanceListComponent;
