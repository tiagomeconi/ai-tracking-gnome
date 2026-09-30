// Parser puro (sem I/O) do resultado JSON-RPC de `account/rateLimits/read`
// respondido por `codex app-server --stdio`. Interface não documentada
// publicamente pela OpenAI como API externa — formato verificado a partir
// do projeto open-source tokidachi (github.com/Gaalbu/tokidachi, MIT), que
// implementa a mesma integração. Ver docs/providers/chatgpt.md e ADR-007.

function windowLabel(windowName, durationMins) {
    if (typeof durationMins !== 'number' || durationMins === 0)
        return windowName.charAt(0).toUpperCase() + windowName.slice(1);

    let period;
    if (durationMins % 10080 === 0)
        period = `${durationMins / 10080} semana(s)`;
    else if (durationMins % 1440 === 0)
        period = `${durationMins / 1440} dia(s)`;
    else if (durationMins % 60 === 0)
        period = `${durationMins / 60} hora(s)`;
    else
        period = `${durationMins} minuto(s)`;

    return `Janela de ${period}`;
}

function normalizeResetsAt(value) {
    if (value == null)
        return undefined;
    if (typeof value === 'number')
        return new Date(value * 1000).toISOString();
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function clampPercent(raw) {
    return Math.max(0, Math.min(100, raw));
}

/**
 * @param {unknown} result - campo `result` da resposta JSON-RPC de
 *   `account/rateLimits/read`
 * @returns {import('../types.js').UsageWindow[]}
 */
export function parseCodexRateLimits(result) {
    const rawBuckets = result?.rateLimitsByLimitId;
    let normalized = {};

    if (rawBuckets && typeof rawBuckets === 'object' && Object.keys(rawBuckets).length > 0) {
        normalized = rawBuckets;
    } else if (result?.rateLimits && typeof result.rateLimits === 'object') {
        normalized[result.rateLimits.limitId ?? 'codex'] = result.rateLimits;
    }

    const entries = Object.entries(normalized).sort(([a], [b]) => {
        if (a === 'codex' && b !== 'codex')
            return -1;
        if (b === 'codex' && a !== 'codex')
            return 1;
        return a.localeCompare(b);
    });

    const windows = [];

    for (const [bucketName, bucket] of entries) {
        if (!bucket || typeof bucket !== 'object')
            continue;

        const displayName = (typeof bucket.limitName === 'string' && bucket.limitName.trim())
            || (bucketName === 'codex' ? 'Codex' : bucketName);

        for (const windowName of ['primary', 'secondary']) {
            const value = bucket[windowName];
            if (!value || typeof value !== 'object')
                continue;

            const percentRaw = value.usedPercent;
            if (typeof percentRaw !== 'number' || !Number.isFinite(percentRaw))
                continue;

            let label = windowLabel(windowName, value.windowDurationMins);
            if (entries.length > 1)
                label = `${displayName} · ${label}`;

            windows.push({
                id: `${bucketName}-${windowName}`,
                label,
                unit: 'percentage',
                percent: clampPercent(percentRaw),
                window: 'unknown',
                resetsAt: normalizeResetsAt(value.resetsAt),
                estimated: false,
            });
        }

        const individual = bucket.individualLimit;
        if (individual && typeof individual === 'object' && typeof individual.remainingPercent === 'number') {
            const used = clampPercent(100 - individual.remainingPercent);
            const label = entries.length > 1 ? `${displayName} · Limite individual` : 'Limite individual';
            windows.push({
                id: `${bucketName}-individual`,
                label,
                unit: 'percentage',
                percent: used,
                window: 'unknown',
                resetsAt: normalizeResetsAt(individual.resetsAt),
                estimated: false,
            });
        }
    }

    return windows;
}
