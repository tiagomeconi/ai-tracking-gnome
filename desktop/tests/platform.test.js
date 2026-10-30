import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { dataDir, configDir, claudeConfigDir } from '../src/main/paths.js';
import { SettingsStore, sanitizeSettings } from '../src/main/settings.js';
import { UsageHistoryStore } from '../src/main/historyStore.js';
import { readKeyringSecret, decodeWindowsBlob } from '../src/main/credentials.js';
import { isWaylandSession, shouldRelaunchForX11 } from '../src/main/displayServer.js';
import { computePopupPosition, resolveWidgetPosition, cornerAnchor } from '../src/main/popupPosition.js';

test('paths: Windows usa LOCALAPPDATA/APPDATA', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local', APPDATA: 'C:\\Users\\a\\AppData\\Roaming' };
    assert.equal(dataDir(env, 'win32', 'C:\\Users\\a'), 'C:\\Users\\a\\AppData\\Local\\ai-usage-monitor');
    assert.equal(configDir(env, 'win32', 'C:\\Users\\a'), 'C:\\Users\\a\\AppData\\Roaming\\ai-usage-monitor');
});

test('paths: Linux segue XDG e cai em ~/.cache e ~/.config', () => {
    assert.equal(dataDir({ XDG_CACHE_HOME: '/x/cache' }, 'linux', '/home/a'), '/x/cache/ai-usage-monitor');
    assert.equal(dataDir({}, 'linux', '/home/a'), '/home/a/.cache/ai-usage-monitor');
    assert.equal(configDir({}, 'linux', '/home/a'), '/home/a/.config/ai-usage-monitor');
});

test('paths: CLAUDE_CONFIG_DIR tem prioridade sobre ~/.claude', () => {
    assert.equal(claudeConfigDir({ CLAUDE_CONFIG_DIR: '/custom' }, '/home/a'), '/custom');
    assert.equal(claudeConfigDir({}, '/home/a'), path.join('/home/a', '.claude'));
});

test('settings: valores inválidos caem no padrão e limite é limitado a 1..100', () => {
    const s = sanitizeSettings({ disabledProviders: ['claude', 5], notificationsEnabled: 'sim', notificationThresholdPercent: 500, launchAtLogin: 1 });
    assert.deepEqual(s.disabledProviders, ['claude']);
    assert.equal(s.notificationsEnabled, true);
    assert.equal(s.notificationThresholdPercent, 100);
    assert.equal(s.launchAtLogin, false);
    assert.equal(sanitizeSettings(null).notificationThresholdPercent, 80);
});

test('settings: persiste e recarrega do disco', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aum-settings-'));
    const store = new SettingsStore(dir);
    store.update({ disabledProviders: ['codex'], notificationThresholdPercent: 60 });
    const reloaded = new SettingsStore(dir).get();
    assert.deepEqual(reloaded.disabledProviders, ['codex']);
    assert.equal(reloaded.notificationThresholdPercent, 60);
});

test('settings: arquivo corrompido não quebra', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aum-settings-'));
    fs.writeFileSync(path.join(dir, 'settings.json'), '{lixo');
    assert.equal(new SettingsStore(dir).get().notificationsEnabled, true);
});

test('history store: grava amostras de providers ok e relê', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aum-history-'));
    const store = new UsageHistoryStore(path.join(dir, 'sub'));
    assert.deepEqual(store.read(), []);
    store.appendUsages([
        { providerId: 'claude', status: 'ok', windows: [{ id: '5h', label: '5 horas', percent: 40 }] },
        { providerId: 'codex', status: 'error', windows: [] },
    ]);
    const samples = store.read();
    assert.equal(samples.length, 1);
    assert.equal(samples[0].providerId, 'claude');
});

test('credentials: Linux chama secret-tool lookup com atributos exatos', async () => {
    const calls = [];
    const secret = await readKeyringSecret({ service: 'gemini', username: 'antigravity' }, {
        platform: 'linux',
        run: async (cmd, args) => { calls.push([cmd, args]); return '{"token":1}\n'; },
    });
    assert.equal(secret, '{"token":1}');
    assert.deepEqual(calls, [['secret-tool', ['lookup', 'service', 'gemini', 'username', 'antigravity']]]);
});

test('credentials: erro/ausência vira null sem vazar mensagem', async () => {
    const secret = await readKeyringSecret({ service: 'gemini', username: 'antigravity' }, {
        platform: 'linux',
        run: async () => { throw new Error('segredo-vazado'); },
    });
    assert.equal(secret, null);
});

test('credentials: Windows decodifica o base64 do CredRead (UTF-8 e UTF-16LE)', async () => {
    const json = '{"token":{"access_token":"abc"}}';
    for (const encoding of ['utf8', 'utf16le']) {
        const b64 = Buffer.from(json, encoding).toString('base64');
        const secret = await readKeyringSecret({ service: 'gemini', username: 'antigravity' }, {
            platform: 'win32',
            run: async (cmd, args) => {
                assert.equal(cmd, 'powershell.exe');
                assert.ok(args.includes('-EncodedCommand'));
                return `${b64}\r\n`;
            },
        });
        assert.equal(secret, json, encoding);
    }
    assert.equal(decodeWindowsBlob(Buffer.alloc(0)), null);
});

