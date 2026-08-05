import React, { useState, useEffect, useCallback } from 'react';
import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import HomePage from './pages/Home';
import SettingsPage from './pages/Settings';
import FullScreenLoader from './pages/FullScreenLoader';
import LoginPage from './pages/LoginPage';
import SystemCheck from './components/SystemCheck';
import { BroadcastProvider } from './hooks/useBroadcastContext';
import '../common/App.css';
import '../common/shell/appShell.css';
import theme from '../common/styles/theme';

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

function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [auth, setAuth] = useState<'loading' | 'in' | 'out'>('loading');

  const checkAuth = useCallback(async () => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke('gateway:me');
      setAuth(result?.ok && result?.me?.user ? 'in' : 'out');
    } catch {
      setAuth('out');
    }
  }, []);

  useEffect(() => {
    window.electron.ipcRenderer.on('check-health', (health) => {
      const h = health as boolean;
      setIsLoaded(h);
    });

    return () => {
      window.electron.ipcRenderer.remove('check-health');
    };
  });

  useEffect(() => {
    if (!isLoaded) return;
    checkAuth();
  }, [isLoaded, checkAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <ChakraProvider theme={theme}>
        <BroadcastProvider>
          <ErrorBoundary>
            <Router>
              {!isLoaded || auth === 'loading' ? (
                <FullScreenLoader />
              ) : auth === 'out' ? (
                <LoginPage onSuccess={() => setAuth('in')} />
              ) : (
                <Routes>
                  <Route
                    element={<AppShell onLogout={() => setAuth('out')} />}
                  >
                    <Route path="/" element={<HomePage />} />
                    <Route
                      path="/settings/:section"
                      element={<SettingsPage />}
                    />
                  </Route>
                </Routes>
              )}
              <SystemCheck />
            </Router>
          </ErrorBoundary>
        </BroadcastProvider>
      </ChakraProvider>
    </QueryClientProvider>
  );
}

export default App;
