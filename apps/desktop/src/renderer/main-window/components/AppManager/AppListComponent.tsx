import React from 'react';
import { Box, VStack, Spinner, Text } from '@chakra-ui/react';
import AppCardComponent from './AppCardComponent';
import SearchBarComponent from './SearchBarComponent';
import { useAppManager } from './AppManagerContext';

const AppListComponent = () => {
  const {
    data,
    isLoading,
    selectedAppId,
    setSelectedAppId,
    setSelectedInstanceId,
    handleSearch,
    setIsSettingsOpen,
    instances,
  } = useAppManager();

  return (
    <Box w="40%" bg="brand.50" display="flex" flexDirection="column">
      <Box p={2} position="sticky" top="0" zIndex="1">
        <SearchBarComponent onSearch={handleSearch} />
      </Box>
      <VStack spacing={3} align="stretch" overflowY="auto" flex="1" p={4}>
        {data?.data && data?.data.length > 0 ? (
          data.data.map((app, i) => (
            <AppCardComponent
              key={i}
              app={app}
              selectedAppId={selectedAppId}
              setSelectedAppId={setSelectedAppId}
              openSettings={() => {
                setSelectedAppId(app.id);
                setSelectedInstanceId(null);
                setIsSettingsOpen(true);
              }}
              instances={instances}
            />
          ))
        ) : (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height="100%"
            flexDirection="column"
            px={4}
          >
            {isLoading || !data ? (
              <>
                <Spinner size="xl" />
                <Text ml={4} mt={2}>
                  启动服务中...
                </Text>
              </>
            ) : (
              <Text color="gray.500" textAlign="center">
                暂无应用。若持续为空，请重启桌面端。
              </Text>
            )}
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default AppListComponent;
