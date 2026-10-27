// Processo principal do AI Usage Monitor (Electron): ícone de bandeja,
// popup com os cartões por provider, janela de preferências e
// notificações de limite. Toda lógica de domínio vive em usageService.js
// e em src/shared (compartilhada com a extensão GNOME).

import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, screen, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dataDir, configDir } from './paths.js';
import { SettingsStore } from './settings.js';
import { UsageHistoryStore } from './historyStore.js';
import { UsageService } from './usageService.js';
import { MockProvider } from '../shared/providers/mock.js';
import { ClaudeSubscriptionProvider } from './providers/claudeSubscription.js';
import { CodexSubscriptionProvider } from './providers/codexSubscription.js';
import { AntigravitySubscriptionProvider } from './providers/antigravitySubscription.js';
import { indicatorText, thresholdNotificationText } from './viewModel.js';
import { renderTrayIcon } from './trayIcon.js';
import { computePopupPosition } from './popupPosition.js';
import { aggregateDailyMax } from '../shared/historyChart.js';
import { listHistorySeries } from '../shared/history.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.join(here, '..', 'renderer');
const assetsDir = path.join(here, '..', '..', 'assets');
const preloadPath = path.join(here, '..', 'preload.cjs');

const POPUP_WIDTH = 380;
const POPUP_MIN_HEIGHT = 120;

// Mesma lista da aba "Provedores" da extensão GNOME (prefs.js).
const PROVIDER_CHOICES = [
    { id: 'claude', name: 'Claude' },
    { id: 'codex', name: 'Codex (ChatGPT)' },
    { id: 'gemini', name: 'Antigravity' },
    { id: 'copilot', name: 'Copilot', dev: true },
];

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock)
    app.quit();

const settings = new SettingsStore(configDir());
const history = new UsageHistoryStore(dataDir());
const service = new UsageService({
    providers: [
        new ClaudeSubscriptionProvider(),
        new CodexSubscriptionProvider(),
        new AntigravitySubscriptionProvider(),
        new MockProvider('copilot', 'Copilot (em desenvolvimento)', MockProvider.SCENARIOS.USAGE_20, 4000, 'https://github.com/settings/billing'),
    ],
    settings,
    historyStore: history,
});

let tray = null;
let popup = null;
let prefsWindow = null;
let popupHeight = POPUP_MIN_HEIGHT;
let lastViewModel = service.getViewModel();

function secureWebPreferences() {
    return { preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false };
}

function updateTray() {
    const vm = lastViewModel;
    const icon = nativeImage.createFromBuffer(renderTrayIcon(vm.best?.percent ?? null, vm.best?.state ?? 'unknown'), { scaleFactor: 2 });
    tray.setImage(icon);
    tray.setToolTip(`AI Usage Monitor — ${indicatorText(vm)}`);
}

function createPopup() {
    popup = new BrowserWindow({
        width: POPUP_WIDTH,
        height: popupHeight,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        fullscreenable: false,
        webPreferences: secureWebPreferences(),
    });
    popup.loadFile(path.join(rendererDir, 'popup.html'));
    popup.on('blur', () => popup.hide());
    popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    popup.webContents.on('will-navigate', (event) => event.preventDefault());
}

function positionPopup() {
    let anchor = tray.getBounds();
    // Linux: muitos ambientes devolvem 0x0 -> ancora no cursor.
    if (!anchor || (anchor.width === 0 && anchor.height === 0)) {
        const point = screen.getCursorScreenPoint();
        anchor = { x: point.x, y: point.y, width: 0, height: 0 };
    }
    const display = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
    const { x, y } = computePopupPosition(anchor, { width: POPUP_WIDTH, height: popupHeight }, display.workArea);
    popup.setBounds({ x, y, width: POPUP_WIDTH, height: popupHeight });
}

function togglePopup() {
    if (popup.isVisible()) {
        popup.hide();
        return;
    }
    positionPopup();
    popup.webContents.send('state', service.getViewModel());
    popup.show();
    popup.focus();
}

function openPreferences() {
    if (prefsWindow) {
        prefsWindow.focus();
        return;
    }
    prefsWindow = new BrowserWindow({
        width: 560,
        height: 620,
        title: 'AI Usage Monitor — Preferências',
        autoHideMenuBar: true,
        webPreferences: secureWebPreferences(),
    });
    prefsWindow.removeMenu();
    prefsWindow.loadFile(path.join(rendererDir, 'prefs.html'));
    prefsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    prefsWindow.on('closed', () => {
        prefsWindow = null;
    });
}

