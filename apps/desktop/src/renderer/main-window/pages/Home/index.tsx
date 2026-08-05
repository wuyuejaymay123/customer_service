import React, { useEffect } from 'react';
import { trackPageView } from '../../../common/services/analytics';
import AppManager from '../../components/AppManager/index';
import Panels from '../../components/Panels';
import LogBox from '../../components/LogBox';
import HandoffQueue from '../../components/HandoffQueue';
import DeskReady from '../../components/DeskReady';
import '../../../common/shell/appShell.css';

const HomePage = () => {
  const currentVersion = window.electron.ipcRenderer.get('get-version');
  useEffect(() => {
    trackPageView(`Home-${currentVersion}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DeskReady>
      <div className="cs-workspace">
        <div className="cs-left-panel">
          <div className="cs-master-slot">
            <Panels />
          </div>
          <div className="cs-shop-slot">
            <AppManager />
          </div>
        </div>
        <div className="cs-right-col">
          <div className="cs-run-panel">
            <LogBox />
          </div>
          <div className="cs-takeover-panel">
            <HandoffQueue />
          </div>
        </div>
      </div>
    </DeskReady>
  );
};

export default HomePage;
