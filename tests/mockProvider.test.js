import test from 'node:test';
import assert from 'node:assert/strict';

import { MockProvider } from '../extension/lib/providers/mock.js';
import { ProviderManager } from '../extension/lib/providerManager.js';

// Retries/backoff baixos para não deixar a suíte lenta; o comportamento de
// retry/timeout em si é coberto em detalhe mais abaixo.
const FAST_OPTS = { retries: 0, backoffMs: 0, timeoutMs: 1000 };

test('MockProvider cobre todos os cenários exigidos pela seção 6.1', async () => {
    for (const scenario of Object.values(MockProvider.SCENARIOS)) {
        const provider = new MockProvider('mock', 'Mock', scenario, 1);
        const usage = await provider.fetchUsage();
        assert.equal(usage.providerId, 'mock');
        assert.ok(usage.fetchedAt);
        assert.ok(Array.isArray(usage.windows));
    }
});

test('MockProvider propaga manageUrl no resultado', async () => {
    const provider = new MockProvider('mock', 'Mock', MockProvider.SCENARIOS.USAGE_20, 1, 'https://example.com/usage');
    const usage = await provider.fetchUsage();
    assert.equal(usage.manageUrl, 'https://example.com/usage');
});

test('MockProvider multi_window expõe mais de uma UsageWindow', async () => {
    const provider = new MockProvider('mock', 'Mock', MockProvider.SCENARIOS.MULTI_WINDOW);
    const usage = await provider.fetchUsage();
    assert.equal(usage.windows.length, 3);
});

test('MockProvider unknown_limit não fabrica limit', async () => {
    const provider = new MockProvider('mock', 'Mock', MockProvider.SCENARIOS.UNKNOWN_LIMIT);
    const usage = await provider.fetchUsage();
    assert.equal(usage.windows[0].limit, undefined);
    assert.equal(usage.windows[0].estimated, true);
});

test('MockProvider stale marca fetchedAt antigo e stale=true', async () => {
    const provider = new MockProvider('mock', 'Mock', MockProvider.SCENARIOS.STALE);
    const usage = await provider.fetchUsage();
    assert.equal(usage.stale, true);
});

test('ProviderManager isola falha de um provider sem afetar os demais', async () => {
    class ThrowingProvider {
        id = 'broken';
        name = 'Broken';
        async isConfigured() { return true; }
        async fetchUsage() { throw new Error('boom'); }
    }

    const manager = new ProviderManager([
        new ThrowingProvider(),
        new MockProvider('ok', 'OK', MockProvider.SCENARIOS.USAGE_20),
    ], FAST_OPTS);

    const results = await manager.fetchAll();
    assert.equal(results.length, 2);

    const broken = results.find((r) => r.providerId === 'broken');
    assert.equal(broken.status, 'error');
    assert.equal(broken.errorCode, 'PROVIDER_INVALID_RESPONSE');

    const ok = results.find((r) => r.providerId === 'ok');
    assert.equal(ok.status, 'ok');
});

test('ProviderManager reporta auth_required quando isConfigured() é false', async () => {
    class UnconfiguredProvider {
        id = 'unconf';
        name = 'Unconf';
        async isConfigured() { return false; }
        async fetchUsage() { throw new Error('não deveria ser chamado'); }
    }

    const manager = new ProviderManager([new UnconfiguredProvider()], FAST_OPTS);
    const [result] = await manager.fetchAll();
    assert.equal(result.status, 'auth_required');
    assert.equal(result.errorCode, 'PROVIDER_AUTH_REQUIRED');
});

test('ProviderManager tenta novamente antes de desistir e reporta sucesso', async () => {
    let calls = 0;
    class FlakyProvider {
        id = 'flaky';
        name = 'Flaky';
        async isConfigured() { return true; }
        async fetchUsage() {
            calls++;
            if (calls < 2)
                throw new Error('falha transitória');
            return {
                providerId: this.id,
                providerName: this.name,
                status: 'ok',
                windows: [],
                fetchedAt: new Date().toISOString(),
                stale: false,
            };
        }
    }

    const manager = new ProviderManager([new FlakyProvider()], { retries: 2, backoffMs: 1, timeoutMs: 1000 });
    const [result] = await manager.fetchAll();
    assert.equal(result.status, 'ok');
    assert.equal(calls, 2);
});

test('ProviderManager converte timeout em errorCode PROVIDER_TIMEOUT', async () => {
    class SlowProvider {
        id = 'slow';
        name = 'Slow';
        async isConfigured() { return true; }
        fetchUsage() {
            return new Promise((resolve) => setTimeout(() => resolve({
                providerId: this.id,
                providerName: this.name,
                status: 'ok',
                windows: [],
                fetchedAt: new Date().toISOString(),
                stale: false,
            }), 50));
        }
    }

    const manager = new ProviderManager([new SlowProvider()], { retries: 0, backoffMs: 0, timeoutMs: 5 });
    const [result] = await manager.fetchAll();
    assert.equal(result.status, 'error');
    assert.equal(result.errorCode, 'PROVIDER_TIMEOUT');
});

test('ProviderManager não insiste em rate limit (respeita o rate limit do provider)', async () => {
    let calls = 0;
    class RateLimitedProvider {
        id = 'rate';
        name = 'Rate';
        async isConfigured() { return true; }
        async fetchUsage() {
            calls++;
            throw Object.assign(new Error('rate limited'), { code: 'PROVIDER_RATE_LIMITED' });
        }
    }

    const manager = new ProviderManager([new RateLimitedProvider()], { retries: 3, backoffMs: 1, timeoutMs: 1000 });
    const [result] = await manager.fetchAll();
    assert.equal(calls, 1);
    assert.equal(result.status, 'error');
    assert.equal(result.errorCode, 'PROVIDER_RATE_LIMITED');
});
