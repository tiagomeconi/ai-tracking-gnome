// Converte o estado normalizado (AIProviderUsage[]) em um view-model simples
// para o renderer — equivalente a extension/menu.js, mas sem nenhum widget:
// só dados e textos prontos (pt-BR, como a extensão). Mantém regra de
// negócio fora do renderer, que apenas desenha.

import { computePercent, visualStateFromPercent, computeBudgetProjection, selectMostCritical } from '../shared/normalizer.js';
import { formatRemaining, formatElapsed, formatUsedWithUnit, formatBudgetProjection, shortProviderName, mostRecentFetchedAt, providerStatusMessage } from '../shared/format.js';

// RF-03: o estado nunca é comunicado só pela cor — sempre há uma palavra.
export const STATE_LABEL = {
    normal: 'Normal',
    attention: 'Atenção',
    high: 'Alto',
    critical: 'Crítico',
    unknown: 'Desconhecido',
};

// Providers com muitas janelas (ex.: Antigravity, uma por modelo) viram um
// bloco recolhido no popup.
export const COLLAPSE_WINDOWS_THRESHOLD = 4;

function buildWindow(window, now) {
    const percent = computePercent(window);
    const state = visualStateFromPercent(percent);
    const stateLabel = STATE_LABEL[state];
    const usedText = formatUsedWithUnit(window.used, window.unit);
    const percentText = typeof percent === 'number'
        ? `${Math.round(percent)}% · ${stateLabel}`
        : usedText ? `${usedText} · ${stateLabel}` : stateLabel;

    const remaining = formatRemaining(window.resetsAt, now);
    const projection = computeBudgetProjection(window, now);
    const budget = projection && projection.remainingPercent > 0 ? formatBudgetProjection(projection) : null;

    return {
        label: window.label,
        text: `${window.label} — ${percentText}`,
        percent: typeof percent === 'number' ? percent : null,
        state,
        resetText: remaining ? `Renova em ${remaining}` : null,
        budgetText: budget ? `Ritmo seguro: ${budget}` : null,
    };
}

function buildProvider(usage, now) {
    const base = {
        id: usage.providerId,
        name: usage.providerName,
        manageUrl: usage.manageUrl ?? null,
        accountLabel: usage.accountLabel ?? null,
        stale: Boolean(usage.stale),
        message: null,
        windows: [],
        collapsed: false,
    };

    if (['unavailable', 'auth_required', 'error'].includes(usage.status))
        return { ...base, message: providerStatusMessage(usage, now) };
    if (!usage.windows || usage.windows.length === 0)
        return { ...base, message: 'Consumo indisponível por integração suportada' };

    return {
        ...base,
        windows: usage.windows.map((w) => buildWindow(w, now)),
        collapsed: usage.windows.length > COLLAPSE_WINDOWS_THRESHOLD,
    };
}

/**
 * @param {import('../shared/types.js').AIProviderUsage[]} usages - já filtrados pelos providers habilitados.
 * @param {Date} [now]
 */
export function buildViewModel(usages, now = new Date()) {
    const best = selectMostCritical(usages);
    const lastFetchedAt = mostRecentFetchedAt(usages);

    return {
        empty: usages.length === 0,
        best: best
            ? {
                providerName: shortProviderName(best.provider.providerName),
                percent: Math.round(best.percent),
                state: visualStateFromPercent(best.percent),
            }
            : null,
        providers: usages.map((u) => buildProvider(u, now)),
        lastUpdatedText: lastFetchedAt ? `Atualizado ${formatElapsed(lastFetchedAt, now)}` : 'Ainda não atualizado',
    };
}

/** Texto do indicador (tooltip/título): "Claude 85%" ou "—". */
export function indicatorText(viewModel) {
    return viewModel.best ? `${viewModel.best.providerName} ${viewModel.best.percent}%` : '—';
}

/** Corpo da notificação de limite (mesma redação da extensão GNOME). */
export function thresholdNotificationText(event, now = new Date()) {
    const stateLabel = STATE_LABEL[event.state] ?? event.state;
    const remaining = formatRemaining(event.resetsAt, now);
    const percent = Math.round(event.percent);
    return {
        title: `${shortProviderName(event.providerName)} — ${event.windowLabel}`,
        body: remaining
            ? `${percent}% usado · ${stateLabel} — renova em ${remaining}`
            : `${percent}% usado · ${stateLabel}`,
    };
}
