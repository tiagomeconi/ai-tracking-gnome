import test from 'node:test';
import assert from 'node:assert/strict';

import {
    parseHistoryText,
    serializeHistory,
    pruneHistory,
    samplesFromUsages,
    listHistorySeries,
} from '../extension/lib/history.js';

test('parseHistoryText parseia linhas JSONL válidas', () => {
    const text = '{"timestamp":"2026-01-01T00:00:00Z","providerId":"claude","windowId":"five_hour","percent":10}\n'
        + '{"timestamp":"2026-01-01T01:00:00Z","providerId":"claude","windowId":"five_hour","percent":20}\n';
    const samples = parseHistoryText(text);
    assert.equal(samples.length, 2);
    assert.equal(samples[1].percent, 20);
});

test('parseHistoryText ignora linhas vazias e corrompidas', () => {
    const text = '\n{"timestamp":"2026-01-01T00:00:00Z","providerId":"a","windowId":"b","percent":1}\nnão é json\n';
    const samples = parseHistoryText(text);
    assert.equal(samples.length, 1);
});

test('parseHistoryText ignora amostras sem campos obrigatórios', () => {
    const text = '{"timestamp":"2026-01-01T00:00:00Z","percent":10}\n'; // sem providerId/windowId
    assert.deepEqual(parseHistoryText(text), []);
});

test('parseHistoryText retorna [] para texto vazio/nulo', () => {
    assert.deepEqual(parseHistoryText(''), []);
    assert.deepEqual(parseHistoryText(null), []);
});

test('serializeHistory/parseHistoryText fazem round-trip', () => {
    const samples = [
        { timestamp: '2026-01-01T00:00:00.000Z', providerId: 'claude', windowId: 'five_hour', windowLabel: 'Janela de 5 horas', percent: 42 },
    ];
    const roundTripped = parseHistoryText(serializeHistory(samples));
    assert.deepEqual(roundTripped, samples);
});

test('serializeHistory retorna string vazia para lista vazia', () => {
    assert.equal(serializeHistory([]), '');
});

test('pruneHistory remove amostras mais antigas que retentionDays', () => {
    const now = new Date('2026-02-01T00:00:00Z');
    const samples = [
        { timestamp: '2026-01-01T00:00:00Z', percent: 10 }, // 31 dias atrás
        { timestamp: '2026-01-25T00:00:00Z', percent: 20 }, // 7 dias atrás
    ];
    const pruned = pruneHistory(samples, { retentionDays: 30, now });
    assert.equal(pruned.length, 1);
    assert.equal(pruned[0].percent, 20);
});

test('pruneHistory ignora amostras com timestamp inválido', () => {
    const now = new Date('2026-02-01T00:00:00Z');
    const pruned = pruneHistory([{ timestamp: 'not-a-date', percent: 10 }], { now });
    assert.deepEqual(pruned, []);
});

test('pruneHistory corta pelas mais antigas quando excede maxSamples', () => {
    const now = new Date('2026-01-01T00:10:00Z');
    const samples = [
        { timestamp: '2026-01-01T00:00:00Z', percent: 1 },
        { timestamp: '2026-01-01T00:01:00Z', percent: 2 },
        { timestamp: '2026-01-01T00:02:00Z', percent: 3 },
    ];
    const pruned = pruneHistory(samples, { maxSamples: 2, now });
    assert.deepEqual(pruned.map((s) => s.percent), [2, 3]);
});

test('samplesFromUsages só considera providers com status ok', () => {
    const usages = [
        { providerId: 'claude', status: 'ok', windows: [{ id: 'five_hour', label: 'Janela de 5 horas', percent: 30 }] },
        { providerId: 'codex', status: 'error', windows: [{ id: 'w', label: 'W', percent: 50 }] },
    ];
    const samples = samplesFromUsages(usages, new Date('2026-01-01T00:00:00Z'));
    assert.equal(samples.length, 1);
    assert.equal(samples[0].providerId, 'claude');
    assert.equal(samples[0].timestamp, '2026-01-01T00:00:00.000Z');
});

test('samplesFromUsages ignora janelas sem percent numérico', () => {
    const usages = [{ providerId: 'claude', status: 'ok', windows: [{ id: 'w', label: 'W' }] }];
    assert.deepEqual(samplesFromUsages(usages), []);
});

test('listHistorySeries deduplica por providerId+windowId', () => {
    const samples = [
        { providerId: 'claude', windowId: 'five_hour', windowLabel: 'Janela de 5 horas', percent: 10, timestamp: '2026-01-01T00:00:00Z' },
        { providerId: 'claude', windowId: 'five_hour', windowLabel: 'Janela de 5 horas', percent: 20, timestamp: '2026-01-01T01:00:00Z' },
        { providerId: 'codex', windowId: 'primary', windowLabel: 'Janela de 5 hora(s)', percent: 5, timestamp: '2026-01-01T00:00:00Z' },
    ];
    const series = listHistorySeries(samples);
    assert.equal(series.length, 2);
    assert.deepEqual(series[0], { providerId: 'claude', windowId: 'five_hour', windowLabel: 'Janela de 5 horas' });
});
