// Cache mínimo em memória (parte da Fase 3, adiantado por ser necessário
// para o popup não depender de rede toda vez que abre — RF-04/seção 9).
// Scheduler, retry e backoff completos ficam para a Fase 3.

import { isStale } from './normalizer.js';

const DEFAULT_STALE_AFTER_MS = 5 * 60_000;

export class UsageCache {
    constructor(staleAfterMs = DEFAULT_STALE_AFTER_MS) {
        this.staleAfterMs = staleAfterMs;
        /** @type {Map<string, import('./types.js').AIProviderUsage>} */
        this._entries = new Map();
    }

    set(usage) {
        this._entries.set(usage.providerId, usage);
    }

    setAll(usages) {
        for (const usage of usages)
            this.set(usage);
    }

    /** @returns {import('./types.js').AIProviderUsage | undefined} */
    get(providerId) {
        const entry = this._entries.get(providerId);
        if (!entry)
            return undefined;
        return { ...entry, stale: entry.stale || isStale(entry.fetchedAt, this.staleAfterMs) };
    }

    getAll() {
        return [...this._entries.keys()].map((id) => this.get(id));
    }

    clear() {
        this._entries.clear();
    }
}
