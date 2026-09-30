// Parser puro (sem I/O) da resposta de https://api.anthropic.com/api/oauth/usage.
// Endpoint não documentado publicamente pela Anthropic — formato de
// resposta verificado a partir do projeto open-source tokidachi
// (github.com/Gaalbu/tokidachi, MIT), que implementa a mesma integração.
// Ver docs/providers/claude.md e ADR-007.

const WINDOW_LABELS = {
    five_hour: 'Janela de 5 horas',
    seven_day: 'Janela de 7 dias',
    seven_day_sonnet: 'Janela de 7 dias (Sonnet)',
    seven_day_opus: 'Janela de 7 dias (Opus)',
};

const WINDOW_KIND = {
    five_hour: '5h',
    seven_day: 'week',
    seven_day_sonnet: 'week',
    seven_day_opus: 'week',
};

function normalizeResetsAt(value) {
    if (value == null)
        return undefined;
    if (typeof value === 'number')
        return new Date(value * 1000).toISOString(); // epoch seconds
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function clampPercent(raw) {
    return Math.max(0, Math.min(100, raw));
}

/**
 * @param {unknown} payload - JSON já parseado da resposta do endpoint
 * @returns {import('../types.js').UsageWindow[]}
 */
export function parseClaudeUsage(payload) {
    const windows = [];

    for (const [key, label] of Object.entries(WINDOW_LABELS)) {
        const value = payload?.[key];
        if (!value || typeof value !== 'object')
            continue;

        const percentRaw = typeof value.utilization === 'number' ? value.utilization : value.used_percentage;
        if (typeof percentRaw !== 'number' || !Number.isFinite(percentRaw))
            continue;

        windows.push({
            id: key,
            label,
            unit: 'percentage',
            percent: clampPercent(percentRaw),
            window: WINDOW_KIND[key] ?? 'unknown',
            resetsAt: normalizeResetsAt(value.resets_at),
            estimated: false, // percentual real vindo do backend, não estimado localmente
        });
    }

    return windows;
}
