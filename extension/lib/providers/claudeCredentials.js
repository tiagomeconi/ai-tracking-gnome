// Função pura (sem I/O/GJS) que interpreta o conteúdo de
// `.credentials.json` do Claude Code. O access token dura ~8 h e só o
// próprio Claude Code o renova (quando é usado) — se ele ficou parado por
// mais tempo, o token vence e a API responde 401. Checar `expiresAt` antes
// de chamar a rede permite avisar "sessão expirada" em vez de gastar uma
// requisição que já se sabe que falha.

// Margem para não enviar um token que vence durante a requisição.
export const EXPIRY_SKEW_MS = 60_000;

/**
 * @param {unknown} json - conteúdo já parseado do arquivo de credenciais.
 * @param {number} [nowMs]
 * @returns {{ token: string, expired: boolean } | null} `null` se não há token.
 */
export function parseClaudeCredentials(json, nowMs = Date.now()) {
    const oauth = json?.claudeAiOauth;
    const token = oauth?.accessToken;
    if (typeof token !== 'string' || token.length === 0)
        return null;

    const expiresAt = oauth.expiresAt;
    const expired = typeof expiresAt === 'number' && expiresAt - EXPIRY_SKEW_MS <= nowMs;
    return { token, expired };
}
