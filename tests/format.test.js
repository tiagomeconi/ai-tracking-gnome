import test from 'node:test';
import assert from 'node:assert/strict';

import { formatRemaining, formatElapsed, mostRecentFetchedAt } from '../extension/lib/format.js';

const now = new Date('2026-01-01T00:00:00Z');

test('formatRemaining retorna null sem resetsAt', () => {
    assert.equal(formatRemaining(undefined, now), null);
});

test('formatRemaining retorna null para datas no passado', () => {
    assert.equal(formatRemaining('2025-12-31T00:00:00Z', now), null);
});

test('formatRemaining formata minutos', () => {
    assert.equal(formatRemaining('2026-01-01T00:47:00Z', now), '47 min');
});

test('formatRemaining formata horas e minutos', () => {
    assert.equal(formatRemaining('2026-01-01T01:32:00Z', now), '1 h 32 min');
});

test('formatRemaining formata horas exatas sem minutos', () => {
    assert.equal(formatRemaining('2026-01-01T02:00:00Z', now), '2 h');
});

test('formatRemaining formata dias', () => {
    assert.equal(formatRemaining('2026-01-13T00:00:00Z', now), '12 dias');
});

test('formatRemaining formata 1 dia no singular', () => {
    assert.equal(formatRemaining('2026-01-02T00:00:00Z', now), '1 dia');
});

test('formatElapsed retorna "nunca atualizado" sem fetchedAt', () => {
    assert.equal(formatElapsed(undefined, now), 'nunca atualizado');
});

test('formatElapsed retorna "agora mesmo" para menos de 1 minuto', () => {
    assert.equal(formatElapsed('2026-01-01T00:00:30Z', now), 'agora mesmo');
});

test('formatElapsed formata minutos', () => {
    assert.equal(formatElapsed('2025-12-31T23:55:00Z', now), 'há 5 min');
});

test('formatElapsed formata horas', () => {
    assert.equal(formatElapsed('2025-12-31T22:00:00Z', now), 'há 2 h');
});

test('formatElapsed formata dias', () => {
    assert.equal(formatElapsed('2025-12-30T00:00:00Z', now), 'há 2 dias');
});

test('mostRecentFetchedAt retorna null para lista vazia', () => {
    assert.equal(mostRecentFetchedAt([]), null);
});

test('mostRecentFetchedAt ignora datas inválidas', () => {
    const result = mostRecentFetchedAt([
        { fetchedAt: 'not-a-date' },
        { fetchedAt: '2026-01-01T00:00:00Z' },
    ]);
    assert.equal(result, '2026-01-01T00:00:00.000Z');
});

test('mostRecentFetchedAt escolhe o timestamp mais recente', () => {
    const result = mostRecentFetchedAt([
        { fetchedAt: '2026-01-01T00:00:00Z' },
        { fetchedAt: '2026-01-02T00:00:00Z' },
        { fetchedAt: '2026-01-01T12:00:00Z' },
    ]);
    assert.equal(result, '2026-01-02T00:00:00.000Z');
});
