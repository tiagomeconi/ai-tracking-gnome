import test from 'node:test';
import assert from 'node:assert/strict';

import { UsageCache } from '../extension/lib/cache.js';

function makeUsage(overrides = {}) {
    return {
        providerId: 'p1',
        providerName: 'Provider 1',
        status: 'ok',
        windows: [],
        fetchedAt: new Date().toISOString(),
        stale: false,
        ...overrides,
    };
}

test('UsageCache retorna undefined para provider desconhecido', () => {
    const cache = new UsageCache();
    assert.equal(cache.get('nope'), undefined);
});

test('UsageCache guarda e devolve o último valor conhecido', () => {
    const cache = new UsageCache();
    cache.set(makeUsage());
    const result = cache.get('p1');
    assert.equal(result.providerId, 'p1');
    assert.equal(result.stale, false);
});

test('UsageCache marca stale quando fetchedAt ultrapassa o limite', () => {
    const cache = new UsageCache(1000);
    const oldFetchedAt = new Date(Date.now() - 5000).toISOString();
    cache.set(makeUsage({ fetchedAt: oldFetchedAt }));
    const result = cache.get('p1');
    assert.equal(result.stale, true);
});

test('UsageCache.getAll retorna todos os providers armazenados', () => {
    const cache = new UsageCache();
    cache.setAll([makeUsage({ providerId: 'a' }), makeUsage({ providerId: 'b' })]);
    const all = cache.getAll();
    assert.equal(all.length, 2);
});
