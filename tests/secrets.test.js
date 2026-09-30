import test from 'node:test';
import assert from 'node:assert/strict';

import { SecretStore, InMemorySecretBackend } from '../extension/lib/secrets.js';
import { UsageProvider } from '../extension/lib/providers/provider.js';
import { ProviderManager } from '../extension/lib/providerManager.js';

function makeStore() {
    return new SecretStore(new InMemorySecretBackend());
}

test('SecretStore.has() é false quando nada foi armazenado', async () => {
    const store = makeStore();
    assert.equal(await store.has('claude'), false);
});

test('SecretStore.store()/lookup() round-trip', async () => {
    const store = makeStore();
    await store.store('claude', 'sk-super-secreto');
    assert.equal(await store.lookup('claude'), 'sk-super-secreto');
    assert.equal(await store.has('claude'), true);
});

test('SecretStore.clear() invalida a credencial', async () => {
    const store = makeStore();
    await store.store('claude', 'sk-super-secreto');
    await store.clear('claude');
    assert.equal(await store.lookup('claude'), null);
    assert.equal(await store.has('claude'), false);
});

test('SecretStore.store() rejeita secret vazio sem vazar o valor na mensagem de erro', async () => {
    const store = makeStore();
    await assert.rejects(
        () => store.store('claude', ''),
        (error) => {
            assert.ok(error.message.includes('claude'));
            assert.ok(!error.message.includes('sk-'));
            return true;
        }
    );
});

test('providers distintos não compartilham credencial', async () => {
    const store = makeStore();
    await store.store('claude', 'token-claude');
    await store.store('chatgpt', 'token-chatgpt');
    assert.equal(await store.lookup('claude'), 'token-claude');
    assert.equal(await store.lookup('chatgpt'), 'token-chatgpt');
});

// Demonstra o padrão de wiring esperado de um provider real (Fase 6):
// isConfigured() consulta o SecretStore; connect()/disconnect() gravam e
// removem a credencial; o ProviderManager converte "não configurado" em
// status auth_required sem propagar exceção.
class SecretBackedFakeProvider extends UsageProvider {
    constructor(id, name, secretStore) {
        super(id, name);
        this._secrets = secretStore;
    }

    async isConfigured() {
        return this._secrets.has(this.id);
    }

    async connect(secret) {
        await this._secrets.store(this.id, secret);
    }

    async disconnect() {
        await this._secrets.clear(this.id);
    }

    async fetchUsage() {
        return {
            providerId: this.id,
            providerName: this.name,
            status: 'ok',
            windows: [],
            fetchedAt: new Date().toISOString(),
            stale: false,
        };
    }

    async healthCheck() {
        return true;
    }
}

test('provider sem credencial conectada vira auth_required via ProviderManager', async () => {
    const store = makeStore();
    const provider = new SecretBackedFakeProvider('claude', 'Claude', store);

    const manager = new ProviderManager([provider], { retries: 0, backoffMs: 0, timeoutMs: 1000 });
    const [result] = await manager.fetchAll();

    assert.equal(result.status, 'auth_required');
    assert.equal(result.errorCode, 'PROVIDER_AUTH_REQUIRED');
});

test('connect() habilita o provider; disconnect() volta a auth_required', async () => {
    const store = makeStore();
    const provider = new SecretBackedFakeProvider('claude', 'Claude', store);
    const manager = new ProviderManager([provider], { retries: 0, backoffMs: 0, timeoutMs: 1000 });

    await provider.connect('sk-token');
    const [connected] = await manager.fetchAll();
    assert.equal(connected.status, 'ok');

    await provider.disconnect();
    const [disconnected] = await manager.fetchAll();
    assert.equal(disconnected.status, 'auth_required');
});
