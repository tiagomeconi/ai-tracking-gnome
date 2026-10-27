// ClaudeSubscriptionProvider (versão Node/Electron) — EXPERIMENTAL, ver
// extension/lib/providers/claudeSubscription.js e ADR-007. Lê o token OAuth
// que o próprio Claude Code já gravou em <claudeConfigDir>/.credentials.json
// (`claude auth login`) e chama o mesmo endpoint de `/usage`. Nunca loga o
// token; nunca escreve no arquivo.
//
// No macOS o Claude Code guarda a credencial no Keychain, não em arquivo —
// não suportado aqui (cai em "autenticação necessária").

import fs from 'node:fs/promises';
import path from 'node:path';

import { UsageProvider } from '../../shared/providers/provider.js';
import { parseClaudeUsage } from '../../shared/providers/claudeSubscriptionParser.js';
import { claudeConfigDir } from '../paths.js';
import { makeResult, logError } from './result.js';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const BETA_HEADER = 'oauth-2025-04-20';
const TIMEOUT_MS = 15_000;
const MANAGE_URL = 'https://claude.ai/settings/usage';

// Cooldown após 429 quando a resposta não traz `Retry-After` (seção 8.3:
// respeitar rate limits) — o scheduler de 5 min não deve insistir.
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30 * 60_000;

/** `Retry-After` (segundos ou data HTTP) -> ms, ou null se ausente/ilegível. */
export function parseRetryAfterMs(raw, now = Date.now()) {
    if (!raw)
        return null;
    const seconds = Number(raw.trim());
    if (Number.isFinite(seconds) && seconds >= 0)
        return seconds * 1000;
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) {
        const diff = parsed - now;
        return diff > 0 ? diff : null;
    }
    return null;
}

export class ClaudeSubscriptionProvider extends UsageProvider {
    constructor({
        id = 'claude',
        name = 'Claude',
        credentialsPath = path.join(claudeConfigDir(), '.credentials.json'),
        fetchImpl = globalThis.fetch,
    } = {}) {
        super(id, name);
        this._credentialsPath = credentialsPath;
        this._fetch = fetchImpl;
        this._rateLimitedUntilMs = 0;
    }

    async isConfigured() {
        return (await this._readToken()) !== null;
    }

    async healthCheck() {
        return this.isConfigured();
    }

    async fetchUsage() {
        if (this._rateLimitedUntilMs > Date.now())
            return this._result('error', [], 'PROVIDER_RATE_LIMITED');

        const token = await this._readToken();
        if (!token)
            return this._result('auth_required', [], 'PROVIDER_AUTH_REQUIRED');

        let response;
        let bodyText;
        try {
            response = await this._fetch(USAGE_URL, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'anthropic-beta': BETA_HEADER,
                    'User-Agent': 'ai-usage-monitor-desktop',
                },
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            bodyText = await response.text();
        } catch (error) {
            logError(error, 'ClaudeSubscriptionProvider: falha de rede');
            return this._result('error', [], error?.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE');
        }

        const status = response.status;
        if (status === 401)
            return this._result('auth_required', [], 'PROVIDER_AUTH_REQUIRED');

        if (status === 429) {
            const cooldownMs = parseRetryAfterMs(response.headers.get('retry-after')) ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
            this._rateLimitedUntilMs = Date.now() + cooldownMs;
            logError(new Error(`status 429, cooldown de ${Math.round(cooldownMs / 60_000)} min`), 'ClaudeSubscriptionProvider: rate limited');
            return this._result('error', [], 'PROVIDER_RATE_LIMITED');
        }

        if (status < 200 || status >= 300) {
            logError(new Error(`status ${status}`), 'ClaudeSubscriptionProvider: resposta com status de erro');
            return this._result('error', [], 'PROVIDER_INVALID_RESPONSE');
        }

        let payload;
        try {
            payload = JSON.parse(bodyText);
        } catch (error) {
            logError(error, 'ClaudeSubscriptionProvider: resposta inválida');
            return this._result('error', [], 'PROVIDER_INVALID_RESPONSE');
        }

        const windows = parseClaudeUsage(payload);
        if (windows.length === 0) {
            logError(new Error('payload sem janelas reconhecidas'), 'ClaudeSubscriptionProvider: parseClaudeUsage retornou vazio');
            return this._result('error', [], 'PROVIDER_INVALID_RESPONSE');
        }

        return this._result('ok', windows);
    }

    async _readToken() {
        try {
            const json = JSON.parse(await fs.readFile(this._credentialsPath, 'utf8'));
            const token = json?.claudeAiOauth?.accessToken;
            return typeof token === 'string' && token.length > 0 ? token : null;
        } catch {
            return null; // ausente/ilegível — tratado como não configurado
        }
    }

    _result(status, windows, errorCode) {
        return makeResult(this, MANAGE_URL, status, windows, errorCode);
    }
}
