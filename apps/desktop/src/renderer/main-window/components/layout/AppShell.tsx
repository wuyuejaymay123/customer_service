import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Button,
  useDisclosure,
} from '@chakra-ui/react';
import { SettingsSection } from '../../../common/settings/SettingsCenter';
import '../../../common/shell/appShell.css';

/** 与 gateway /me（及 AccountSettings）一致的嵌套结构 */
type MePayload = {
  user?: { username?: string; role?: string };
  tenant?: { name?: string; status?: string };
  lowBalance?: boolean;
  wallet?: { available?: number; balance?: number; reserved?: number };
};

type NavTarget =
  | { type: 'ops' }
  | { type: 'settings'; section: SettingsSection }
  | { type: 'group'; id: string; label: string; children: SettingsSection[] };

const NAV: NavTarget[] = [
  { type: 'ops' },
  {
    type: 'group',
    id: 'storewide',
    label: '全店管理',
    children: ['voice', 'kw-match', 'kw-replace', 'kw-transfer'],
  },
  { type: 'settings', section: 'shop' },
  {
    type: 'group',
    id: 'points',
    label: '积分',
    children: ['points-bal', 'points-rech', 'points-usage'],
  },
  {
    type: 'group',
    id: 'account',
    label: '账户',
    children: ['account'],
  },
];

const SECTION_LABEL: Record<SettingsSection, string> = {
  voice: '规则',
  reply: '回复策略',
  shop: '单店管理',
  points: '积分',
  'points-bal': '积分余额',
  'points-rech': '充值明细',
  'points-usage': '用量明细',
  account: '登录与改密',
  about: '关于',
  'kw-match': '关键词匹配',
  'kw-replace': '关键词替换',
  'kw-transfer': '关键词转接',
  'kw-history': '历史聊天记录',
};

function pathForSection(section: SettingsSection) {
  return `/settings/${section}`;
}

function sectionFromPath(pathname: string): SettingsSection | null {
  const m = pathname.match(/^\/settings\/([^/]+)/);
  if (!m) return null;
  return m[1] as SettingsSection;
}

type Props = {
  onLogout?: () => void;
};

const AppShell = ({ onLogout }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<MePayload | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const {
    isOpen: logoutConfirmOpen,
    onOpen: openLogoutConfirm,
    onClose: closeLogoutConfirm,
  } = useDisclosure();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    storewide: true,
    points: false,
    account: false,
  });

  const refreshMe = useCallback(async () => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke('gateway:me');
      if (result?.ok) setMe(result.me || null);
      else setMe(null);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refreshMe();
    const id = setInterval(refreshMe, 60 * 1000);
    return () => clearInterval(id);
  }, [refreshMe]);

  useEffect(() => {
    refreshMe();
  }, [location.pathname, refreshMe]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const isOps = location.pathname === '/' || location.pathname === '';
  const activeSection = sectionFromPath(location.pathname);

  const goSection = (section: SettingsSection) => {
    const qs = new URLSearchParams(location.search);
    navigate({
      pathname: pathForSection(section),
      search: qs.toString() ? `?${qs.toString()}` : '',
    });
  };

  const identity = me?.user?.username || null;
  const tenant = me?.tenant?.name || '';
  const avText = (identity || '未').slice(0, 1);

  const doLogout = async () => {
    closeLogoutConfirm();
    setMenuOpen(false);
    try {
      await window.electron?.ipcRenderer?.invoke('gateway:logout');
    } catch {
      // ignore
    }
    onLogout?.();
  };

  const navNodes = useMemo(() => {
    return NAV.map((item) => {
      if (item.type === 'ops') {
        return (
          <div
            key="ops"
            className={`cs-nav-item${isOps ? ' active' : ''}`}
            onClick={() => navigate('/')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate('/');
            }}
            role="button"
            tabIndex={0}
          >
            运营台
          </div>
        );
      }
      if (item.type === 'settings') {
        const active = activeSection === item.section;
        return (
          <div
            key={item.section}
            className={`cs-nav-item${active ? ' active' : ''}`}
            onClick={() => goSection(item.section)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') goSection(item.section);
            }}
            role="button"
            tabIndex={0}
          >
            {SECTION_LABEL[item.section]}
          </div>
        );
      }
      const childActive = item.children.some((c) => c === activeSection);
      const open = openGroups[item.id] || childActive;
      return (
        <React.Fragment key={item.id}>
          <div
            className={`cs-nav-item expand${open ? ' open' : ''}`}
            onClick={() =>
              setOpenGroups((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setOpenGroups((prev) => ({
                  ...prev,
                  [item.id]: !prev[item.id],
                }));
              }
            }}
            role="button"
            tabIndex={0}
          >
            {item.label}
            <span className="caret">▸</span>
          </div>
          {open && (
            <div className="cs-nav-sub">
              {item.children.map((child) => (
                <div
                  key={child}
                  className={`cs-nav-sub-i${
                    activeSection === child ? ' active' : ''
                  }`}
                  onClick={() => goSection(child)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') goSection(child);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  {SECTION_LABEL[child]}
                </div>
              ))}
            </div>
          )}
        </React.Fragment>
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOps, activeSection, openGroups, location.search]);

  return (
    <div className="cs-app">
      <header className="cs-titlebar">
        <div className="cs-brand">
          <span className="logo">智</span>
          智能客服
        </div>
        <div className="cs-title-actions">
          <div className="cs-me-wrap" ref={menuRef}>
            <div
              className="cs-me"
              onClick={() => setMenuOpen((v) => !v)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setMenuOpen((v) => !v);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="av">{avText}</div>
              <div>
                <b>{identity || '未登录'}</b>
                <small>{tenant || ''}</small>
              </div>
            </div>
            {menuOpen && (
              <div className="cs-me-menu">
                <button
                  type="button"
                  className="cs-me-menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    goSection('account');
                  }}
                >
                  登录与改密
                </button>
                <button
                  type="button"
                  className="cs-me-menu-item danger"
                  onClick={openLogoutConfirm}
                >
                  退出登录
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="cs-body-row">
        <aside className="cs-nav">
          <div className="cs-nav-items">{navNodes}</div>
        </aside>
        <main className="cs-main">
          {isOps ? (
            <div className="cs-main-fill">
              <Outlet />
            </div>
          ) : (
            <div className="cs-main-scroll">
              <Outlet />
            </div>
          )}
        </main>
      </div>

      <AlertDialog
        isOpen={logoutConfirmOpen}
        leastDestructiveRef={cancelRef}
        onClose={closeLogoutConfirm}
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              确认退出登录？
            </AlertDialogHeader>
            <AlertDialogBody>
              退出后需重新输入账号密码才能使用本系统。
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={closeLogoutConfirm}>
                取消
              </Button>
              <Button colorScheme="red" onClick={doLogout} ml={3}>
                确认退出
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </div>
  );
};

export default AppShell;
