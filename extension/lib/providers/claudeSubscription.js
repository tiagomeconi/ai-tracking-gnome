// ClaudeSubscriptionProvider — provider EXPERIMENTAL (seção 2.1 do plano).
//
// Reaproveita o token OAuth que o próprio Claude Code CLI já grava
// localmente (via `claude auth login`) para chamar
// `https://api.anthropic.com/api/oauth/usage` — o mesmo endpoint que o
// Claude Code usa internamente para o comando `/usage`. Retorna o
// percentual REAL da cota da assinatura, não uma estimativa local.
//
// NÃO é captura de cookie de sessão web (proibido pela seção 2.1): o token
// foi criado pelo próprio login oficial do CLI e já está em disco, com as
// mesmas permissões que o próprio Claude Code usa para lê-lo. O endpoint
// em si não é documentado publicamente pela Anthropic — formato de
// requisição/resposta verificado a partir do projeto open-source
// tokidachi (github.com/Gaalbu/tokidachi, MIT), que implementa a mesma
// integração. Ver ADR-007.
//
// NUNCA loga o valor do token. Este provider só lê o arquivo de
// credenciais; nunca escreve nele.
//
// NÃO validado contra uma execução real dentro do GNOME Shell (este
// ambiente de desenvolvimento não tem GJS) — validar manualmente.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup?version=3.0';

import { UsageProvider } from './provider.js';
import { parseClaudeUsage } from './claudeSubscriptionParser.js';

for (const [proto, asyncName, finishName] of [
    [Gio.File.prototype, 'load_contents_async', 'load_contents_finish'],
    [Soup.Session.prototype, 'send_and_read_async', 'send_and_read_finish'],
]) {
    try {
        Gio._promisify(proto, asyncName, finishName);
    } catch {
        // já promisificado nesta versão/carregamento do GJS — ok ignorar.
    }
}

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const BETA_HEADER = 'oauth-2025-04-20';
const TIMEOUT_SECONDS = 15;

export class ClaudeSubscriptionProvider extends UsageProvider {
    constructor(
        id = 'claude',
        name = 'Claude',
        credentialsPath = GLib.build_filenamev([GLib.get_home_dir(), '.claude', '.credentials.json'])
    ) {
        super(id, name);
        this._credentialsPath = credentialsPath;
        this._session = new Soup.Session({ timeout: TIMEOUT_SECONDS });
    }

    async isConfigured() {
        return (await this._readToken()) !== null;
    }

    async healthCheck() {
        return this.isConfigured();
    }

    async fetchUsage() {
        const token = await this._readToken();
        if (!token)
            return this._result('auth_required', [], 'PROVIDER_AUTH_REQUIRED');

        const message = Soup.Message.new('GET', USAGE_URL);
        message.request_headers.append('Authorization', `Bearer ${token}`);
        message.request_headers.append('anthropic-beta', BETA_HEADER);
        message.request_headers.append('User-Agent', 'ai-usage-monitor-gnome-extension');

        let bytes;
        try {
            bytes = await this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
        } catch (error) {
            this._logError(error, 'ClaudeSubscriptionProvider: falha de rede');
            return this._result('error', [], 'PROVIDER_UNAVAILABLE');
        }

        const status = message.get_status();
        if (status === Soup.Status.UNAUTHORIZED)
            return this._result('auth_required', [], 'PROVIDER_AUTH_REQUIRED');
        if (status === Soup.Status.TOO_MANY_REQUESTS)
            return this._result('error', [], 'PROVIDER_RATE_LIMITED');
        if (status < 200 || status >= 300)
            return this._result('error', [], 'PROVIDER_INVALID_RESPONSE');

        let payload;
        try {
            payload = JSON.parse(new TextDecoder('utf-8').decode(bytes.get_data()));
        } catch (error) {
            this._logError(error, 'ClaudeSubscriptionProvider: resposta inválida');
            return this._result('error', [], 'PROVIDER_INVALID_RESPONSE');
        }

        const windows = parseClaudeUsage(payload);
        if (windows.length === 0)
            return this._result('error', [], 'PROVIDER_INVALID_RESPONSE');

        return this._result('ok', windows);
    }

    async _readToken() {
        try {
            const [contents] = await Gio.File.new_for_path(this._credentialsPath).load_contents_async(null);
            const json = JSON.parse(new TextDecoder('utf-8').decode(contents));
            const token = json?.claudeAiOauth?.accessToken;
            return typeof token === 'string' && token.length > 0 ? token : null;
        } catch {
            return null; // arquivo ausente/ilegível — tratado como não configurado
        }
    }

    _result(status, windows, errorCode) {
        return {
            providerId: this.id,
            providerName: this.name,
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
