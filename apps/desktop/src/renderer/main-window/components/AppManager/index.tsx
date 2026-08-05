import React, { useEffect } from 'react';
import { Stack, Skeleton } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import InstanceListComponent from './InstanceListComponent';
import { AppManagerProvider, useAppManager } from './AppManagerContext';

const LoadingSkeleton = () => (
  <Stack p={4}>
    <Skeleton height="20px" />
    <Skeleton height="20px" />
    <Skeleton height="20px" />
  </Stack>
);

const AppManagerContent = () => {
  const navigate = useNavigate();
  const {
    data,
    isLoading,
    isSettingsOpen,
    setIsSettingsOpen,
    selectedAppId,
    selectedInstanceId,
  } = useAppManager();

  useEffect(() => {
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
      const qs = new URLSearchParams();
      if (selectedAppId) qs.set('appId', selectedAppId);
      if (selectedInstanceId) qs.set('instanceId', String(selectedInstanceId));
      navigate({
        pathname: selectedInstanceId ? '/settings/shop' : '/settings/account',
        search: qs.toString() ? `?${qs.toString()}` : '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAppId, selectedInstanceId, isSettingsOpen, setIsSettingsOpen]);

  if (isLoading && !data) {
    return <LoadingSkeleton />;
  }

  return <InstanceListComponent />;
};

const AppManagerComponent = () => {
  return (
    <AppManagerProvider>
      <AppManagerContent />
    </AppManagerProvider>
  );
};

export default React.memo(AppManagerComponent);
