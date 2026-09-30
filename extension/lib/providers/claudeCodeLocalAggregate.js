// Agregação pura (sem I/O) do uso de tokens local do Claude Code, a partir
// de linhas JSONL já lidas do disco. Ver docs/providers/claude.md — este é
// um provider EXPERIMENTAL (seção 2.1): mede volume de tokens processados
// localmente pelo Claude Code, NÃO a cota real da assinatura claude.ai
// (que a Anthropic não expõe via API, ver ficha de pesquisa). Nunca tratar
// isso como equivalente ao "quanto da assinatura já foi consumido".

/**
 * Extrai os campos de uso de uma linha JSONL de transcript do Claude Code.
 * Retorna null para linhas que não são mensagens de assistente com uso
 * (ex.: eventos de fila, mensagens de usuário, JSON malformado).
 */
export function extractUsageFromLine(line) {
    let entry;
    try {
        entry = JSON.parse(line);
    } catch {
        return null;
    }

    if (entry?.type !== 'assistant')
        return null;

    const usage = entry.message?.usage;
    if (!usage || typeof entry.timestamp !== 'string')
        return null;

    return {
        timestamp: entry.timestamp,
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheCreationTokens: usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    };
}

function totalTokensOf(entry) {
    return entry.inputTokens + entry.outputTokens + entry.cacheCreationTokens + entry.cacheReadTokens;
}

/**
 * Agrega linhas JSONL (de um ou mais arquivos) em um total de tokens dentro
 * de uma janela rolling de `windowMs` terminando em `now`.
 * @param {string[]} lines
 * @param {number} windowMs
 * @param {Date} now
 */
export function aggregateUsage(lines, windowMs, now = new Date()) {
    const cutoff = now.getTime() - windowMs;
    let totalTokens = 0;
    let messageCount = 0;
    let latestTimestamp = null;

    for (const line of lines) {
        const entry = extractUsageFromLine(line);
        if (!entry)
            continue;

        const ts = Date.parse(entry.timestamp);
        if (Number.isNaN(ts) || ts < cutoff)
            continue;

        totalTokens += totalTokensOf(entry);
        messageCount += 1;
        if (latestTimestamp === null || ts > Date.parse(latestTimestamp))
            latestTimestamp = entry.timestamp;
    }

    return { totalTokens, messageCount, latestTimestamp };
}
