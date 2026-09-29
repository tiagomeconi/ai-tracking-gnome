import test from 'node:test';
import assert from 'node:assert/strict';

import { formatRemaining } from '../extension/lib/format.js';

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
