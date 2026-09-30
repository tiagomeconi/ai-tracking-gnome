// CodexSubscriptionProvider — provider EXPERIMENTAL (seção 2.1 do plano).
//
// Roda `codex app-server --stdio` (o próprio Codex CLI, em modo servidor
// JSON-RPC sobre stdio — interface pensada para integração de ferramentas
// externas, ex.: editores) e chama o método `account/rateLimits/read`.
// Retorna o percentual REAL da cota da conta ChatGPT/Codex, não uma
// estimativa local. Autenticação é a mesma sessão já ativa do `codex
// login` — este provider não lê nem armazena nenhuma credencial própria.
//
// Método JSON-RPC não documentado publicamente como API externa estável —
// formato de requisição/resposta verificado a partir do projeto
// open-source tokidachi (github.com/Gaalbu/tokidachi, MIT), que implementa
// a mesma integração. Ver ADR-007.
//
// NÃO validado contra uma execução real dentro do GNOME Shell (este
// ambiente de desenvolvimento não tem GJS) — validar manualmente.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { UsageProvider } from './provider.js';
import { parseCodexRateLimits } from './codexSubscriptionParser.js';

try {
    Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish_utf8');
} catch {
    // já promisificado nesta versão/carregamento do GJS — ok ignorar.
}

const TIMEOUT_SECONDS = 15;

export class CodexSubscriptionProvider extends UsageProvider {
    constructor(id = 'codex', name = 'Codex', codexBin = 'codex') {
        super(id, name);
        this._codexBin = codexBin;
    }

    async isConfigured() {
        return true; // sem credencial própria a checar; a falha de auth vem do próprio `codex`
    }

    async healthCheck() {
        return true;
    }

    async fetchUsage() {
        let proc;
        try {
            proc = new Gio.Subprocess({
                argv: [this._codexBin, 'app-server', '--stdio'],
                flags: Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            proc.init(null);
        } catch (error) {
            this._logError(error, 'CodexSubscriptionProvider: não foi possível iniciar `codex app-server`');
            return this._result('error', [], 'PROVIDER_UNAVAILABLE');
        }

        try {
            this._writeRequests(proc);
            const result = await this._readResult(proc);
            const windows = parseCodexRateLimits(result);
            return this._result('ok', windows);
        } catch (error) {
            this._logError(error, 'CodexSubscriptionProvider: falha ao consultar rate limits');
            const errorCode = error?.code ?? 'PROVIDER_UNAVAILABLE';
            const status = errorCode === 'PROVIDER_AUTH_REQUIRED' ? 'auth_required' : 'error';
            return this._result(status, [], errorCode);
        } finally {
            this._stop(proc);
        }
    }

    _writeRequests(proc) {
        const requests = [
            {
                method: 'initialize',
                id: 1,
                params: {
                    clientInfo: { name: 'ai-usage-monitor-gnome', title: 'AI Usage Monitor', version: '0.1.0' },
                },
            },
            { method: 'initialized', params: {} },
            { method: 'account/rateLimits/read', id: 2, params: {} },
        ];

        const payload = requests.map((r) => JSON.stringify(r)).join('\n') + '\n';
        const stdin = proc.get_stdin_pipe();
        stdin.write_bytes(GLib.Bytes.new(new TextEncoder().encode(payload)), null);
        stdin.close(null);
    }

    async _readResult(proc) {
        const stdout = new Gio.DataInputStream({ base_stream: proc.get_stdout_pipe() });
        const cancellable = new Gio.Cancellable();
        const timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, TIMEOUT_SECONDS, () => {
            cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });

        try {
            for (;;) {
                const [line] = await stdout.read_line_async(GLib.PRIORITY_DEFAULT, cancellable);
                if (line === null)
                    throw Object.assign(new Error('Codex retornou EOF sem resposta de rate limits'), { code: 'PROVIDER_INVALID_RESPONSE' });

                let message;
                try {
                    message = JSON.parse(line);
                } catch {
                    continue; // o app-server pode emitir linhas não-JSON — ignorar
                }

                if (message?.id === 2) {
                    if (message.error)
                        throw Object.assign(new Error('Codex rejeitou a consulta; rode `codex login`'), { code: 'PROVIDER_AUTH_REQUIRED' });
                    return message.result;
                }
            }
        } catch (error) {
            if (error?.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                throw Object.assign(new Error('Codex usage request timed out'), { code: 'PROVIDER_TIMEOUT' });
            throw error;
        } finally {
            GLib.source_remove(timeoutId);
        }
    }

    _stop(proc) {
        if (!proc)
            return;
        try {
            proc.force_exit();
        } catch {
            // processo já encerrado — ok ignorar.
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
