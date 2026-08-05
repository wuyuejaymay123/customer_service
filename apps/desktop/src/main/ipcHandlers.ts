import {
  ipcMain,
  dialog,
  shell,
  BrowserWindow,
  app,
  Notification,
} from 'electron';
import Store from 'electron-store';
import os from 'os';
import path from 'path';
import type BackendServiceManager from './system/backend';
import { getBrowserVersionFromOS } from './system/chrome';
import { createWindow as createSettingsWindow } from './windows/settings-main';
import { createWindow as createDataviewWindow } from './windows/dataview-main';

const store = new Store();

const setupIpcHandlers = (
  mainWindow: BrowserWindow,
  bsm: BackendServiceManager,
) => {
  ipcMain.on('get-env', async (event, key) => {
    event.returnValue = process.env[key];
  });

  ipcMain.on('get-port', async (event) => {
    event.returnValue = bsm.getPort();
  });

  ipcMain.on('ipc-example', async (event) => {
    const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
    event.reply('ipc-example', msgTemplate('pong'));
  });

  ipcMain.on('select-directory', async (event) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    event.reply('selected-directory', result.filePaths);
  });

  ipcMain.on('select-file', async (event, args) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters:
        args && args.filters
          ? args.filters
          : [{ name: 'All Files', extensions: ['*'] }],
    });
    event.reply('selected-file', result.filePaths);
  });

  ipcMain.on('open-directory', async (event, args) => {
    shell.openPath(args);
  });

  ipcMain.on('open-logger-folder', async () => {
    const logDir = path.join(os.tmpdir(), 'chatgpt-on-cs');

    shell.openPath(logDir);
  });

  ipcMain.on('electron-store-get', async (event, val) => {
    event.returnValue = store.get(val);
  });

  ipcMain.on('electron-store-set', async (event, key, val) => {
    store.set(key, val);
  });

  ipcMain.on('electron-store-remove', async (event, key) => {
    store.delete(key);
  });

  ipcMain.on('get-version', async (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.on('open-url', async (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.on('get-browser-version', async (event) => {
    const version = await getBrowserVersionFromOS();
    event.returnValue = version;
  });

  ipcMain.on('notification', async (event, title, message) => {
    const notification = {
      title,
      body: message,
    };
    new Notification(notification).show();
  });

  ipcMain.on(
    'open-settings-window',
    async (
      _event,
      payload: {
        appId?: string;
        instanceId?: string;
        section?: string;
        tab?: string;
      } = {},
    ) => {
      console.log('[settings] ipc open-settings-window', payload);
      try {
        await createSettingsWindow({
          appId: payload?.appId ? String(payload.appId) : undefined,
          instanceId: payload?.instanceId
            ? String(payload.instanceId)
            : undefined,
          section: payload?.section ? String(payload.section) : undefined,
          tab: payload?.tab ? String(payload.tab) : undefined,
        });
      } catch (e) {
        console.error('[settings] open failed', e);
      }
    },
  );

  ipcMain.handle(
    'open-settings-window',
    async (
      _event,
      payload: {
        appId?: string;
        instanceId?: string;
        section?: string;
        tab?: string;
      } = {},
    ) => {
      console.log('[settings] invoke open-settings-window', payload);
      await createSettingsWindow({
        appId: payload?.appId ? String(payload.appId) : undefined,
        instanceId: payload?.instanceId
          ? String(payload.instanceId)
          : undefined,
        section: payload?.section ? String(payload.section) : undefined,
        tab: payload?.tab ? String(payload.tab) : undefined,
      });
      return { ok: true };
    },
  );

  ipcMain.on('open-dataview-window', async (event, args) => {
    createDataviewWindow(args);
  });

  ipcMain.handle('gateway:get-auth', async () => {
    const { loadGatewayAuth } = await import(
      './backend/services/gatewayClient'
    );
    const auth = await loadGatewayAuth();
    if (!auth) return null;
    // 不把密码暴露给 Renderer
    return {
      gatewayUrl: auth.gatewayUrl,
      username: auth.username,
      hasToken: Boolean(auth.token),
    };
  });

  ipcMain.handle(
    'gateway:login',
    async (
      _event,
      payload: {
        gatewayUrl?: string;
        username: string;
        password: string;
      },
    ) => {
      try {
        const { DEFAULT_GATEWAY_URL } = await import(
          '../common/gatewayDefaults'
        );
        const { loginGateway, fetchMe } = await import(
          './backend/services/gatewayClient'
        );
        const { pullDesktopConfigOnLogin } = await import(
          './backend/services/desktopConfigSync'
        );
        const auth = await loginGateway(
          payload.gatewayUrl || DEFAULT_GATEWAY_URL,
          payload.username,
          payload.password,
        );
        const me = await fetchMe(auth);
        const sync = await pullDesktopConfigOnLogin();
        return { ok: true, me, sync };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle('gateway:logout', async () => {
    try {
      const { clearGatewayAuth } = await import(
        './backend/services/gatewayClient'
      );
      await clearGatewayAuth();
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('gateway:me', async () => {
    try {
      const { loadGatewayAuth, fetchMe } = await import(
        './backend/services/gatewayClient'
      );
      const { hasUsableGatewaySession } = await import(
        './backend/services/gatewayAuthPersist'
      );
      const { pullDesktopConfigOnLogin } = await import(
        './backend/services/desktopConfigSync'
      );
      const auth = await loadGatewayAuth();
      if (!hasUsableGatewaySession(auth)) {
        return { ok: false, message: '尚未登录' };
      }
      const me = await fetchMe(auth!);
      const sync = await pullDesktopConfigOnLogin();
      return { ok: true, me, sync };
    } catch (e) {
      try {
        const { markGatewayOffline } = await import(
          './backend/services/desktopConfigSync'
        );
        await markGatewayOffline();
      } catch {
        /* ignore */
      }
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('gateway:list-operators', async () => {
    try {
      const { loadGatewayAuth, listOperators } = await import(
        './backend/services/gatewayClient'
      );
      const { hasUsableGatewaySession } = await import(
        './backend/services/gatewayAuthPersist'
      );
      const auth = await loadGatewayAuth();
      if (!hasUsableGatewaySession(auth)) {
        return { ok: false, message: '尚未登录' };
      }
      const data = await listOperators(auth!);
      return { ok: true, data };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle(
    'gateway:create-operator',
    async (
      _event,
      payload: {
        username: string;
        password: string;
        quotaLimit?: number | null;
      },
    ) => {
      try {
        const { loadGatewayAuth, createOperator } = await import(
          './backend/services/gatewayClient'
        );
        const { hasUsableGatewaySession } = await import(
          './backend/services/gatewayAuthPersist'
        );
        const auth = await loadGatewayAuth();
        if (!hasUsableGatewaySession(auth)) {
          return { ok: false, message: '尚未登录' };
        }
        const data = await createOperator(auth!, payload);
        return { ok: true, data };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  async function loadAuthOrNull() {
    const { loadGatewayAuth } = await import(
      './backend/services/gatewayClient'
    );
    const { hasUsableGatewaySession } = await import(
      './backend/services/gatewayAuthPersist'
    );
    const auth = await loadGatewayAuth();
    if (!hasUsableGatewaySession(auth)) return null;
    return auth;
  }

  ipcMain.handle(
    'gateway:update-operator-quota',
    async (
      _event,
      payload: { operatorId: string; quotaLimit: number | null },
    ) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { updateOperatorQuota } = await import(
          './backend/services/gatewayClient'
        );
        const data = await updateOperatorQuota(
          auth,
          payload.operatorId,
          payload.quotaLimit,
        );
        return { ok: true, data };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle(
    'gateway:reset-operator-quota',
    async (_event, payload: { operatorId: string }) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { resetOperatorQuota } = await import(
          './backend/services/gatewayClient'
        );
        const data = await resetOperatorQuota(auth, payload.operatorId);
        return { ok: true, data };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle(
    'gateway:change-password',
    async (
      _event,
      payload: { currentPassword: string; newPassword: string },
    ) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { changeOwnPassword } = await import(
          './backend/services/gatewayClient'
        );
        await changeOwnPassword(auth, payload);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle('gateway:list-ledger', async () => {
    return {
      ok: false,
      message: '请使用点数流水（成功扣点）查看用量',
    };
  });

  ipcMain.handle('gateway:list-recharges', async () => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { listRecharges } = await import('./backend/services/gatewayClient');
      return { ok: true, data: await listRecharges(auth) };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('gateway:list-usage', async () => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { listTenantUsage } = await import(
        './backend/services/gatewayClient'
      );
      return { ok: true, data: await listTenantUsage(auth) };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('gateway:list-shops', async () => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { listShops } = await import('./backend/services/gatewayClient');
      return { ok: true, data: await listShops(auth) };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle(
    'gateway:create-shop',
    async (
      _event,
      payload: {
        displayName: string;
        channel: 'pinduoduo' | 'qianniu';
        externalKeys: string[];
        positioning?: string;
        logistics?: string;
        afterSales?: string;
        forbidden?: string;
        transferRules?: string;
      },
    ) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { createShop } = await import('./backend/services/gatewayClient');
        return { ok: true, data: await createShop(auth, payload) };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle(
    'gateway:update-shop',
    async (
      _event,
      payload: {
        id: string;
        displayName?: string;
        channel?: 'pinduoduo' | 'qianniu';
        externalKeys?: string[];
        positioning?: string;
        logistics?: string;
        afterSales?: string;
        forbidden?: string;
        transferRules?: string;
      },
    ) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { updateShop } = await import('./backend/services/gatewayClient');
        const { id, ...rest } = payload;
        return { ok: true, data: await updateShop(auth, id, rest) };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle('gateway:delete-shop', async (_event, id: string) => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { deleteShop } = await import('./backend/services/gatewayClient');
      await deleteShop(auth, id);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('gateway:get-policy', async () => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { getPolicy } = await import('./backend/services/gatewayClient');
      return { ok: true, data: await getPolicy(auth) };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('gateway:get-tenant-voice', async () => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { getTenantVoice } = await import('./backend/services/gatewayClient');
      return { ok: true, data: await getTenantVoice(auth) };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle(
    'gateway:save-tenant-voice',
    async (_event, content: string) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { saveTenantVoice } = await import(
          './backend/services/gatewayClient'
        );
        return { ok: true, data: await saveTenantVoice(auth, content) };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle(
    'gateway:save-policy',
    async (
      _event,
      payload: {
        logistics?: string;
        afterSales?: string;
        forbidden?: string;
        transferRules?: string;
      },
    ) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { savePolicy } = await import('./backend/services/gatewayClient');
        return { ok: true, data: await savePolicy(auth, payload) };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle(
    'gateway:list-goods-notes',
    async (_event, shopId: string) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { listGoodsNotes } = await import(
          './backend/services/gatewayClient'
        );
        return { ok: true, data: await listGoodsNotes(auth, shopId) };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle(
    'gateway:create-goods-note',
    async (
      _event,
      payload: {
        shopId: string;
        goodsId?: string | null;
        titleAliases: string[];
        sellingPoints?: string;
        specsNotes?: string;
        objections?: string;
      },
    ) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { createGoodsNote } = await import(
          './backend/services/gatewayClient'
        );
        const { shopId, ...rest } = payload;
        return { ok: true, data: await createGoodsNote(auth, shopId, rest) };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle(
    'gateway:update-goods-note',
    async (
      _event,
      payload: {
        id: string;
        goodsId?: string | null;
        titleAliases?: string[];
        sellingPoints?: string;
        specsNotes?: string;
        objections?: string;
      },
    ) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { updateGoodsNote } = await import(
          './backend/services/gatewayClient'
        );
        const { id, ...rest } = payload;
        return { ok: true, data: await updateGoodsNote(auth, id, rest) };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle('gateway:delete-goods-note', async (_event, id: string) => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { deleteGoodsNote } = await import(
        './backend/services/gatewayClient'
      );
      await deleteGoodsNote(auth, id);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle('gateway:list-knowledge', async () => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { listKnowledge } = await import('./backend/services/gatewayClient');
      return { ok: true, data: await listKnowledge(auth) };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle(
    'gateway:create-knowledge',
    async (_event, payload: { title: string; content: string }) => {
      try {
        const auth = await loadAuthOrNull();
        if (!auth) return { ok: false, message: '尚未登录' };
        const { createKnowledge } = await import(
          './backend/services/gatewayClient'
        );
        return { ok: true, data: await createKnowledge(auth, payload) };
      } catch (e) {
        return {
          ok: false,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    },
  );

  ipcMain.handle('gateway:delete-knowledge', async (_event, id: string) => {
    try {
      const auth = await loadAuthOrNull();
      if (!auth) return { ok: false, message: '尚未登录' };
      const { deleteKnowledge } = await import(
        './backend/services/gatewayClient'
      );
      await deleteKnowledge(auth, id);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });
};

export default setupIpcHandlers;
