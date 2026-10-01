// AntigravitySubscriptionProvider — provider EXPERIMENTAL (seção 2.1 do
// plano).
//
// Reaproveita o token OAuth que o próprio Antigravity CLI oficial
// (antigravity.google, binário `agy`) já grava no Secret Service do
// sistema (GNOME Keyring/D-Bus) ao fazer login — o mesmo keyring que o
// próprio CLI usa para chamar `https://cloudcode-pa.googleapis.com`, o
// backend real por trás do comando `/usage`/`/quota` do CLI. Retorna o
// percentual REAL de cota por modelo, não uma estimativa local.
//
// NÃO é captura de cookie de sessão web (proibido pela seção 2.1): o token
// foi criado pelo próprio login oficial do Antigravity CLI e já está no
// keyring do sistema, com as mesmas permissões que o próprio CLI usa para
// lê-lo — mesmo padrão adotado em claudeSubscription.js/codexSubscription.js.
// Este provider só LÊ o item do Secret Service; nunca escreve nele nem o
// recria.
//
// O item do Antigravity CLI no keyring usa o schema genérico
// `org.freedesktop.Secret.Generic` com os atributos `service=gemini` e
// `username=antigravity` (confirmado manualmente via `secret-tool search`
// nesta máquina) — não o schema próprio deste projeto (`io.prohound....`,
// ver lib/secrets.js). Por isso a leitura usa
// `Secret.SchemaFlags.DONT_MATCH_NAME`: o item foi criado pelo Antigravity
// CLI diretamente via Secret Service, não por libsecret com um
// `Secret.Schema` nomeado, então o nome do schema não deve ser exigido no
// lookup.
//
// Endpoint (`/v1internal:loadCodeAssist`, `/v1internal:fetchAvailableModels`)
// não documentado publicamente pelo Google — formato de requisição/resposta
// verificado a partir do projeto open-source antigravity-usage
// (github.com/skainguyen1412/antigravity-usage, MIT), que implementa a
// mesma integração (papel equivalente ao tokidachi para Claude/Codex). Ver
// docs/providers/gemini.md e ADR-007.
//
// NUNCA loga o valor do token.
//
// Sem refresh de token: se o access token estiver expirado, a API retorna
// 401 e este provider reporta `auth_required` — o usuário precisa apenas
// abrir o Antigravity CLI normalmente (`agy`) para que ele renove o token
// sozinho no keyring, exatamente como já acontece com Claude Code/Codex.
// Implementar refresh aqui exigiria um client_id/client_secret OAuth
// próprio, que não temos para o Antigravity CLI oficial.
//
// NÃO validado contra uma execução real dentro do GNOME Shell (este
// ambiente de desenvolvimento não tem GJS) — validar manualmente, em
// especial a leitura via Secret Service com `DONT_MATCH_NAME`.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import { UsageProvider } from './provider.js';
import { parseAntigravityQuota } from './antigravitySubscriptionParser.js';

try {
    Gio._promisify(Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish');
} catch {
    // já promisificado nesta versão/carregamento do GJS — ok ignorar.
}

const CLOUDCODE_BASE_URL = 'https://cloudcode-pa.googleapis.com';
const USER_AGENT = 'antigravity';
const METADATA = {
    ideType: 'ANTIGRAVITY',
    platform: 'PLATFORM_UNSPECIFIED',
    pluginType: 'GEMINI',
};
const KEYRING_SCHEMA_NAME = 'io.prohound.AIUsageMonitor.AntigravityForeignCredential';
const KEYRING_ATTRIBUTES = { service: 'gemini', username: 'antigravity' };
const TIMEOUT_SECONDS = 15;

function extractProjectId(value) {
    if (typeof value === 'string' && value.length > 0)
        return value;
    if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.length > 0)
        return value.id;
    return undefined;
}

export class AntigravitySubscriptionProvider extends UsageProvider {
    constructor(id = 'gemini', name = 'Antigravity') {
        super(id, name);
        this._session = new Soup.Session({ timeout: TIMEOUT_SECONDS });
        this._Secret = null;
        this._schema = null;
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
            this._logError(error, 'AntigravitySubscriptionProvider: falha ao chamar loadCodeAssist');
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
            // O detalhamento por modelo pode exigir uma permissão diferente
            // da de `loadCodeAssist`; seguimos mesmo assim para ainda expor
            // os créditos de prompt, replicando o comportamento do
            // antigravity-usage de referência.
            this._logError(error, 'AntigravitySubscriptionProvider: falha ao chamar fetchAvailableModels');
        }

