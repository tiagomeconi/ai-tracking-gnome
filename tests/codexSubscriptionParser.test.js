import test from 'node:test';
import assert from 'node:assert/strict';

import { parseCodexRateLimits } from '../extension/lib/providers/codexSubscriptionParser.js';

test('parseCodexRateLimits extrai janela primary do bucket codex', () => {
    const windows = parseCodexRateLimits({
        rateLimitsByLimitId: {
            codex: {
                primary: { usedPercent: 55, windowDurationMins: 300, resetsAt: '2026-01-01T05:00:00Z' },
            },
        },
    });
    assert.equal(windows.length, 1);
    assert.equal(windows[0].percent, 55);
    assert.equal(windows[0].estimated, false);
    assert.match(windows[0].label, /5 hora/);
});

test('parseCodexRateLimits extrai primary e secondary do mesmo bucket', () => {
    const windows = parseCodexRateLimits({
        rateLimitsByLimitId: {
            codex: {
                primary: { usedPercent: 30, windowDurationMins: 300 },
                secondary: { usedPercent: 70, windowDurationMins: 10080 },
            },
        },
    });
    assert.equal(windows.length, 2);
});

test('parseCodexRateLimits usa rateLimits como fallback quando rateLimitsByLimitId ausente', () => {
    const windows = parseCodexRateLimits({
        rateLimits: { limitId: 'codex', primary: { usedPercent: 42 } },
    });
    assert.equal(windows.length, 1);
    assert.equal(windows[0].percent, 42);
});

test('parseCodexRateLimits qualifica o label quando há múltiplos buckets', () => {
    const windows = parseCodexRateLimits({
        rateLimitsByLimitId: {
            codex: { primary: { usedPercent: 10, windowDurationMins: 300 } },
            workspace: { limitName: 'Workspace', primary: { usedPercent: 20, windowDurationMins: 300 } },
        },
    });
    assert.equal(windows.length, 2);
    assert.ok(windows.some((w) => w.label.startsWith('Codex ·')));
    assert.ok(windows.some((w) => w.label.startsWith('Workspace ·')));
});

test('parseCodexRateLimits inclui individualLimit convertendo remainingPercent em used', () => {
    const windows = parseCodexRateLimits({
        rateLimitsByLimitId: {
            codex: { individualLimit: { remainingPercent: 30 } },
        },
    });
    assert.equal(windows.length, 1);
    assert.equal(windows[0].percent, 70);
});

test('parseCodexRateLimits ignora janelas sem usedPercent numérico', () => {
    const windows = parseCodexRateLimits({
        rateLimitsByLimitId: { codex: { primary: {} } },
    });
    assert.equal(windows.length, 0);
});

test('parseCodexRateLimits retorna lista vazia para resultado vazio/inválido', () => {
    assert.deepEqual(parseCodexRateLimits({}), []);
    assert.deepEqual(parseCodexRateLimits(null), []);
});
