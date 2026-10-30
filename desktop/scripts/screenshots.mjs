// Gera os screenshots do README com o app Electron REAL (mesmos HTML/CSS/JS
// dos renderers) alimentado por dados simulados — nada de rede nem de
// credenciais. Uso: `npm run screenshots` (precisa de um display; em Linux
// sem o chrome-sandbox configurado, adicione --no-sandbox).
// Saída: ../docs/screenshots/desktop-*.png

import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildViewModel } from '../src/main/viewModel.js';
import { renderGaugeIcon, renderTrayIcon } from '../src/main/trayIcon.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const outDir = path.join(root, '..', 'docs', 'screenshots');
const rendererDir = path.join(root, 'src', 'renderer');
const preload = path.join(root, 'src', 'preload.cjs');
const SCALE = 2;

const now = new Date();
const inMinutes = (m) => new Date(now.getTime() + m * 60_000).toISOString();
const win = (id, label, percent, minutes, window = 'custom') => ({ id, label, percent, unit: 'percentage', window, estimated: false, resetsAt: inMinutes(minutes) });
const usage = (providerId, providerName, windows, status = 'ok') => ({ providerId, providerName, status, windows, fetchedAt: now.toISOString(), stale: false, manageUrl: `https://example.com/${providerId}` });

const usages = [
    usage('claude', 'Claude', [win('5h', 'Janela de 5 horas', 62, 135, '5h'), win('7d', 'Janela de 7 dias', 87, 60 * 24 * 3 + 120, 'week')]),
    usage('codex', 'Codex (ChatGPT)', [win('5h', 'Janela de 5 hora(s)', 18, 250, '5h'), win('w', 'Janela de 1 semana(s)', 34, 60 * 24 * 5, 'week')]),
    usage('gemini', 'Antigravity', Array.from({ length: 6 }, (_, i) => win(`m${i}`, ['Gemini 3 Pro', 'Gemini 3 Flash', 'Claude Sonnet', 'Claude Opus', 'GPT-OSS 120B', 'Gemini 2.5'][i], [12, 5, 41, 8, 0, 23][i], 300))),
    usage('copilot', 'Copilot (em desenvolvimento)', [win('u', 'Uso', 20, 360)]),
];
const widgetWindows = { claude: '5h' };

function mockHistory() {
    const days = (base) => Array.from({ length: 21 }, (_, i) => {
        const d = new Date(now.getTime() - (20 - i) * 86_400_000);
        return { date: d.toISOString().slice(0, 10), percent: Math.max(4, Math.min(99, Math.round(base + 28 * Math.sin(i / 2.3) + (i % 5) * 4))) };
    });
    return [
        { providerId: 'claude', windowId: '7d', windowLabel: 'Janela de 7 dias', providerName: 'Claude', days: days(55) },
        { providerId: 'codex', windowId: 'w', windowLabel: 'Janela de 1 semana(s)', providerName: 'Codex (ChatGPT)', days: days(35) },
    ];
}

const settings = {
    disabledProviders: [], notificationsEnabled: true, notificationThresholdPercent: 80, launchAtLogin: false,
    trayProvider: 'auto', trayStyle: 'gauge', widgetEnabled: true, widgetOpacity: 90, widgetPosition: null, widgetWindows,
};
const providers = [{ id: 'claude', name: 'Claude' }, { id: 'codex', name: 'Codex (ChatGPT)' }, { id: 'gemini', name: 'Antigravity' }, { id: 'copilot', name: 'Copilot', dev: true }];

const vm = buildViewModel(usages, now, widgetWindows);
ipcMain.handle('state:get', () => vm);
ipcMain.handle('refresh', () => true);
ipcMain.handle('settings:get', () => ({
    settings, providers, canLaunchAtLogin: true,
    windows: Object.fromEntries(vm.providers.map((p) => [p.id, p.windows.map((w) => ({ id: w.id, label: w.label }))])),
}));
ipcMain.handle('settings:update', () => settings);
ipcMain.handle('history:get', () => mockHistory());
for (const channel of ['popup-height', 'widget-height', 'hide-popup', 'open-prefs', 'drag-start', 'drag-move', 'drag-end'])
    ipcMain.on(channel, () => {});

// "Papel de parede" atrás do widget (que é translúcido no app de verdade).
const wallpaper = (gradient) => `(() => {
    document.documentElement.style.setProperty('background', ${JSON.stringify(gradient)}, 'important');
    document.body.style.setProperty('background', 'transparent', 'important');
    document.body.style.setProperty('padding', '14px 20px 0', 'important');
})()`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Destruir a janela anterior logo antes de carregar a próxima faz o loadFile
// falhar às vezes (ERR_FAILED -2): espera e tenta de novo.
async function loadWithRetry(w, file) {
    for (let attempt = 1; ; attempt++) {
        try {
            await w.loadFile(file);
            return;
        } catch (error) {
            if (attempt >= 4)
                throw error;
            await sleep(300);
        }
    }
}

async function closeWindow(w) {
    w.destroy();
    await sleep(500);
}

