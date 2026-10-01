import test from 'node:test';
import assert from 'node:assert/strict';

import { computeThresholdEvents, DEFAULT_THRESHOLD_PERCENT } from '../extension/lib/thresholdNotifier.js';

function usage(providerId, providerName, windows) {
    return { providerId, providerName, status: 'ok', windows };
}

test('DEFAULT_THRESHOLD_PERCENT é 80', () => {
    assert.equal(DEFAULT_THRESHOLD_PERCENT, 80);
});

test('computeThresholdEvents emite evento ao cruzar o limite padrão pela primeira vez', () => {
    const usages = [usage('claude', 'Claude', [{ id: 'five_hour', label: 'Janela de 5 horas', percent: 85 }])];
    const { events, nextAboveThreshold } = computeThresholdEvents(usages, {});
    assert.equal(events.length, 1);
    assert.equal(events[0].percent, 85);
    assert.equal(events[0].state, 'high');
    assert.equal(nextAboveThreshold['claude::five_hour'], true);
});

test('computeThresholdEvents não repete notificação enquanto continuar acima do limite', () => {
    const usages = [usage('claude', 'Claude', [{ id: 'five_hour', label: 'Janela de 5 horas', percent: 90 }])];
    const { events, nextAboveThreshold } = computeThresholdEvents(usages, { 'claude::five_hour': true });
    assert.equal(events.length, 0);
    assert.equal(nextAboveThreshold['claude::five_hour'], true);
});

test('computeThresholdEvents respeita um limite customizado', () => {
    const usages = [usage('claude', 'Claude', [{ id: 'five_hour', label: 'Janela de 5 horas', percent: 62 }])];
    assert.equal(computeThresholdEvents(usages, {}, 70).events.length, 0);
    assert.equal(computeThresholdEvents(usages, {}, 50).events.length, 1);
});

test('computeThresholdEvents não notifica ao cair abaixo do limite (reset da janela)', () => {
    const usages = [usage('claude', 'Claude', [{ id: 'five_hour', label: 'Janela de 5 horas', percent: 5 }])];
    const { events, nextAboveThreshold } = computeThresholdEvents(usages, { 'claude::five_hour': true });
    assert.equal(events.length, 0);
    assert.equal(nextAboveThreshold['claude::five_hour'], false);
});

test('computeThresholdEvents permite notificar de novo depois de um reset', () => {
    let state = computeThresholdEvents(
        [usage('claude', 'Claude', [{ id: 'five_hour', label: 'Janela de 5 horas', percent: 90 }])],
        {}
    );
    assert.equal(state.events.length, 1);

    // reset da janela
    state = computeThresholdEvents(
        [usage('claude', 'Claude', [{ id: 'five_hour', label: 'Janela de 5 horas', percent: 2 }])],
        state.nextAboveThreshold
    );
    assert.equal(state.events.length, 0);

    // sobe de novo
    state = computeThresholdEvents(
        [usage('claude', 'Claude', [{ id: 'five_hour', label: 'Janela de 5 horas', percent: 82 }])],
        state.nextAboveThreshold
    );
    assert.equal(state.events.length, 1);
});

test('computeThresholdEvents ignora providers com status diferente de ok, preservando o estado anterior', () => {
    const usages = [{ providerId: 'claude', providerName: 'Claude', status: 'error', windows: [] }];
    const { events, nextAboveThreshold } = computeThresholdEvents(usages, { 'claude::five_hour': true });
    assert.equal(events.length, 0);
    assert.equal(nextAboveThreshold['claude::five_hour'], true);
});

test('computeThresholdEvents ignora janelas sem percent numérico', () => {
    const usages = [usage('claude', 'Claude', [{ id: 'w', label: 'W' }])];
    const { events } = computeThresholdEvents(usages, {});
    assert.equal(events.length, 0);
});

test('computeThresholdEvents trata várias janelas/providers independentemente', () => {
    const usages = [
        usage('claude', 'Claude', [
            { id: 'five_hour', label: 'Janela de 5 horas', percent: 82 },
            { id: 'seven_day', label: 'Janela de 7 dias', percent: 10 },
        ]),
        usage('codex', 'Codex', [{ id: 'primary', label: 'Janela de 5 hora(s)', percent: 96 }]),
    ];
    const { events } = computeThresholdEvents(usages, {});
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((e) => `${e.providerId}::${e.windowId}`).sort(), ['claude::five_hour', 'codex::primary']);
});
