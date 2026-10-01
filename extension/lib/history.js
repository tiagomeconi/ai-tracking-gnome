// Funções puras (sem I/O) para o histórico local de uso (seção 16,
// backlog P2: "Histórico local opcional"): parsing/serialização de um
// arquivo JSONL (uma amostra por linha) e a política de retenção. A
// persistência real (leitura/escrita de arquivo) fica em historyStore.js,
// que depende de GJS — mantém esta camada testável com Node puro (seção
// 13.1 do plano).

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_SAMPLES = 20000; // proteção contra arquivo gigante mesmo se a retenção por data falhar (ex.: relógio do sistema errado)

/**
 * @typedef {Object} HistorySample
 * @property {string} timestamp - ISO 8601
 * @property {string} providerId
 * @property {string} windowId
 * @property {string} windowLabel
 * @property {number} percent
 */

/** Parseia um arquivo JSONL, ignorando linhas vazias/corrompidas em vez de derrubar o arquivo inteiro. */
export function parseHistoryText(text) {
    if (!text)
        return [];

    const samples = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;

        try {
            const sample = JSON.parse(trimmed);
            if (
                sample &&
                typeof sample.timestamp === 'string' &&
                typeof sample.providerId === 'string' &&
                typeof sample.windowId === 'string' &&
                typeof sample.percent === 'number'
            )
                samples.push(sample);
        } catch {
            // linha corrompida/truncada (ex.: gravação interrompida) — ignora
        }
    }
    return samples;
}

/** Serializa amostras de volta pra JSONL (uma por linha, terminado em \n). */
export function serializeHistory(samples) {
    if (samples.length === 0)
        return '';
    return samples.map((s) => JSON.stringify(s)).join('\n') + '\n';
}

/**
 * Aplica retenção: remove amostras mais antigas que `retentionDays` e, se
 * ainda sobrar mais que `maxSamples`, corta as mais antigas primeiro.
 */
export function pruneHistory(samples, { retentionDays = DEFAULT_RETENTION_DAYS, maxSamples = DEFAULT_MAX_SAMPLES, now = new Date() } = {}) {
    const cutoffMs = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;
    const kept = samples.filter((s) => {
        const ms = Date.parse(s.timestamp);
        return !Number.isNaN(ms) && ms >= cutoffMs;
    });

    if (kept.length <= maxSamples)
        return kept;

    // Mantém as mais recentes — a lista pode não estar ordenada, então
    // ordena antes de cortar o excedente mais antigo.
    return kept
        .slice()
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
        .slice(kept.length - maxSamples);
}

/**
 * Converte uma lista de `AIProviderUsage` (seção 4 do plano) nas amostras
 * do instante atual. Só providers com status "ok" entram — erro/auth/
 * indisponível não tem percent confiável pra registrar como ponto de
 * histórico (evitaria um "0%" falso no gráfico).
 *
 * @param {import('./types.js').AIProviderUsage[]} usages
 * @param {Date} [now]
 * @returns {HistorySample[]}
 */
export function samplesFromUsages(usages, now = new Date()) {
    const timestamp = now.toISOString();
    const samples = [];

    for (const usage of usages) {
        if (usage.status !== 'ok')
            continue;

        for (const window of usage.windows ?? []) {
            if (typeof window.percent !== 'number')
                continue;

            samples.push({
                timestamp,
                providerId: usage.providerId,
                windowId: window.id,
                windowLabel: window.label,
                percent: window.percent,
            });
        }
    }

    return samples;
}

/** Lista as séries distintas (provider+janela) presentes no histórico, pro seletor da UI. */
export function listHistorySeries(samples) {
    const seen = new Map();
    for (const s of samples) {
        const key = `${s.providerId}::${s.windowId}`;
        if (!seen.has(key))
            seen.set(key, { providerId: s.providerId, windowId: s.windowId, windowLabel: s.windowLabel });
    }
    return [...seen.values()];
}
