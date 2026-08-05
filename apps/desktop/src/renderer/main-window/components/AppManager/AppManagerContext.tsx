import React, {
  useMemo,
  useCallback,
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';
import { useToast } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import {
  getPlatformList,
  getTasks,
  removeTask,
  addTask,
} from '../../../common/services/platform/controller';
import defaultPlatformIcon from '../../../../../assets/base/default-platform-icon.png';
import { Instance, App } from '../../../common/services/platform/platform';

interface AppManagerContextType {
  data: { data: App[] } | undefined;
  isLoading: boolean;
  isTasksLoading: boolean;
  setSelectedAppId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedAppId: string | null;
  setSelectedInstanceId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedInstanceId: string | null;
  /** 当前展示的店铺列表（已含搜索过滤，跨平台） */
  filteredInstances: Instance[];
  isSettingsOpen: boolean;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  handleSearch: (searchTerm: string) => void;
  searchTerm: string;
  handleDelete: (taskId: string) => void;
  /** 不传则默认拼多多 */
  handleAddTask: (appId?: string) => Promise<void>;
  instances: Instance[];
  refetchTasks: () => void;
}

const AppManagerContext = createContext<AppManagerContextType | undefined>(
  undefined,
);

interface AppManagerProviderProps {
  children: ReactNode;
}

export const useAppManager = (): AppManagerContextType => {
  const context = useContext(AppManagerContext);
  if (!context) {
    throw new Error('useAppManager must be used within an AppManagerProvider');
  }
  return context;
};

export function platformLabel(appId?: string | null): string {
  if (appId === 'pinduoduo') return '拼多多';
  if (appId === 'win_qianniu') return '千牛';
  return appId || '未知平台';
}

function shopSearchText(instance: Instance, apps?: App[]): string {
  const appName =
    apps?.find((a) => a.id === instance.app_id)?.name ||
    platformLabel(instance.app_id);
  const shop =
    instance.shop_name?.trim() ||
    (instance.app_id === 'win_qianniu'
      ? '多店铺模式'
      : `#${instance.task_id}`);
  return `${appName} ${platformLabel(instance.app_id)} ${shop} ${instance.task_id}`.toLowerCase();
}

const usePlatformList = () => {
  const [retryCount, setRetryCount] = useState(0);

  const { data, error, refetch, isLoading } = useQuery(
    ['platformList'],
    getPlatformList,
    {
      retry: false,
    },
  );

  // eslint-disable-next-line consistent-return
  useEffect(() => {
    if ((data?.data?.length === 0 || !data) && retryCount < 20) {
      const timer = setTimeout(() => {
        setRetryCount(retryCount + 1);
        refetch();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [data, retryCount, refetch]);

  return { data, isLoading, error, retryCount };
};

const useTaskList = () => {
  return useQuery(['tasks'], () => getTasks(), {
    refetchInterval: 4000,
  });
};

const useInstances = () => {
  const { data: taskData, refetch: refetchTasks } = useTaskList();
  const instances = taskData?.data || [];

  return { instances, refetchTasks };
};

const useRefreshConfigListener = (refetchTasks: () => void) => {
  useEffect(() => {
    const refreshConfigListener = async () => {
      try {
        await refetchTasks();
      } catch (error: any) {
        console.error(error);
      }
    };

    window.electron.ipcRenderer.on('refresh-config', refreshConfigListener);
    return () => {
      window.electron.ipcRenderer.remove('refresh-config');
    };
  }, [refetchTasks]);
};

export const AppManagerProvider = ({ children }: AppManagerProviderProps) => {
  const { data, isLoading } = usePlatformList();
  const toast = useToast();
  /** 添加店铺时的默认平台；列表不再依赖选中平台过滤 */
  const [selectedAppId, setSelectedAppId] = useState<string | null>(
    'pinduoduo',
  );
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(
    null,
  );
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { instances, refetchTasks } = useInstances();

  useRefreshConfigListener(refetchTasks);

  const filteredInstances = useMemo(() => {
    const withAvatar = instances.map((instance) => ({
      ...instance,
      avatar:
        data?.data.find((app) => app.id === instance.app_id)?.avatar ||
        defaultPlatformIcon,
    }));
    const q = searchTerm.trim().toLowerCase();
    if (!q) return withAvatar;
    return withAvatar.filter((instance) =>
      shopSearchText(instance, data?.data).includes(q),
    );
  }, [instances, data, searchTerm]);

  const handleSearch = useCallback((term: string) => {
    setSearchTerm(term);
  }, []);

  const handleDelete = useCallback(
    async (taskId: string) => {
      try {
        await removeTask(taskId);
        await refetchTasks();
      } catch (error) {
        const msg = (error as Error).message || '未知错误';
        console.error('删除失败:', msg);
        toast({
          title: '删除失败',
          description: msg,
          status: 'error',
          position: 'top',
          duration: 5000,
          isClosable: true,
        });
        await refetchTasks();
      }
    },
    [refetchTasks, toast],
  );

  const handleAddTask = useCallback(
    async (appId?: string) => {
      const target = appId || selectedAppId || 'pinduoduo';
      setSelectedAppId(target);
      setIsTasksLoading(true);
      try {
        const { error } = await addTask(target);
        if (error) {
          throw new Error(error);
        }

        await refetchTasks();
      } catch (error) {
        const msg = (error as Error).message || '未知错误';
        console.error('新增实例失败:', msg);
        toast({
          title: '未能打开浏览器',
          description: msg,
          status: 'error',
          position: 'top',
          duration: 8000,
          isClosable: true,
        });
        await refetchTasks();
      } finally {
        setIsTasksLoading(false);
      }
    },
    [selectedAppId, refetchTasks, toast],
  );

  const contextValue = useMemo(
    () => ({
      data,
      isLoading,
      isTasksLoading,
      selectedAppId,
      setSelectedAppId,
      selectedInstanceId,
      setSelectedInstanceId,
      filteredInstances,
      isSettingsOpen,
      setIsSettingsOpen,
      handleSearch,
      searchTerm,
      handleDelete,
      handleAddTask,
      instances,
      refetchTasks,
    }),
    [
      data,
      isLoading,
      isTasksLoading,
      selectedAppId,
      selectedInstanceId,
      filteredInstances,
      isSettingsOpen,
      instances,
      handleSearch,
      searchTerm,
      handleDelete,
      handleAddTask,
      refetchTasks,
    ],
  );

  return (
    <AppManagerContext.Provider value={contextValue}>
      {children}
    </AppManagerContext.Provider>
  );
};
