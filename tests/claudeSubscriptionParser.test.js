import test from 'node:test';
import assert from 'node:assert/strict';

import { parseClaudeUsage } from '../extension/lib/providers/claudeSubscriptionParser.js';

test('parseClaudeUsage extrai a janela de 5h com utilization', () => {
    const windows = parseClaudeUsage({
        five_hour: { utilization: 42, resets_at: '2026-01-01T05:00:00Z' },
    });
    assert.equal(windows.length, 1);
    assert.equal(windows[0].id, 'five_hour');
    assert.equal(windows[0].percent, 42);
    assert.equal(windows[0].estimated, false);
    assert.equal(windows[0].resetsAt, '2026-01-01T05:00:00.000Z');
});

test('parseClaudeUsage cai para used_percentage quando utilization ausente', () => {
    const windows = parseClaudeUsage({
        seven_day: { used_percentage: 73.5 },
    });
    assert.equal(windows[0].percent, 73.5);
});

test('parseClaudeUsage ignora janelas ausentes no payload', () => {
    const windows = parseClaudeUsage({ five_hour: { utilization: 10 } });
    assert.equal(windows.length, 1);
});

test('parseClaudeUsage ignora janela sem percentual numérico', () => {
    const windows = parseClaudeUsage({ five_hour: { resets_at: '2026-01-01T00:00:00Z' } });
    assert.equal(windows.length, 0);
});

test('parseClaudeUsage limita percent entre 0 e 100', () => {
    const windows = parseClaudeUsage({ five_hour: { utilization: 150 } });
    assert.equal(windows[0].percent, 100);
});

test('parseClaudeUsage extrai múltiplas janelas simultaneamente', () => {
    const windows = parseClaudeUsage({
        five_hour: { utilization: 20 },
        seven_day: { utilization: 40 },
        seven_day_opus: { utilization: 60 },
    });
    assert.equal(windows.length, 3);
    assert.deepEqual(windows.map((w) => w.id), ['five_hour', 'seven_day', 'seven_day_opus']);
});

test('parseClaudeUsage normaliza resets_at em epoch seconds', () => {
    const windows = parseClaudeUsage({ five_hour: { utilization: 5, resets_at: 1735689600 } });
    assert.equal(windows[0].resetsAt, new Date(1735689600 * 1000).toISOString());
});

test('parseClaudeUsage retorna lista vazia para payload vazio/inválido', () => {
    assert.deepEqual(parseClaudeUsage({}), []);
    assert.deepEqual(parseClaudeUsage(null), []);
});