test('credentials: rejeita service/username com caracteres perigosos', async () => {
    await assert.rejects(readKeyringSecret({ service: "x'; calc", username: 'a' }, { platform: 'win32', run: async () => '' }));
});

test('popup: acima do ícone quando a bandeja está embaixo (Windows) e dentro da área útil', () => {
    const work = { x: 0, y: 0, width: 1920, height: 1040 };
    const pos = computePopupPosition({ x: 1800, y: 1045, width: 24, height: 24 }, { width: 380, height: 400 }, work);
    // Ícone na barra de tarefas (fora do workArea): popup encosta no fim da área útil, acima da barra.
    assert.equal(pos.y, 1040 - 400 - 8);
    assert.ok(pos.x + 380 <= 1920);
});

test('popup: abaixo do ícone quando a barra está no topo; clamp nas bordas', () => {
    const work = { x: 0, y: 30, width: 1920, height: 1050 };
    const pos = computePopupPosition({ x: 0, y: 0, width: 24, height: 24 }, { width: 380, height: 400 }, work);
    assert.equal(pos.y, 38); // 24 + 8 = 32 < início da área útil + margem (30 + 8)
    assert.equal(pos.x, 8);
});

test('settings: trayProvider/trayStyle têm padrão e rejeitam valores inválidos', () => {
    assert.equal(sanitizeSettings({}).trayProvider, 'auto');
    assert.equal(sanitizeSettings({}).trayStyle, 'number');
    assert.equal(sanitizeSettings({ trayStyle: 'x', trayProvider: 5 }).trayStyle, 'number');
    assert.equal(sanitizeSettings({ trayStyle: 'gauge', trayProvider: 'claude' }).trayStyle, 'gauge');
    assert.equal(sanitizeSettings({ trayStyle: 'gauge', trayProvider: 'claude' }).trayProvider, 'claude');
});

test('settings: widget desligado por padrão, opacidade 40..100 e posição validada', () => {
    const d = sanitizeSettings({});
    assert.deepEqual([d.widgetEnabled, d.widgetOpacity, d.widgetPosition], [false, 90, null]);
    assert.equal(sanitizeSettings({ widgetOpacity: 5 }).widgetOpacity, 40);
    assert.equal(sanitizeSettings({ widgetOpacity: 500 }).widgetOpacity, 100);
    assert.deepEqual(sanitizeSettings({ widgetPosition: { x: 10.4, y: 20 } }).widgetPosition, { x: 10, y: 20 });
    assert.equal(sanitizeSettings({ widgetPosition: { x: 'a', y: 1 } }).widgetPosition, null);
});

test('resolveWidgetPosition: usa a salva se visível; senão canto inferior direito', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 };
    const size = { width: 210, height: 100 };
    assert.deepEqual(resolveWidgetPosition({ x: 300, y: 200 }, size, [area], area), { x: 300, y: 200 });
    assert.deepEqual(resolveWidgetPosition({ x: 5000, y: 200 }, size, [area], area), { x: 1694, y: 924 });
    assert.deepEqual(resolveWidgetPosition(null, size, [area], area), { x: 1694, y: 924 });
});

test('cornerAnchor: popup sem posição da bandeja abre acima, colado no canto direito', () => {
    const area = { x: 0, y: 0, width: 1920, height: 1040 };
    const anchor = cornerAnchor(area);
    assert.deepEqual(anchor, { x: 1920, y: 1040, width: 0, height: 0 });
    assert.deepEqual(computePopupPosition(anchor, { width: 380, height: 300 }, area), { x: 1532, y: 732 });
});

test('displayServer: relança em XWayland só em sessão Wayland que ainda não está em x11', () => {
    const wayland = { XDG_SESSION_TYPE: 'wayland' };
    assert.equal(shouldRelaunchForX11('linux', wayland, 'wayland'), true);
    assert.equal(shouldRelaunchForX11('linux', wayland, ''), true);
    assert.equal(shouldRelaunchForX11('linux', wayland, 'x11'), false); // já relançado: sem loop
    assert.equal(shouldRelaunchForX11('linux', { WAYLAND_DISPLAY: 'wayland-0' }, 'wayland'), true);
    assert.equal(shouldRelaunchForX11('linux', { XDG_SESSION_TYPE: 'x11' }, 'x11'), false);
    assert.equal(shouldRelaunchForX11('linux', { ...wayland, AI_USAGE_NATIVE_WAYLAND: '1' }, 'wayland'), false);
    assert.equal(shouldRelaunchForX11('win32', wayland, 'wayland'), false);
    assert.equal(isWaylandSession('linux', {}), false);
});
