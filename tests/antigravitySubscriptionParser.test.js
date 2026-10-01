import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAntigravityQuota } from '../extension/lib/providers/antigravitySubscriptionParser.js';

test('parseAntigravityQuota extrai janela por modelo a partir de remainingFraction', () => {
    const windows = parseAntigravityQuota(
        {},
        { models: { 'gemini-3.1-pro': { displayName: 'Gemini 3.1 Pro', quotaInfo: { remainingFraction: 0.75, resetTime: '2026-01-01T05:00:00Z' } } } }
    );
    assert.equal(windows.length, 1);
    assert.equal(windows[0].id, 'gemini-3.1-pro');
    assert.equal(windows[0].label, 'Gemini 3.1 Pro');
    assert.equal(windows[0].percent, 25);
    assert.equal(windows[0].estimated, false);
    assert.equal(windows[0].resetsAt, '2026-01-01T05:00:00.000Z');
});

test('parseAntigravityQuota remove janelas duplicadas (mesmo label/percent/resetsAt)', () => {
    const windows = parseAntigravityQuota({}, {
        models: {
            'gemini-3.1-pro-high': { displayName: 'Gemini 3.1 Pro (High)', quotaInfo: { remainingFraction: 0.98, resetTime: '2026-01-01T05:00:00Z' } },
            'gemini-3.1-pro-high-preview': { displayName: 'Gemini 3.1 Pro (High)', quotaInfo: { remainingFraction: 0.98, resetTime: '2026-01-01T05:00:00Z' } },
        },
    });
    assert.equal(windows.length, 1);
    assert.equal(windows[0].id, 'gemini-3.1-pro-high');
});

test('parseAntigravityQuota mantém janelas com mesmo label mas percent/reset diferentes', () => {
    const windows = parseAntigravityQuota({}, {
        models: {
            m1: { displayName: 'Gemini 3.1 Pro (High)', quotaInfo: { remainingFraction: 0.98, resetTime: '2026-01-01T05:00:00Z' } },
            m2: { displayName: 'Gemini 3.1 Pro (High)', quotaInfo: { remainingFraction: 0.5, resetTime: '2026-01-01T05:00:00Z' } },
        },
    });
    assert.equal(windows.length, 2);
});

test('parseAntigravityQuota ignora modelos sem quotaInfo', () => {
    const windows = parseAntigravityQuota({}, { models: { 'gemini-3.5-flash': { displayName: 'Gemini 3.5 Flash' } } });
    assert.equal(windows.length, 0);
});

test('parseAntigravityQuota filtra modelos internos (chat_/tab_/rev/image/mquery/lite)', () => {
    const windows = parseAntigravityQuota({}, {
        models: {
            chat_internal: { quotaInfo: { remainingFraction: 0.5 } },
            tab_autocomplete: { quotaInfo: { remainingFraction: 0.5 } },
            rev_experimental: { quotaInfo: { remainingFraction: 0.5 } },
            'imagen-3': { quotaInfo: { remainingFraction: 0.5 } },
            'gemini-mquery-lite': { quotaInfo: { remainingFraction: 0.5 } },
            'gemini-3.1-pro': { displayName: 'Gemini 3.1 Pro', quotaInfo: { remainingFraction: 0.9 } },
        },
    });
    assert.equal(windows.length, 1);
    assert.equal(windows[0].id, 'gemini-3.1-pro');
});

test('parseAntigravityQuota usa modelId como label quando displayName/label ausentes', () => {
    const windows = parseAntigravityQuota({}, { models: { 'gemini-3.5-flash': { quotaInfo: { remainingFraction: 1 } } } });
    assert.equal(windows[0].label, 'gemini-3.5-flash');
    assert.equal(windows[0].percent, 0);
});

test('parseAntigravityQuota ordena janelas de modelo por label', () => {
    const windows = parseAntigravityQuota({}, {
        models: {
            m1: { displayName: 'Zebra', quotaInfo: { remainingFraction: 0.5 } },
            m2: { displayName: 'Alfa', quotaInfo: { remainingFraction: 0.5 } },
        },
    });
    assert.deepEqual(windows.map((w) => w.label), ['Alfa', 'Zebra']);
});

test('parseAntigravityQuota adiciona janela de créditos de prompt quando presentes', () => {
    const windows = parseAntigravityQuota({ planInfo: { monthlyPromptCredits: 1000 }, availablePromptCredits: 400 }, {});
    assert.equal(windows.length, 1);
    assert.equal(windows[0].id, 'prompt-credits');
    assert.equal(windows[0].unit, 'credits');
    assert.equal(windows[0].used, 600);
    assert.equal(windows[0].limit, 1000);
    assert.equal(windows[0].remaining, 400);
    assert.equal(windows[0].percent, 60);
    assert.equal(windows[0].window, 'month');
});

test('parseAntigravityQuota omite créditos de prompt quando monthlyPromptCredits ausente/zero', () => {
    assert.deepEqual(parseAntigravityQuota({ availablePromptCredits: 400 }, {}), []);
    assert.deepEqual(parseAntigravityQuota({ planInfo: { monthlyPromptCredits: 0 }, availablePromptCredits: 0 }, {}), []);
});

test('parseAntigravityQuota retorna lista vazia para respostas vazias/inválidas', () => {
    assert.deepEqual(parseAntigravityQuota({}, {}), []);
    assert.deepEqual(parseAntigravityQuota(null, null), []);
    assert.deepEqual(parseAntigravityQuota(undefined, { models: null }), []);
});

test('parseAntigravityQuota combina janelas de modelo e créditos de prompt', () => {
    const windows = parseAntigravityQuota(
        { planInfo: { monthlyPromptCredits: 100 }, availablePromptCredits: 90 },
        { models: { 'gemini-3.1-pro': { displayName: 'Gemini 3.1 Pro', quotaInfo: { remainingFraction: 0.5 } } } }
    );
    assert.equal(windows.length, 2);
    assert.deepEqual(windows.map((w) => w.id), ['gemini-3.1-pro', 'prompt-credits']);
});
