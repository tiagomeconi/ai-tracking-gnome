// MockProvider (seção 6.1 do plano) — base do desenvolvimento e dos testes
// de UI, cobrindo todos os cenários exigidos antes de depender de serviços
// reais.

import { UsageProvider } from './provider.js';

/** @typedef {keyof typeof MockProvider.SCENARIOS} MockScenario */

export class MockProvider extends UsageProvider {
    static SCENARIOS = Object.freeze({
        USAGE_20: 'usage_20',
        USAGE_75: 'usage_75',
        USAGE_90: 'usage_90',
        USAGE_100: 'usage_100',
        LOADING: 'loading',
        ERROR: 'error',
        AUTH_REQUIRED: 'auth_required',
        UNAVAILABLE: 'unavailable',
        STALE: 'stale',
        MULTI_WINDOW: 'multi_window',
        RESET_SOON: 'reset_soon',
        UNKNOWN_LIMIT: 'unknown_limit',
    });

    /**
     * @param {string} id
     * @param {string} name
     * @param {MockScenario} scenario
     * @param {number} loadingDelayMs - atraso simulado do cenário LOADING;
     *   configurável para não deixar os testes lentos.
     */
    constructor(id, name, scenario = MockProvider.SCENARIOS.USAGE_20, loadingDelayMs = 4000) {
        super(id, name);
        this.scenario = scenario;
        this.loadingDelayMs = loadingDelayMs;
    }

    async isConfigured() {
        return true;
    }

    async healthCheck() {
        return this.scenario !== MockProvider.SCENARIOS.UNAVAILABLE;
    }

    async fetchUsage() {
        const now = new Date();
        const nowIso = now.toISOString();
        const inMinutes = (m) => new Date(now.getTime() + m * 60_000).toISOString();

        const base = {
            providerId: this.id,
            providerName: this.name,
            fetchedAt: nowIso,
            stale: false,
        };

        switch (this.scenario) {
        case MockProvider.SCENARIOS.LOADING:
            // "Loading" não é um ProviderStatus persistido — é o estado
            // transitório que a UI mostra enquanto fetchUsage() ainda não
            // resolveu (seção 10.3). Simulamos isso com uma resolução
            // artificialmente lenta, para que o card "Carregando…" fique
            // visível o suficiente para validar na UI real.
            await new Promise((resolve) => setTimeout(resolve, this.loadingDelayMs));
            return {
                providerId: this.id,
                providerName: this.name,
                fetchedAt: new Date().toISOString(),
                stale: false,
                status: 'ok',
                windows: [singleWindow({ used: 20, limit: 100, window: 'day', resetIn: 60 * 6 })],
            };

        case MockProvider.SCENARIOS.ERROR:
            return {
                ...base,
                status: 'error',
                windows: [],
                errorCode: 'PROVIDER_INVALID_RESPONSE',
            };

        case MockProvider.SCENARIOS.AUTH_REQUIRED:
            return {
                ...base,
                status: 'auth_required',
                windows: [],
                errorCode: 'PROVIDER_AUTH_REQUIRED',
            };

        case MockProvider.SCENARIOS.UNAVAILABLE:
            return {
                ...base,
                status: 'unavailable',
                windows: [],
                errorCode: 'PROVIDER_UNAVAILABLE',
            };

        case MockProvider.SCENARIOS.STALE:
            return {
                ...base,
                fetchedAt: inMinutes(-180),
                stale: true,
                status: 'ok',
                windows: [singleWindow({ used: 40, limit: 100, window: 'day', resetIn: 60 * 6 })],
            };

        case MockProvider.SCENARIOS.MULTI_WINDOW:
            return {
                ...base,
                status: 'warning',
                windows: [
                    singleWindow({ id: 'messages-3h', label: 'Mensagens / 3h', used: 92, limit: 100, unit: 'messages', window: '3h', resetIn: 47 }),
                    singleWindow({ id: 'tokens-min', label: 'Tokens / minuto', used: 5000, limit: 20000, unit: 'tokens', window: 'minute', resetIn: 1 }),
                    singleWindow({ id: 'requests-day', label: 'Requests / dia', used: 300, limit: 1000, unit: 'requests', window: 'day', resetIn: 60 * 5 }),
                ],
            };

        case MockProvider.SCENARIOS.RESET_SOON:
            return {
                ...base,
                status: 'critical',
                windows: [singleWindow({ used: 98, limit: 100, window: '5h', resetIn: 2 })],
            };

        case MockProvider.SCENARIOS.UNKNOWN_LIMIT:
            return {
                ...base,
                status: 'ok',
                windows: [{
                    id: 'default',
                    label: 'Uso',
                    unit: 'unknown',
                    used: 42,
                    window: 'unknown',
                    estimated: true,
                }],
            };

        case MockProvider.SCENARIOS.USAGE_100:
            return {
                ...base,
                status: 'critical',
                windows: [singleWindow({ used: 100, limit: 100, window: '5h', resetIn: 10 })],
            };

        case MockProvider.SCENARIOS.USAGE_90:
            return {
                ...base,
                status: 'critical',
                windows: [singleWindow({ used: 90, limit: 100, window: '5h', resetIn: 47 })],
            };

        case MockProvider.SCENARIOS.USAGE_75:
            return {
                ...base,
                status: 'warning',
                windows: [singleWindow({ used: 75, limit: 100, window: '3h', resetIn: 92 })],
            };

        case MockProvider.SCENARIOS.USAGE_20:
        default:
            return {
                ...base,
                status: 'ok',
                windows: [singleWindow({ used: 20, limit: 100, window: 'day', resetIn: 60 * 6 })],
            };
        }
    }
}

function singleWindow({
    id = 'default',
    label = 'Uso',
    unit = 'percentage',
    used,
    limit,
    window,
    resetIn,
}) {
    const resetsAt = typeof resetIn === 'number'
        ? new Date(Date.now() + resetIn * 60_000).toISOString()
        : undefined;

    return {
        id,
        label,
        unit,
        used,
        limit,
        window,
        resetsAt,
        estimated: false,
    };
}
