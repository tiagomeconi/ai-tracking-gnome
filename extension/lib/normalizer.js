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

/**
 * Projeção de "ritmo sustentável": quanto % ainda dá pra gastar por hora/dia
 * até a janela renovar, sem estourar o limite antes do reset. É só
 * aritmética sobre o que a própria janela já informa (percent + resetsAt)
 * — não depende de histórico de consumo nem inventa dado novo; por isso
 * nunca marca o resultado como `estimated` no `UsageWindow` (ver seção 4.1
 * do plano: não fabricar informação ausente). A UI deve deixar claro que é
 * uma projeção derivada, não um número que o provider retornou.
 *
 * @param {import('./types.js').UsageWindow} window
 * @param {Date} [now]
 * @returns {{ remainingPercent: number, hoursUntilReset: number, percentPerHour: number, percentPerDay: number } | null}
 *   `null` quando não há percent e/ou resetsAt válidos, ou quando resetsAt
 *   já passou (nesse caso o reset está "atrasado" do ponto de vista do
 *   cliente — não dá pra projetar contra um prazo no passado).
 */
export function computeBudgetProjection(window, now = new Date()) {
    const percent = computePercent(window);
    if (typeof percent !== 'number' || !window.resetsAt)
        return null;

    const resetMs = Date.parse(window.resetsAt);
    if (Number.isNaN(resetMs))
        return null;

    const msUntilReset = resetMs - now.getTime();
    if (msUntilReset <= 0)
        return null;

    const remainingPercent = Math.max(0, 100 - percent);
    const hoursUntilReset = msUntilReset / 3_600_000;
    const percentPerHour = remainingPercent / hoursUntilReset;

    return {
        remainingPercent,
        hoursUntilReset,
        percentPerHour,
        percentPerDay: percentPerHour * 24,
    };
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
