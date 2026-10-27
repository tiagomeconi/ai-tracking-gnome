import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { renderTrayIcon, encodePng } from '../src/main/trayIcon.js';
import { buildViewModel, indicatorText, thresholdNotificationText } from '../src/main/viewModel.js';
import { UsageService } from '../src/main/usageService.js';
import { UsageProvider } from '../src/shared/providers/provider.js';

function decodePng(buffer) {
    assert.deepEqual([...buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    let offset = 8;
    const idat = [];
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        if (type === 'IDAT')
            idat.push(buffer.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
    }
    const raw = zlib.inflateSync(Buffer.concat(idat));
    assert.equal(raw.length, (width * 4 + 1) * height);
    return { width, height, raw };
}

test('trayIcon: PNG válido 32x32, centro opaco e canto transparente', () => {
    const { width, height, raw } = decodePng(renderTrayIcon(85, 'high'));
    assert.equal(width, 32);
    assert.equal(height, 32);
    const pixel = (x, y) => raw.subarray(y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 1 + x * 4 + 4);
    assert.equal(pixel(0, 0)[3], 0);
    assert.equal(pixel(16, 2)[3], 255); // dentro do círculo, fora dos dígitos
});

test('trayIcon: aceita null, 100 e tamanhos diferentes sem lançar', () => {
    for (const [percent, state] of [[null, 'unknown'], [100, 'critical'], [0, 'normal'], [7, 'attention']])
        decodePng(renderTrayIcon(percent, state));
    assert.equal(decodePng(renderTrayIcon(50, 'normal', 16)).width, 16);
    assert.ok(encodePng(1, 1, Buffer.from([1, 2, 3, 255])).length > 20);
});

const NOW = new Date('2026-01-01T12:00:00Z');
const usage = (id, name, windows, status = 'ok') => ({ providerId: id, providerName: name, status, windows, fetchedAt: NOW.toISOString(), stale: false, manageUrl: `https://x/${id}` });

test('viewModel: escolhe o provider mais crítico e monta textos pt-BR', () => {
    const vm = buildViewModel([
        usage('claude', 'Claude', [{ id: '5h', label: '5 horas', percent: 40, unit: 'percentage', window: '5h', estimated: false, resetsAt: '2026-01-01T14:00:00Z' }]),
        usage('codex', 'Codex', [{ id: 'w', label: 'Semanal', percent: 91, unit: 'percentage', window: 'week', estimated: false }]),
    ], NOW);
    assert.deepEqual(vm.best, { providerName: 'Codex', percent: 91, state: 'high' });
    assert.equal(indicatorText(vm), 'Codex 91%');
    const w = vm.providers[0].windows[0];
    assert.equal(w.text, '5 horas — 40% · Normal');
    assert.equal(w.resetText, 'Renova em 2 h');
    assert.match(w.budgetText, /^Ritmo seguro: ~30 %\/h/);
});

test('viewModel: erro/auth e lista vazia; >4 janelas recolhe', () => {
    const vm = buildViewModel([usage('claude', 'Claude', [], 'auth_required')], NOW);
    assert.match(vm.providers[0].message, /Autenticação necessária/);
    assert.equal(vm.best, null);
    assert.equal(indicatorText(vm), '—');
    assert.equal(buildViewModel([], NOW).empty, true);

    const many = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, label: `M${i}`, percent: i, unit: 'percentage', window: 'custom', estimated: false }));
    assert.equal(buildViewModel([usage('gemini', 'Antigravity', many)], NOW).providers[0].collapsed, true);
});

test('thresholdNotificationText: mesma redação da extensão', () => {
    const { title, body } = thresholdNotificationText({ providerName: 'Claude (x)', windowLabel: '5 horas', percent: 82.4, state: 'attention', resetsAt: '2026-01-01T13:00:00Z' }, NOW);
    assert.equal(title, 'Claude — 5 horas');
    assert.equal(body, '82% usado · Atenção — renova em 1 h');
});

class FakeProvider extends UsageProvider {
    constructor(id, percent) { super(id, id); this.percent = percent; }
    async isConfigured() { return true; }
    async fetchUsage() { return usage(this.id, this.id, [{ id: 'w', label: 'W', percent: this.percent, unit: 'percentage', window: 'custom', estimated: false }]); }
}

function makeService(settings, providers) {
    const history = [];
    const service = new UsageService({
        providers,
        settings: { get: () => settings },
        historyStore: { appendUsages: (u) => history.push(u) },
        intervalMs: 3_600_000,
    });
    return { service, history };
}

test('usageService: refresh emite update, grava histórico e respeita providers desligados', async () => {
    const { service, history } = makeService(
        { disabledProviders: ['b'], notificationsEnabled: true, notificationThresholdPercent: 80 },
        [new FakeProvider('a', 50), new FakeProvider('b', 99)]
    );
    const updates = [];
    service.on('update', (vm) => updates.push(vm));
    await service.refresh();
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].providers.map((p) => p.id), ['a']);
    assert.equal(history.length, 1);
    assert.ok(service.allowedExternalUrls().has('https://x/a'));
    assert.ok(!service.allowedExternalUrls().has('https://x/b'));
});

test('usageService: notifica uma vez ao cruzar o limite e refresh concorrente é compartilhado', async () => {
    const provider = new FakeProvider('a', 50);
    const { service } = makeService({ disabledProviders: [], notificationsEnabled: true, notificationThresholdPercent: 80 }, [provider]);
    const events = [];
    service.on('threshold', (e) => events.push(e));

    await service.refresh();
    provider.percent = 85;
    const [first, second] = [service.refresh(), service.refresh()];
    assert.equal(first, second);
    await first;
    await service.refresh(); // continua acima: não repete
    assert.equal(events.length, 1);
    assert.equal(events[0].providerId, 'a');
});

test('usageService: notificações desligadas não emitem threshold', async () => {
    const { service } = makeService({ disabledProviders: [], notificationsEnabled: false, notificationThresholdPercent: 10 }, [new FakeProvider('a', 90)]);
    const events = [];
    service.on('threshold', (e) => events.push(e));
    await service.refresh();
    assert.equal(events.length, 0);
});
