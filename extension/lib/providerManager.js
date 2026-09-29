// ProviderManager (seção 5, 6 do plano): orquestra os providers, isola
// falhas individuais e nunca deixa uma exceção de um provider derrubar os
// demais (RF-04: "a falha de um provider não pode impedir a exibição dos
// demais").

import { selectMostCritical } from './normalizer.js';

export class ProviderManager {
    constructor(providers = []) {
        /** @type {import('./providers/provider.js').UsageProvider[]} */
        this.providers = providers;
    }

    addProvider(provider) {
        this.providers.push(provider);
    }

    removeProvider(id) {
        this.providers = this.providers.filter((p) => p.id !== id);
    }

    /**
     * Busca o uso de todos os providers configurados. Cada falha vira um
     * `AIProviderUsage` com status "error", nunca uma exceção propagada.
     * @returns {Promise<import('./types.js').AIProviderUsage[]>}
     */
    async fetchAll() {
        const results = await Promise.all(
            this.providers.map((provider) => this._fetchOne(provider))
        );
        return results;
    }

    async _fetchOne(provider) {
        try {
            const configured = await provider.isConfigured();
            if (!configured) {
                return {
                    providerId: provider.id,
                    providerName: provider.name,
                    status: 'auth_required',
                    windows: [],
                    fetchedAt: new Date().toISOString(),
                    stale: false,
                    errorCode: 'PROVIDER_AUTH_REQUIRED',
                };
            }
            return await provider.fetchUsage();
        } catch (error) {
            // `logError` é global no runtime GJS/GNOME Shell; em Node (testes)
            // cai no console.error.
            const log = typeof logError === 'function' ? logError : console.error;
            log(error, `ProviderManager: falha ao buscar uso de ${provider.id}`);
            return {
                providerId: provider.id,
                providerName: provider.name,
                status: 'error',
                windows: [],
                fetchedAt: new Date().toISOString(),
                stale: false,
                errorCode: 'PROVIDER_INVALID_RESPONSE',
            };
        }
    }

    /**
     * @param {import('./types.js').AIProviderUsage[]} usages
     */
    getMostCritical(usages) {
        return selectMostCritical(usages);
    }
}
