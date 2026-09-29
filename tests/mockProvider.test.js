import test from 'node:test';
import assert from 'node:assert/strict';

import { MockProvider } from '../extension/lib/providers/mock.js';
import { ProviderManager } from '../extension/lib/providerManager.js';

test('MockProvider cobre todos os cenários exigidos pela seção 6.1', async () => {
    for (const scenario of Object.values(MockProvider.SCENARIOS)) {
        const provider = new MockProvider('mock', 'Mock', scenario);
        const usage = await provider.fetchUsage();
        assert.equal(usage.providerId, 'mock');
        assert.ok(usage.fetchedAt);
        assert.ok(Array.isArray(usage.windows));
    }
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
    ]);

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

    const manager = new ProviderManager([new UnconfiguredProvider()]);
    const [result] = await manager.fetchAll();
    assert.equal(result.status, 'auth_required');
    assert.equal(result.errorCode, 'PROVIDER_AUTH_REQUIRED');
});
