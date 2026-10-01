import test from 'node:test';
import assert from 'node:assert/strict';

import {
    clampPercent,
    computePercent,
    computeRemaining,
    visualStateFromPercent,
    isStale,
    selectMostCritical,
    computeBudgetProjection,
} from '../extension/lib/normalizer.js';

test('clampPercent limita entre 0 e 100', () => {
    assert.equal(clampPercent(-10), 0);
    assert.equal(clampPercent(150), 100);
    assert.equal(clampPercent(42), 42);
    assert.equal(clampPercent(undefined), undefined);
    assert.equal(clampPercent(NaN), undefined);
});

test('computePercent usa percent explícito quando presente', () => {
    assert.equal(computePercent({ percent: 55 }), 55);
});

test('computePercent calcula a partir de used/limit', () => {
    assert.equal(computePercent({ used: 50, limit: 200 }), 25);
});

test('computePercent não fabrica limit ausente', () => {
    assert.equal(computePercent({ used: 50 }), undefined);
    assert.equal(computePercent({ used: 50, limit: 0 }), undefined);
});

test('computeRemaining calcula a partir de used/limit', () => {
    assert.equal(computeRemaining({ used: 30, limit: 100 }), 70);
});

test('computeRemaining não fica negativo', () => {
    assert.equal(computeRemaining({ used: 120, limit: 100 }), 0);
});

test('visualStateFromPercent segue os thresholds de referência', () => {
    assert.equal(visualStateFromPercent(10), 'normal');
    assert.equal(visualStateFromPercent(69), 'normal');
    assert.equal(visualStateFromPercent(70), 'attention');
    assert.equal(visualStateFromPercent(84), 'attention');
    assert.equal(visualStateFromPercent(85), 'high');
    assert.equal(visualStateFromPercent(94), 'high');
    assert.equal(visualStateFromPercent(95), 'critical');
    assert.equal(visualStateFromPercent(100), 'critical');
    assert.equal(visualStateFromPercent(undefined), 'unknown');
});

test('isStale compara contra um "now" injetado', () => {
    const fetchedAt = new Date('2026-01-01T00:00:00Z').toISOString();
    const tenMinLater = new Date('2026-01-01T00:10:00Z').getTime();
    assert.equal(isStale(fetchedAt, 5 * 60_000, tenMinLater), true);
    assert.equal(isStale(fetchedAt, 15 * 60_000, tenMinLater), false);
});

test('isStale trata data inválida como stale', () => {
    assert.equal(isStale('not-a-date', 1000), true);
});

test('selectMostCritical ignora providers em erro/indisponível/auth', () => {
    const providers = [
        {
            providerId: 'a',
            status: 'error',
            windows: [{ percent: 99 }],
        },
        {
            providerId: 'b',
            status: 'ok',
            windows: [{ percent: 30 }],
        },
    ];
    const result = selectMostCritical(providers);
    assert.equal(result.provider.providerId, 'b');
    assert.equal(result.percent, 30);
});

test('selectMostCritical escolhe a janela mais próxima do limite, não uma média', () => {
    const providers = [
        {
            providerId: 'claude',
            status: 'critical',
            windows: [{ percent: 98 }],
        },
        {
            providerId: 'chatgpt',
            status: 'ok',
            windows: [{ percent: 30 }],
        },
        {
            providerId: 'gemini',
            status: 'ok',
            windows: [{ percent: 20 }],
        },
    ];
    const result = selectMostCritical(providers);
    assert.equal(result.provider.providerId, 'claude');
    assert.equal(result.percent, 98);
});

test('selectMostCritical retorna undefined quando não há provider utilizável', () => {
    const providers = [{ providerId: 'a', status: 'error', windows: [] }];
    assert.equal(selectMostCritical(providers), undefined);
});

test('computeBudgetProjection calcula %/h e %/dia a partir de percent+resetsAt', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const projection = computeBudgetProjection(
        { percent: 40, resetsAt: '2026-01-11T00:00:00Z' }, // 10 dias = 240h restantes
        now
    );
    assert.ok(projection);
    assert.equal(projection.remainingPercent, 60);
    assert.equal(projection.hoursUntilReset, 240);
    assert.equal(projection.percentPerHour, 0.25);
    assert.equal(projection.percentPerDay, 6);
});

test('computeBudgetProjection retorna null sem percent', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(computeBudgetProjection({ resetsAt: '2026-01-02T00:00:00Z' }, now), null);
});

test('computeBudgetProjection retorna null sem resetsAt', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(computeBudgetProjection({ percent: 50 }, now), null);
});

test('computeBudgetProjection retorna null com resetsAt no passado', () => {
    const now = new Date('2026-01-02T00:00:00Z');
    assert.equal(computeBudgetProjection({ percent: 50, resetsAt: '2026-01-01T00:00:00Z' }, now), null);
});

test('computeBudgetProjection retorna null com resetsAt inválido', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    assert.equal(computeBudgetProjection({ percent: 50, resetsAt: 'not-a-date' }, now), null);
});

test('computeBudgetProjection com 100% usado tem remainingPercent 0', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const projection = computeBudgetProjection({ percent: 100, resetsAt: '2026-01-02T00:00:00Z' }, now);
    assert.equal(projection.remainingPercent, 0);
    assert.equal(projection.percentPerHour, 0);
});