async function shot(file, { page, width, height = 400, css = '', js = '', fit = 'body', pad = 0, scale = SCALE, fixedHeight = 0, scrollTo = '' }) {
    const w = new BrowserWindow({
        width: Math.round(width * scale), height: Math.round(height * scale), show: true, frame: false, useContentSize: true,
        webPreferences: { preload, contextIsolation: true, sandbox: true, zoomFactor: scale },
    });
    await loadWithRetry(w, path.join(rendererDir, page));
    w.webContents.setZoomFactor(scale);
    await w.webContents.insertCSS(`html,body{background:transparent} ${css}`);
    if (js)
        await w.webContents.executeJavaScript(js);
    await sleep(400);
    const h = fixedHeight || await w.webContents.executeJavaScript(`Math.ceil(document.querySelector(${JSON.stringify(fit)}).getBoundingClientRect().bottom) + ${pad}`);
    w.setContentSize(Math.round(width * scale), Math.round(h * scale));
    if (scrollTo)
        await w.webContents.executeJavaScript(`window.scrollTo(0, document.querySelector(${JSON.stringify(scrollTo)}).getBoundingClientRect().top + window.scrollY - 12)`);
    await sleep(400);
    const image = await w.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, file), image.toPNG());
    await closeWindow(w);
    console.log('✓', file);
}

async function trayGallery() {
    const uri = (png) => `data:image/png;base64,${png.toString('base64')}`;
    const items = [[12, 'normal', 'Normal'], [58, 'normal', 'Normal'], [78, 'attention', 'Atenção'], [91, 'high', 'Alto'], [98, 'critical', 'Crítico']];
    const cell = (png, label) => `<figure><img src="${uri(png)}" width="64" height="64"><figcaption>${label}</figcaption></figure>`;
    const html = `<!doctype html><meta charset="utf-8"><style>
        body{margin:0;font:13px system-ui,sans-serif;background:#1f1f24;color:#eee;padding:18px 22px}
        .row{display:flex;gap:26px;margin:6px 0 14px;align-items:flex-end} figure{margin:0;text-align:center}
        figcaption{margin-top:6px;color:#aaa;font-size:11px} h4{margin:4px 0;color:#c9b6ff;font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase}
    </style><h4>Velocímetro</h4><div class="row">${items.map(([p, s, l]) => cell(renderGaugeIcon(p, s, 128), `${p}% · ${l}`)).join('')}</div>
    <h4>Círculo com número</h4><div class="row">${items.map(([p, s, l]) => cell(renderTrayIcon(p, s, 64), `${p}% · ${l}`)).join('')}</div>`;
    const w = new BrowserWindow({ width: 560 * SCALE, height: 300 * SCALE, show: true, frame: false, useContentSize: true, webPreferences: { zoomFactor: SCALE } });
    await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    w.webContents.setZoomFactor(SCALE);
    await sleep(500);
    const h = await w.webContents.executeJavaScript('document.body.scrollHeight');
    w.setContentSize(560 * SCALE, h * SCALE);
    await sleep(300);
    fs.writeFileSync(path.join(outDir, 'desktop-tray-icons.png'), (await w.webContents.capturePage()).toPNG());
    await closeWindow(w);
    console.log('✓ desktop-tray-icons.png');
}

// Sem isto o Electron encerra ao fechar a primeira janela, no meio da série.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    const frame = 'html{border-radius:12px;overflow:hidden} body{border:1px solid var(--border)}';

    nativeTheme.themeSource = 'dark';
    await shot('desktop-popup-dark.png', { page: 'popup.html', width: 380, css: frame, fit: 'footer', scale: 1.5 });
    await shot('desktop-widget-dark.png', {
        page: 'widget.html', width: 260, fit: '#widget', pad: 14,
        js: wallpaper('linear-gradient(135deg,#3b2a6b,#1c1633 60%,#10243f)'),
    });
    const noScrollbar = '::-webkit-scrollbar{display:none}';
    await shot('desktop-prefs.png', { page: 'prefs.html', width: 560, fixedHeight: 600, scale: 1.6, css: noScrollbar });
    await shot('desktop-prefs-widget.png', { page: 'prefs.html', width: 560, fixedHeight: 560, scale: 1.6, css: noScrollbar, scrollTo: '#widget-enabled' });
    await shot('desktop-stats.png', {
        page: 'prefs.html', width: 560, fit: '#stats', pad: 24,
        js: `document.getElementById('tab-stats').click()`,
    });

    nativeTheme.themeSource = 'light';
    await shot('desktop-popup-light.png', { page: 'popup.html', width: 380, css: frame, fit: 'footer', scale: 1.5 });
    await shot('desktop-widget-light.png', {
        page: 'widget.html', width: 260, fit: '#widget', pad: 14,
        js: wallpaper('linear-gradient(135deg,#c7d7ff,#e9dcff 60%,#d3f0ff)'),
    });
    nativeTheme.themeSource = 'dark';
    await trayGallery();
    app.quit();
});
