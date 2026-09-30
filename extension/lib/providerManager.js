// ProviderManager (seção 5, 6 do plano): orquestra os providers, isola
// falhas individuais e nunca deixa uma exceção de um provider derrubar os
// demais (RF-04: "a falha de um provider não pode impedir a exibição dos
// demais"). Fase 3: timeout e retry controlado com backoff por provider.

import { selectMostCritical } from './normalizer.js';
import { withRetry, TimeoutError } from './retry.js';

const DEFAULT_RETRIES = 1;
const DEFAULT_BACKOFF_MS = 500;
const DEFAULT_TIMEOUT_MS = 10_000;

// Não insiste em erros que retry não resolve: autenticação e rate limit são
// resolvidos por outro caminho (usuário reconecta / provider libera cota),
// não por tentar de novo imediatamente ("respeitar rate limits", seção 8.3).
const NON_RETRYABLE_CODES = new Set(['PROVIDER_AUTH_REQUIRED', 'PROVIDER_RATE_LIMITED']);

export class ProviderManager {
    constructor(providers = [], {
        retries = DEFAULT_RETRIES,
        backoffMs = DEFAULT_BACKOFF_MS,
        timeoutMs = DEFAULT_TIMEOUT_MS,
    } = {}) {
        /** @type {import('./providers/provider.js').UsageProvider[]} */
        this.providers = providers;
        this.retries = retries;
        this.backoffMs = backoffMs;
        this.timeoutMs = timeoutMs;
    }

    addProvider(provider) {
        this.providers.push(provider);
    }

    removeProvider(id) {
        this.providers = this.providers.filter((p) => p.id !== id);
    }

    /**
     * Busca o uso de todos os providers configurados. Cada falha vira um
     * `AIProviderUsage` com status "error"/"auth_required", nunca uma
     * exceção propagada.
     * @param {Set<string>|null} [enabledIds] - quando fornecido, só busca
     *   providers cujo `id` esteja neste conjunto (RF-05: providers
     *   ocultos pelas preferências não são consultados).
     * @returns {Promise<import('./types.js').AIProviderUsage[]>}
     */
    async fetchAll(enabledIds = null) {
        const providers = enabledIds
            ? this.providers.filter((p) => enabledIds.has(p.id))
            : this.providers;
        return Promise.all(providers.map((provider) => this._fetchOne(provider)));
    }

    async _fetchOne(provider) {
        try {
            const configured = await provider.isConfigured();
            if (!configured)
                return this._errorUsage(provider, 'PROVIDER_AUTH_REQUIRED', 'auth_required');

            return await withRetry(() => provider.fetchUsage(), {
                retries: this.retries,
                backoffMs: this.backoffMs,
                timeoutMs: this.timeoutMs,
                shouldRetry: (error) => !NON_RETRYABLE_CODES.has(error?.code),
            });
        } catch (error) {
            this._logError(error, `ProviderManager: falha ao buscar uso de ${provider.id}`);

            if (error instanceof TimeoutError)
                return this._errorUsage(provider, 'PROVIDER_TIMEOUT');

            const errorCode = error?.code ?? 'PROVIDER_INVALID_RESPONSE';
            const status = errorCode === 'PROVIDER_AUTH_REQUIRED' ? 'auth_required' : 'error';
            return this._errorUsage(provider, errorCode, status);
        }
    }

    _errorUsage(provider, errorCode, status = 'error') {
        return {
            providerId: provider.id,
            providerName: provider.name,
            status,
            windows: [],
            fetchedAt: new Date().toISOString(),
            stale: false,
            errorCode,
        };
    }

    _logError(error, message) {
        // `logError` é global no runtime GJS/GNOME Shell; em Node (testes)
        // cai no console.error.
        const log = typeof logError === 'function' ? logError : console.error;
        log(error, message);
    }

    /**
     * @param {import('./types.js').AIProviderUsage[]} usages
     */
    getMostCritical(usages) {
        return selectMostCritical(usages);
    }
}
