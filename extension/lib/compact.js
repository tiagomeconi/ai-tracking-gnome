// Dados dos resumos compactos (widget flutuante e indicador da barra),
// sem dependência de GJS. Escolhe qual janela de cada IA aparece e monta
// o texto de renovação ("renova em 2 h").

import { pickWindow, visualStateFromPercent, selectMostCritical } from './normalizer.js';
import { formatRemaining, shortProviderName } from './format.js';

/**
 * @param {object[]} usages - AIProviderUsage[] já filtrados pelos providers ativos.
 * @param {Record<string, string>} windowChoices - providerId -> id da janela ('auto' ou ausente = maior consumo).
 */
export function buildCompactRows(usages, windowChoices = {}, now = new Date()) {
    return usages.map((usage) => {
        const picked = pickWindow(usage, windowChoices[usage.providerId] ?? 'auto');
        const remaining = picked ? formatRemaining(picked.window.resetsAt, now) : null;
        return {
            providerId: usage.providerId,
            name: shortProviderName(usage.providerName),
            label: picked?.window.label ?? null,
            percent: picked ? Math.round(picked.percent) : null,
            state: picked ? visualStateFromPercent(picked.percent) : 'unknown',
            resetText: remaining ? `renova em ${remaining}` : null,
        };
    });
}

/**
 * Leitura do indicador da barra: a IA escolhida (pico das janelas dela) ou,
 * em 'auto' / se a escolhida não está ativa, a mais crítica. Uma IA escolhida
 * sem dado retorna percent null (indicador mostra "—").
 */
export function buildPanelReading(usages, providerId = 'auto') {
    if (providerId !== 'auto') {
        const usage = usages.find((u) => u.providerId === providerId);
        if (usage) {
            const picked = pickWindow(usage);
            return {
                name: shortProviderName(usage.providerName),
                percent: picked ? Math.round(picked.percent) : null,
                state: picked ? visualStateFromPercent(picked.percent) : 'unknown',
            };
        }
    }
    const best = selectMostCritical(usages);
    return best
        ? { name: shortProviderName(best.provider.providerName), percent: Math.round(best.percent), state: visualStateFromPercent(best.percent) }
        : null;
}

/** providerId -> [{id,label}] das janelas atuais, para a janela de preferências. */
export function knownWindows(usages) {
    return Object.fromEntries(usages.map((u) => [u.providerId, (u.windows ?? []).map((w) => ({ id: w.id, label: w.label }))]));
}
