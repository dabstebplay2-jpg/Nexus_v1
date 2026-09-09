const path = require('path');
const { session } = require('electron');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');
const { installChromeWebStore, installExtension } = require('electron-chrome-web-store');
const { readStore, writeStore } = require('./storage');

let extensionsApi = null;
let browserSession = null;
let mainWindowRef = null;

function getBrowserSession() {
  if (!browserSession) browserSession = session.fromPartition('persist:default');
  return browserSession;
}

function initExtensionsBridge(tabManager, mainWindow) {
  mainWindowRef = mainWindow;
  const sess = getBrowserSession();

  extensionsApi = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: sess,
    async createTab(details) {
      const url = details.url || 'about:blank';
      const id = tabManager.createTab(url);
      const tab = tabManager.tabs.find((t) => t.id === id);
      if (!tab?.view) tabManager._ensureBrowserView(tab);
      return [tab.view.webContents, mainWindow];
    },
    selectTab(wc) {
      const tab = tabManager.tabs.find((t) => t.view?.webContents === wc);
      if (tab) tabManager.activateTab(tab.id);
    },
    removeTab(wc) {
      const tab = tabManager.tabs.find((t) => t.view?.webContents === wc);
      if (tab) tabManager.closeTab(tab.id);
    },
    async createWindow() {
      return mainWindow;
    },
    removeWindow() {},
    async requestPermissions() {
      return true;
    },
  });

  ElectronChromeExtensions.handleCRXProtocol(sess);
  tabManager._extensionsBridge = extensionsApi;
  tabManager._extensionsWindow = mainWindow;
  return extensionsApi;
}

async function installWebStore() {
  await installChromeWebStore({ session: getBrowserSession() });
}

async function loadStoredExtensions() {
  const store = readStore();
  const paths = store.extensionPaths || [];
  const sess = getBrowserSession();
  for (const extPath of paths) {
    try {
      await sess.loadExtension(extPath, { allowFileAccess: true });
    } catch (e) {
      console.error(`Failed to load extension at ${extPath}`, e);
    }
  }
  const ids = store.extensionStoreIds || [];
  for (const id of ids) {
    try {
      await installExtension(id, { session: sess, loadExtensionOptions: { allowFileAccess: true } });
    } catch (e) {
      console.error(`Failed to install store extension ${id}`, e);
    }
  }
}

async function installFromStore(extensionId) {
  const ext = await installExtension(extensionId, {
    session: getBrowserSession(),
    loadExtensionOptions: { allowFileAccess: true },
  });
  const store = readStore();
  store.extensionStoreIds = store.extensionStoreIds || [];
  if (!store.extensionStoreIds.includes(extensionId)) {
    store.extensionStoreIds.push(extensionId);
    writeStore(store);
  }
  return {
    id: ext.id,
    name: ext.name,
    version: ext.version,
    storeId: extensionId,
  };
}

function registerTab(tab) {
  if (!extensionsApi || !tab?.view?.webContents || tab.isIncognito || !mainWindowRef) return;
  try {
    extensionsApi.addTab(tab.view.webContents, mainWindowRef);
  } catch {
    /* ignore */
  }
}

function unregisterTab(tab) {
  if (!extensionsApi || !tab?.view?.webContents) return;
  try {
    extensionsApi.removeTab(tab.view.webContents);
  } catch {
    /* ignore */
  }
}

function selectTab(tab) {
  if (!extensionsApi || !tab?.view?.webContents) return;
  try {
    extensionsApi.selectTab(tab.view.webContents);
  } catch {
    /* ignore */
  }
}

function hookTabManager(tabManager, mainWindow) {
  mainWindowRef = mainWindow;
  const origEnsure = tabManager._ensureBrowserView.bind(tabManager);
  tabManager._ensureBrowserView = function ensure(tab) {
    const view = origEnsure(tab);
    if (tab.view && !tab.isIncognito) {
      registerTab(tab);
    }
    return view;
  };
  const origDestroy = tabManager._destroyBrowserView.bind(tabManager);
  tabManager._destroyBrowserView = function destroy(tab) {
    unregisterTab(tab);
    origDestroy(tab);
  };
  const origActivate = tabManager.activateTab.bind(tabManager);
  tabManager.activateTab = function activate(id) {
    origActivate(id);
    const tab = tabManager.tabs.find((t) => t.id === id);
    if (tab) selectTab(tab);
  };
}

module.exports = {
  initExtensionsBridge,
  installWebStore,
  loadStoredExtensions,
  installFromStore,
  getBrowserSession,
  hookTabManager,
};
