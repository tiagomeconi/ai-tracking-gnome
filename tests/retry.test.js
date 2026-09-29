import test from 'node:test';
import assert from 'node:assert/strict';

import { withTimeout, withRetry, TimeoutError } from '../extension/lib/retry.js';

test('withTimeout resolve normalmente quando fn é rápida', async () => {
    const result = await withTimeout(() => Promise.resolve('ok'), 50);
    assert.equal(result, 'ok');
});

test('withTimeout rejeita com TimeoutError quando fn demora demais', async () => {
    const slow = () => new Promise((resolve) => setTimeout(() => resolve('late'), 50));
    await assert.rejects(() => withTimeout(slow, 5), TimeoutError);
});

test('withRetry retorna no primeiro sucesso sem tentativas extras', async () => {
    let calls = 0;
    const result = await withRetry(() => { calls++; return Promise.resolve('ok'); }, { retries: 3 });
    assert.equal(result, 'ok');
    assert.equal(calls, 1);
});

test('withRetry tenta novamente até `retries` vezes e então lança', async () => {
    let calls = 0;
    await assert.rejects(() => withRetry(() => {
        calls++;
        return Promise.reject(new Error('falhou'));
    }, { retries: 2, backoffMs: 1 }));
    assert.equal(calls, 3); // tentativa inicial + 2 retries
});

test('withRetry uniao com sucesso após falhas intermediárias', async () => {
    let calls = 0;
    const result = await withRetry(() => {
        calls++;
        if (calls < 3)
            return Promise.reject(new Error('ainda falhando'));
        return Promise.resolve('recuperou');
    }, { retries: 5, backoffMs: 1 });
    assert.equal(result, 'recuperou');
    assert.equal(calls, 3);
});

test('withRetry respeita shouldRetry e não insiste quando ele retorna false', async () => {
    let calls = 0;
    const rateLimitError = Object.assign(new Error('rate limited'), { code: 'PROVIDER_RATE_LIMITED' });
    await assert.rejects(() => withRetry(() => {
        calls++;
        return Promise.reject(rateLimitError);
    }, { retries: 5, backoffMs: 1, shouldRetry: (e) => e.code !== 'PROVIDER_RATE_LIMITED' }));
    assert.equal(calls, 1);
});

test('withRetry aplica timeout em cada tentativa', async () => {
    let calls = 0;
    const alwaysSlow = () => new Promise((resolve) => setTimeout(() => resolve('late'), 50));
    await assert.rejects(() => withRetry(() => { calls++; return alwaysSlow(); }, {
        retries: 1,
        timeoutMs: 5,
        backoffMs: 1,
    }), TimeoutError);
    assert.equal(calls, 2);
});