function buildContextMenu() {
    return Menu.buildFromTemplate([
        { label: 'Mostrar painel', click: () => togglePopup() },
        { label: 'Atualizar agora', click: () => service.refresh() },
        { label: 'Preferências…', click: () => openPreferences() },
        { type: 'separator' },
        { label: 'Sair', click: () => app.quit() },
    ]);
}

function applyLoginItem() {
    // O Electron só suporta iniciar com a sessão no Windows/macOS.
    if (process.platform !== 'linux')
        app.setLoginItemSettings({ openAtLogin: settings.get().launchAtLogin });
}

function registerIpc() {
    ipcMain.handle('state:get', () => service.getViewModel());
    ipcMain.handle('refresh', () => service.refresh().then(() => true));
    ipcMain.on('open-prefs', () => {
        popup.hide();
        openPreferences();
    });
    ipcMain.on('hide-popup', () => popup.hide());
    ipcMain.on('popup-height', (_event, height) => {
        if (!Number.isFinite(height))
            return;
        const workArea = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
        popupHeight = Math.round(Math.min(Math.max(height, POPUP_MIN_HEIGHT), workArea.height - 16));
        if (popup.isVisible())
            positionPopup();
        else
            popup.setSize(POPUP_WIDTH, popupHeight);
    });
    ipcMain.on('open-external', (_event, url) => {
        // Só abre URLs https que o próprio app listou como "gerenciar".
        if (typeof url === 'string' && url.startsWith('https://') && service.allowedExternalUrls().has(url))
            shell.openExternal(url);
    });

    ipcMain.handle('settings:get', () => ({
        settings: settings.get(),
        providers: PROVIDER_CHOICES,
        canLaunchAtLogin: process.platform !== 'linux',
    }));
    ipcMain.handle('settings:update', (_event, patch) => {
        const allowed = ['disabledProviders', 'notificationsEnabled', 'notificationThresholdPercent', 'launchAtLogin'];
        const safePatch = Object.fromEntries(Object.entries(patch ?? {}).filter(([key]) => allowed.includes(key)));
        const next = settings.update(safePatch);
        applyLoginItem();
        // Mudança de providers habilitados reflete já no popup/ícone.
        lastViewModel = service.getViewModel();
        updateTray();
        popup?.webContents.send('state', lastViewModel);
        service.refresh();
        return next;
    });

    ipcMain.handle('history:get', () => {
        const samples = history.read();
        const names = new Map(PROVIDER_CHOICES.map((p) => [p.id, p.name]));
        return listHistorySeries(samples).map((series) => ({
            ...series,
            providerName: names.get(series.providerId) ?? series.providerId,
            days: aggregateDailyMax(samples.filter((s) => s.providerId === series.providerId && s.windowId === series.windowId)),
        }));
    });
}

app.on('second-instance', () => togglePopup());

// App de bandeja: continua rodando sem janelas abertas.
app.on('window-all-closed', () => {});

app.whenReady().then(() => {
    if (!gotSingleInstanceLock)
        return;

    if (process.platform === 'darwin')
        app.dock?.hide();

    tray = new Tray(nativeImage.createFromBuffer(renderTrayIcon(null, 'unknown'), { scaleFactor: 2 }));
    tray.setToolTip('AI Usage Monitor');

    const menu = buildContextMenu();
    if (process.platform === 'linux') {
        // Muitos ambientes Linux (AppIndicator) só entregam o menu, não o evento de clique.
        tray.setContextMenu(menu);
    } else {
        tray.on('click', togglePopup);
        tray.on('right-click', () => tray.popUpContextMenu(menu));
    }

    createPopup();
    registerIpc();
    applyLoginItem();

    service.on('update', (vm) => {
        lastViewModel = vm;
        updateTray();
        popup.webContents.send('state', vm);
    });
    service.on('threshold', (event) => {
        if (!Notification.isSupported())
            return;
        const { title, body } = thresholdNotificationText(event);
        new Notification({ title, body, icon: path.join(assetsDir, 'icons', 'logo.png') }).show();
    });

    service.start();
});

app.on('before-quit', () => service.stop());
