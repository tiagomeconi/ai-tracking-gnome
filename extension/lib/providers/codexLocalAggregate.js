// Agregação pura (sem I/O) do uso de tokens local do Codex CLI, a partir de
// linhas já lidas de `~/.codex/state_5.sqlite` (tabela `threads`). Ver
// docs/providers/chatgpt.md — EXPERIMENTAL (seção 2.1): mede tokens usados
// em threads locais do Codex, NÃO a cota da assinatura ChatGPT nem da API
// para desenvolvedores. `token_budget` (em `goals_1.sqlite`) parece ser um
// orçamento por thread/tarefa, não o limite da conta — por isso não é
// usado como `limit` aqui (não fabricar cota sem confirmação oficial).

/**
 * @param {Array<{tokens_used?: number, updated_at_ms?: number}>} rows
 * @param {number} windowMs
 * @param {Date} now
 */
export function aggregateThreadTokens(rows, windowMs, now = new Date()) {
    const cutoff = now.getTime() - windowMs;
    let totalTokens = 0;
    let threadCount = 0;

    for (const row of rows ?? []) {
        const updatedAtMs = row?.updated_at_ms;
        const tokensUsed = row?.tokens_used;

        if (typeof updatedAtMs !== 'number' || updatedAtMs < cutoff)
            continue;
        if (typeof tokensUsed !== 'number')
            continue;

        totalTokens += tokensUsed;
        threadCount += 1;
    }

    return { totalTokens, threadCount };
}
