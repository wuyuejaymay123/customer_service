import React, { useEffect } from 'react';
import { Box, Stack, Divider } from '@chakra-ui/react';
import PageContainer from '../../../common/components/PageContainer';
import { trackPageView } from '../../../common/services/analytics';
import AppManager from '../../components/AppManager/index';
import Panels from '../../components/Panels';
import LogBox from '../../components/LogBox';
import HandoffQueue from '../../components/HandoffQueue';
import DeskStatus from '../../components/DeskStatus';
import DeskReady from '../../components/DeskReady';

const HomePage = () => {
  const currentVersion = window.electron.ipcRenderer.get('get-version');
  useEffect(() => {
    trackPageView(`Home-${currentVersion}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageContainer>
      <DeskReady>
        <Stack spacing={2}>
          <Box>
            <DeskStatus />
          </Box>
          <Box>
            <AppManager />
          </Box>
          <Divider my="4" />
          <Box>
            <Panels />
          </Box>
          <Divider my="4" />
          <Box>
            <HandoffQueue />
          </Box>
          <Box>
            <LogBox />
          </Box>
        </Stack>
      </DeskReady>
    </PageContainer>
  );
};

export default HomePage;
