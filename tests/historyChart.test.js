import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateDailyMax, layoutBarChart } from '../extension/lib/historyChart.js';

test('aggregateDailyMax mantém só o maior percent por dia', () => {
    const samples = [
        { timestamp: '2026-01-01T10:00:00Z', percent: 30 },
        { timestamp: '2026-01-01T15:00:00Z', percent: 70 },
        { timestamp: '2026-01-01T20:00:00Z', percent: 50 },
    ];
    const daily = aggregateDailyMax(samples);
    assert.equal(daily.length, 1);
    assert.equal(daily[0].percent, 70);
});

test('aggregateDailyMax agrupa dias distintos e ordena por data crescente', () => {
    const samples = [
        { timestamp: '2026-01-03T12:00:00Z', percent: 40 },
        { timestamp: '2026-01-01T12:00:00Z', percent: 90 },
        { timestamp: '2026-01-02T12:00:00Z', percent: 60 },
    ];
    const daily = aggregateDailyMax(samples);
    assert.deepEqual(daily.map((d) => d.percent), [90, 60, 40]);
    assert.ok(daily[0].date < daily[1].date && daily[1].date < daily[2].date);
});

test('aggregateDailyMax ignora amostras com timestamp inválido ou percent não numérico', () => {
    const samples = [
        { timestamp: 'not-a-date', percent: 50 },
        { timestamp: '2026-01-01T12:00:00Z', percent: 'não é número' },
        { timestamp: '2026-01-01T12:00:00Z', percent: 42 },
    ];
    const daily = aggregateDailyMax(samples);
    assert.equal(daily.length, 1);
    assert.equal(daily[0].percent, 42);
});

test('aggregateDailyMax retorna [] pra lista vazia', () => {
    assert.deepEqual(aggregateDailyMax([]), []);
});

test('layoutBarChart retorna [] sem dados diários', () => {
    assert.deepEqual(layoutBarChart([], { width: 200, height: 100 }), { bars: [] });
});

test('layoutBarChart distribui barras uniformemente e escala a altura pelo percent', () => {
    const daily = [
        { date: '2026-01-01', percent: 100 },
        { date: '2026-01-02', percent: 0 },
        { date: '2026-01-03', percent: 50 },
    ];
    const { bars } = layoutBarChart(daily, { width: 300, height: 100, padding: 0, gap: 0 });
    assert.equal(bars.length, 3);

    // 100% -> ocupa a altura útil inteira (y no topo, height == plotHeight)
    assert.equal(bars[0].y, 0);
    assert.equal(bars[0].height, 100);

    // 0% -> barra de altura zero, encostada na base
    assert.equal(bars[1].height, 0);
    assert.equal(bars[1].y, 100);

    // 50% -> metade da altura
    assert.equal(bars[2].height, 50);
    assert.equal(bars[2].y, 50);

    // barras em sequência, sem sobreposição
    assert.ok(bars[0].x < bars[1].x);
    assert.ok(bars[1].x < bars[2].x);
});

test('layoutBarChart preserva date/percent originais em cada barra', () => {
    const daily = [{ date: '2026-01-01', percent: 73 }];
    const { bars } = layoutBarChart(daily, { width: 200, height: 100 });
    assert.equal(bars[0].date, '2026-01-01');
    assert.equal(bars[0].percent, 73);
});

test('layoutBarChart limita percent fora de 0-100 ao desenhar', () => {
    const daily = [
        { date: '2026-01-01', percent: 150 },
        { date: '2026-01-02', percent: -10 },
    ];
    const { bars } = layoutBarChart(daily, { width: 200, height: 100, padding: 0, gap: 0 });
    assert.equal(bars[0].height, 100);
    assert.equal(bars[1].height, 0);
});
