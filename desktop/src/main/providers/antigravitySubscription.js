// AntigravitySubscriptionProvider (versão Node/Electron) — EXPERIMENTAL, ver
// extension/lib/providers/antigravitySubscription.js e ADR-008. Lê o token
// OAuth que o Antigravity CLI (`agy`) gravou no keyring do sistema
// (credentials.js) e chama os mesmos endpoints internos do `/usage`. Sem
// refresh de token: se expirou, reporta `auth_required` até o `agy` ser
// reaberto. Nunca loga nem persiste o token.

import { UsageProvider } from '../../shared/providers/provider.js';
import { parseAntigravityQuota } from '../../shared/providers/antigravitySubscriptionParser.js';
import { readKeyringSecret } from '../credentials.js';
import { makeResult, logError } from './result.js';

const CLOUDCODE_BASE_URL = 'https://cloudcode-pa.googleapis.com';
const USER_AGENT = 'antigravity';
const METADATA = {
    ideType: 'ANTIGRAVITY',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
};
const KEYRING_ATTRIBUTES = { service: 'gemini', username: 'antigravity' };
const TIMEOUT_MS = 15_000;
const MANAGE_URL = 'https://antigravity.google/';

function extractProjectId(value) {
    if (typeof value === 'string' && value.length > 0)
        return value;
    if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.length > 0)
        return value.id;
    return undefined;
}

/** Extrai `token.access_token` do JSON guardado pelo `agy` no keyring. */
export function extractAccessToken(rawSecret) {
    try {
        const accessToken = JSON.parse(rawSecret)?.token?.access_token;
        return typeof accessToken === 'string' && accessToken.length > 0 ? accessToken : null;
    } catch {
        return null;
    }
}

export class AntigravitySubscriptionProvider extends UsageProvider {
    constructor({
        id = 'gemini',
        name = 'Antigravity',
        fetchImpl = globalThis.fetch,
        readSecret = readKeyringSecret,
    } = {}) {
        super(id, name);
        this._fetch = fetchImpl;
        this._readSecret = readSecret;
    }

    async isConfigured() {
        return (await this._readAccessToken()) !== null;
    }

    async healthCheck() {
        return this.isConfigured();
    }

    async fetchUsage() {
        const accessToken = await this._readAccessToken();
        if (!accessToken)
            return this._result('auth_required', [], 'PROVIDER_AUTH_REQUIRED');

        let codeAssistResponse;
        try {
            codeAssistResponse = await this._post(accessToken, '/v1internal:loadCodeAssist', { metadata: METADATA });
        } catch (error) {
            if (error?.code === 'PROVIDER_AUTH_REQUIRED')
                return this._result('auth_required', [], 'PROVIDER_AUTH_REQUIRED');
            logError(error, 'AntigravitySubscriptionProvider: falha ao chamar loadCodeAssist');
            return this._result('error', [], error?.code ?? 'PROVIDER_UNAVAILABLE');
        }

        const projectId = extractProjectId(codeAssistResponse?.cloudaicompanionProject);

        let modelsResponse = {};
        try {
            modelsResponse = await this._post(
                accessToken,
                '/v1internal:fetchAvailableModels',
                projectId ? { project: projectId } : {}
            );
        } catch (error) {
            // Detalhamento por modelo pode exigir outra permissão; segue só
            // com os créditos de prompt (mesmo comportamento da extensão).
            logError(error, 'AntigravitySubscriptionProvider: falha ao chamar fetchAvailableModels');
        }

        const windows = parseAntigravityQuota(codeAssistResponse, modelsResponse);
        if (windows.length === 0)
            return this._result('error', [], 'PROVIDER_INVALID_RESPONSE');

        return this._result('ok', windows);
    }

    async _post(accessToken, path, body) {
        let response;
        try {
            response = await this._fetch(`${CLOUDCODE_BASE_URL}${path}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': USER_AGENT,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
        } catch (error) {
            throw Object.assign(new Error('Falha de rede ao chamar a Cloud Code API'), {
                code: error?.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE',
            });
        }

        const status = response.status;
        if (status === 401 || status === 403)
            throw Object.assign(new Error('Antigravity CLI não autenticado; rode `agy` e faça login novamente'), { code: 'PROVIDER_AUTH_REQUIRED' });
        if (status === 429)
            throw Object.assign(new Error('Cloud Code API retornou rate limit'), { code: 'PROVIDER_RATE_LIMITED' });
        if (status < 200 || status >= 300)
            throw Object.assign(new Error(`Cloud Code API retornou status ${status}`), { code: 'PROVIDER_INVALID_RESPONSE' });

        try {
            return await response.json();
        } catch {
            throw Object.assign(new Error('Resposta inválida da Cloud Code API'), { code: 'PROVIDER_INVALID_RESPONSE' });
        }
    }

    async _readAccessToken() {
        const raw = await this._readSecret(KEYRING_ATTRIBUTES);
        return raw ? extractAccessToken(raw) : null;
    }

    _result(status, windows, errorCode) {
        return makeResult(this, MANAGE_URL, status, windows, errorCode);
    }
}