        const windows = parseAntigravityQuota(codeAssistResponse, modelsResponse);
        if (windows.length === 0)
            return this._result('error', [], 'PROVIDER_INVALID_RESPONSE');

        return this._result('ok', windows);
    }

    async _post(accessToken, path, body) {
        const message = Soup.Message.new('POST', `${CLOUDCODE_BASE_URL}${path}`);
        message.request_headers.append('Authorization', `Bearer ${accessToken}`);
        message.request_headers.append('User-Agent', USER_AGENT);
        message.set_request_body_from_bytes(
            'application/json',
            GLib.Bytes.new(new TextEncoder().encode(JSON.stringify(body)))
        );

        let bytes;
        try {
            bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        } catch (error) {
            throw Object.assign(new Error('Falha de rede ao chamar a Cloud Code API'), {
                code: 'PROVIDER_UNAVAILABLE',
                cause: error,
            });
        }

        // Ver comentário equivalente em claudeSubscription.js: `statusCode`
        // (propriedade GObject) evita a exceção que `get_status()` lança
        // para códigos HTTP fora do enum Soup.Status nesta versão do
        // libsoup.
        const status = message.statusCode;
        if (status === 401 || status === 403)
            throw Object.assign(new Error('Antigravity CLI não autenticado; rode `agy` e faça login novamente'), {
                code: 'PROVIDER_AUTH_REQUIRED',
            });
        if (status === 429)
            throw Object.assign(new Error('Cloud Code API retornou rate limit'), { code: 'PROVIDER_RATE_LIMITED' });
        if (status < 200 || status >= 300)
            throw Object.assign(new Error(`Cloud Code API retornou status ${status}`), {
                code: 'PROVIDER_INVALID_RESPONSE',
            });

        try {
            return JSON.parse(new TextDecoder('utf-8').decode(bytes.get_data()));
        } catch (error) {
            throw Object.assign(new Error('Resposta inválida da Cloud Code API'), {
                code: 'PROVIDER_INVALID_RESPONSE',
                cause: error,
            });
        }
    }

    async _readAccessToken() {
        const Secret = await this._ensureSecret();
        if (!Secret)
            return null; // libsecret indisponível neste ambiente — tratado como não configurado

        let raw;
        try {
            raw = await new Promise((resolve, reject) => {
                // GJS expõe a variante GI-friendly `secret_password_lookupv`
                // (C) sob o nome sem "v" — confirmado em runtime real
                // (`Secret.password_lookupv is not a function`; ver
                // ADR-008, adendo de validação em GNOME Shell real).
                Secret.password_lookup(this._schema, KEYRING_ATTRIBUTES, null, (_source, result) => {
                    try {
                        resolve(Secret.password_lookup_finish(result) ?? null);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        } catch (error) {
            this._logError(error, 'AntigravitySubscriptionProvider: falha ao ler o Secret Service');
            return null;
        }

        if (!raw)
            return null; // Antigravity CLI nunca logado nesta máquina, ou item removido (ex.: `/logout`)

        try {
            const parsed = JSON.parse(raw);
            const accessToken = parsed?.token?.access_token;
            return typeof accessToken === 'string' && accessToken.length > 0 ? accessToken : null;
        } catch {
            return null;
        }
    }

    async _ensureSecret() {
        if (this._Secret)
            return this._Secret;

        try {
            const module = await import('gi://Secret');
            this._Secret = module.default ?? module;
        } catch {
            return null;
        }

        this._schema = new this._Secret.Schema(
            KEYRING_SCHEMA_NAME,
            this._Secret.SchemaFlags.DONT_MATCH_NAME,
            { service: this._Secret.SchemaAttributeType.STRING, username: this._Secret.SchemaAttributeType.STRING }
        );

        return this._Secret;
    }

    _result(status, windows, errorCode) {
        return {
            providerId: this.id,
            providerName: this.name,
            manageUrl: 'https://antigravity.google/',
            status,
            windows,
            fetchedAt: new Date().toISOString(),
            stale: false,
            errorCode,
        };
    }

    _logError(error, message) {
        const log = typeof logError === 'function' ? logError : console.error;
        log(error, message);
    }
}
