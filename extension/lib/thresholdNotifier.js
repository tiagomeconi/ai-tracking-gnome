// Função pura (sem I/O/GJS) que decide quando emitir uma notificação de
// limite de uso (backlog P2: "Notificação de limite"). Notifica uma única
// vez por janela quando o percentual cruza, de baixo pra cima, o limite
// escolhido pelo usuário nas preferências (`notification-threshold-percent`
// no gschema, padrão `DEFAULT_THRESHOLD_PERCENT`) — não repete a cada
// refresh enquanto ficar acima do limite, e volta a poder notificar depois
// que a janela reseta (percentual cai de volta abaixo do limite).
//
// Esse limite é independente dos thresholds de cor da UI
// (`USAGE_THRESHOLDS` em types.js) — o usuário pode querer ser avisado em
// 60% mesmo que a barra só fique "crítica" visualmente em 95%.

import { computePercent, visualStateFromPercent } from './normalizer.js';

export const DEFAULT_THRESHOLD_PERCENT = 80;

/**
 * @typedef {Object} ThresholdEvent
 * @property {string} providerId
 * @property {string} providerName
 * @property {string} windowId
 * @property {string} windowLabel
 * @property {number} percent
 * @property {import('./normalizer.js').VisualState} state
 * @property {string} [resetsAt]
 */

/**
 * @param {import('./types.js').AIProviderUsage[]} usages
 * @param {Record<string, boolean>} [previousAboveThreshold] - chave
 *   `${providerId}::${windowId}` -> já estava acima do limite (e já foi
 *   notificada) na checagem anterior. Providers com status diferente de
 *   "ok" são ignorados por completo (nem geram evento, nem atualizam o
 *   estado) — um erro transitório não deve apagar o progresso já
 *   observado.
 * @param {number} [thresholdPercent]
 * @returns {{ events: ThresholdEvent[], nextAboveThreshold: Record<string, boolean> }}
 */
export function computeThresholdEvents(usages, previousAboveThreshold = {}, thresholdPercent = DEFAULT_THRESHOLD_PERCENT) {
    const events = [];
    const nextAboveThreshold = { ...previousAboveThreshold };

    for (const usage of usages) {
        if (usage.status !== 'ok')
            continue;

        for (const window of usage.windows ?? []) {
            const percent = computePercent(window);
            if (typeof percent !== 'number')
                continue;

            const key = `${usage.providerId}::${window.id}`;
            const wasAbove = previousAboveThreshold[key] === true;
            const isAbove = percent >= thresholdPercent;

            if (isAbove && !wasAbove) {
                events.push({
                    providerId: usage.providerId,
                    providerName: usage.providerName,
                    windowId: window.id,
                    windowLabel: window.label,
                    percent,
                    state: visualStateFromPercent(percent),
                    resetsAt: window.resetsAt,
                });
            }

            nextAboveThreshold[key] = isAbove;
        }
    }

    return { events, nextAboveThreshold };
}
