// Funções puras de normalização (seção 4.1 e 13.1 do plano).
// Sem dependências de GJS/GNOME para permitir teste com Node puro.

import { USAGE_THRESHOLDS } from './types.js';

/** Garante que percent fique entre 0 e 100. */
export function clampPercent(value) {
    if (typeof value !== 'number' || Number.isNaN(value))
        return undefined;
    return Math.min(100, Math.max(0, value));
}

/**
 * Calcula percent a partir de used/limit quando percent não veio pronto.
 * Não fabrica limit: se limit for undefined/0, retorna undefined.
 */
export function computePercent({ used, limit, percent }) {
    if (typeof percent === 'number')
        return clampPercent(percent);
    if (typeof used === 'number' && typeof limit === 'number' && limit > 0)
        return clampPercent((used / limit) * 100);
    return undefined;
}

/** Calcula remaining a partir de used/limit quando não veio pronto. */
export function computeRemaining({ used, limit, remaining }) {
    if (typeof remaining === 'number')
        return remaining;
    if (typeof used === 'number' && typeof limit === 'number')
        return Math.max(0, limit - used);
    return undefined;
}

/**
 * Deriva o *estado visual* (RF-03: normal/atenção/alto/crítico) a partir do
 * percent de uma janela. Distinto de `ProviderStatus` (seção 4), que é o
 * status de conectividade/dado do provider como um todo (ok/erro/etc.). A UI
 * usa esta função como fonte única dos thresholds — não deve duplicá-los.
 */
export function visualStateFromPercent(percent) {
    if (typeof percent !== 'number')
        return 'unknown';
    if (percent >= USAGE_THRESHOLDS.CRITICAL)
        return 'critical';
    if (percent >= USAGE_THRESHOLDS.HIGH)
        return 'high';
    if (percent >= USAGE_THRESHOLDS.ATTENTION)
        return 'attention';
    return 'normal';
}

/** Marca como stale quando fetchedAt é mais antigo que thresholdMs. */
export function isStale(fetchedAt, thresholdMs, now = Date.now()) {
    const fetchedMs = Date.parse(fetchedAt);
    if (Number.isNaN(fetchedMs))
        return true;
    return now - fetchedMs > thresholdMs;
}

/**
 * Seleciona o provider "mais próximo do limite" entre uma lista de
 * AIProviderUsage, para o indicador agregado (RF-01). Não é uma média.
 *
 * Critério: maior percent entre todas as janelas de todos os providers com
 * status utilizável (ok/warning/critical). Providers em erro/indisponível
 * não participam do cálculo, mas devem ser exibidos no popup mesmo assim.
 */
export function selectMostCritical(providers) {
    let best;
    let bestPercent = -1;

    for (const provider of providers) {
        if (!['ok', 'warning', 'critical'].includes(provider.status))
            continue;

        for (const w of provider.windows ?? []) {
            const percent = computePercent(w);
            if (typeof percent === 'number' && percent > bestPercent) {
                bestPercent = percent;
                best = { provider, window: w, percent };
            }
        }
    }

    return best;
}
