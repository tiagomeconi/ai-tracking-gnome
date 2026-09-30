import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateThreadTokens } from '../extension/lib/providers/codexLocalAggregate.js';

const now = new Date('2026-01-01T05:00:00Z');
const WINDOW_5H = 5 * 60 * 60 * 1000;

test('aggregateThreadTokens soma apenas threads atualizadas dentro da janela', () => {
    const rows = [
        { tokens_used: 100, updated_at_ms: Date.parse('2026-01-01T04:30:00Z') }, // dentro
        { tokens_used: 500, updated_at_ms: Date.parse('2025-12-31T20:00:00Z') }, // fora (9h atrás)
    ];
    const result = aggregateThreadTokens(rows, WINDOW_5H, now);
    assert.equal(result.totalTokens, 100);
    assert.equal(result.threadCount, 1);
});

test('aggregateThreadTokens ignora linhas sem tokens_used numérico', () => {
    const rows = [{ updated_at_ms: Date.parse('2026-01-01T04:30:00Z') }];
    const result = aggregateThreadTokens(rows, WINDOW_5H, now);
    assert.equal(result.totalTokens, 0);
    assert.equal(result.threadCount, 0);
});

test('aggregateThreadTokens ignora linhas sem updated_at_ms numérico', () => {
    const rows = [{ tokens_used: 100 }];
    const result = aggregateThreadTokens(rows, WINDOW_5H, now);
    assert.equal(result.threadCount, 0);
});

test('aggregateThreadTokens lida com lista vazia/undefined', () => {
    assert.deepEqual(aggregateThreadTokens([], WINDOW_5H, now), { totalTokens: 0, threadCount: 0 });
    assert.deepEqual(aggregateThreadTokens(undefined, WINDOW_5H, now), { totalTokens: 0, threadCount: 0 });
});

test('aggregateThreadTokens soma múltiplas threads recentes', () => {
    const rows = [
        { tokens_used: 100, updated_at_ms: Date.parse('2026-01-01T04:00:00Z') },
        { tokens_used: 250, updated_at_ms: Date.parse('2026-01-01T04:50:00Z') },
    ];
    const result = aggregateThreadTokens(rows, WINDOW_5H, now);
    assert.equal(result.totalTokens, 350);
    assert.equal(result.threadCount, 2);
});
