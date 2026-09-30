import test from 'node:test';
import assert from 'node:assert/strict';

import { extractUsageFromLine, aggregateUsage } from '../extension/lib/providers/claudeCodeLocalAggregate.js';

function line(overrides = {}) {
    return JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T00:00:00.000Z',
        message: {
            usage: {
                input_tokens: 10,
                output_tokens: 20,
                cache_creation_input_tokens: 5,
                cache_read_input_tokens: 1,
            },
        },
        ...overrides,
    });
}

test('extractUsageFromLine ignora JSON malformado', () => {
    assert.equal(extractUsageFromLine('{not valid json'), null);
});

test('extractUsageFromLine ignora linhas que não são type=assistant', () => {
    assert.equal(extractUsageFromLine(JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00Z' })), null);
});

test('extractUsageFromLine ignora assistant sem message.usage', () => {
    assert.equal(extractUsageFromLine(JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T00:00:00Z', message: {} })), null);
});

test('extractUsageFromLine extrai os quatro campos de tokens', () => {
    const result = extractUsageFromLine(line());
    assert.deepEqual(result, {
        timestamp: '2026-01-01T00:00:00.000Z',
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationTokens: 5,
        cacheReadTokens: 1,
    });
});

test('extractUsageFromLine trata campos de tokens ausentes como 0', () => {
    const result = extractUsageFromLine(JSON.stringify({
        type: 'assistant',
        timestamp: '2026-01-01T00:00:00Z',
        message: { usage: { input_tokens: 5 } },
    }));
    assert.equal(result.outputTokens, 0);
    assert.equal(result.cacheCreationTokens, 0);
});

const now = new Date('2026-01-01T05:00:00Z');
const WINDOW_5H = 5 * 60 * 60 * 1000;

test('aggregateUsage soma apenas entradas dentro da janela', () => {
    const lines = [
        line({ timestamp: '2026-01-01T04:30:00Z' }), // dentro da janela (30min atrás)
        line({ timestamp: '2025-12-31T20:00:00Z' }), // fora da janela (9h atrás)
    ];
    const result = aggregateUsage(lines, WINDOW_5H, now);
    assert.equal(result.totalTokens, 36); // só a primeira linha: 10+20+5+1
    assert.equal(result.messageCount, 1);
});

test('aggregateUsage ignora linhas inválidas silenciosamente', () => {
    const lines = ['not json', JSON.stringify({ type: 'user' }), line({ timestamp: '2026-01-01T04:59:00Z' })];
    const result = aggregateUsage(lines, WINDOW_5H, now);
    assert.equal(result.messageCount, 1);
});

test('aggregateUsage retorna zero para lista vazia', () => {
    const result = aggregateUsage([], WINDOW_5H, now);
    assert.equal(result.totalTokens, 0);
    assert.equal(result.messageCount, 0);
    assert.equal(result.latestTimestamp, null);
});

test('aggregateUsage rastreia o timestamp mais recente dentro da janela', () => {
    const lines = [
        line({ timestamp: '2026-01-01T04:00:00Z' }),
        line({ timestamp: '2026-01-01T04:45:00Z' }),
        line({ timestamp: '2026-01-01T04:10:00Z' }),
    ];
    const result = aggregateUsage(lines, WINDOW_5H, now);
    assert.equal(result.latestTimestamp, '2026-01-01T04:45:00Z');
});
