// CodexSubscriptionProvider (versão Node/Electron) — EXPERIMENTAL, ver
// extension/lib/providers/codexSubscription.js e ADR-007. Roda
// `codex app-server --stdio` (JSON-RPC sobre stdio) e chama
// `account/rateLimits/read`. Não lê nem guarda credencial própria: a
// autenticação é a sessão do `codex login`.

import { spawn } from 'node:child_process';
import readline from 'node:readline';

import { UsageProvider } from '../../shared/providers/provider.js';
import { parseCodexRateLimits } from '../../shared/providers/codexSubscriptionParser.js';
import { makeResult, logError } from './result.js';

const TIMEOUT_MS = 15_000;
// URL reportada como funcional (a que o `/status` do Codex mostra redireciona
// pra home do ChatGPT — github.com/openai/codex/issues/49350).
const MANAGE_URL = 'https://chatgpt.com/codex/cloud/settings/analytics';

const REQUESTS = [
    {
        method: 'initialize',
        id: 1,
        params: { clientInfo: { name: 'ai-usage-monitor-desktop', title: 'AI Usage Monitor', version: '0.1.0' } },
    },
    { method: 'initialized', params: {} },
    { method: 'account/rateLimits/read', id: 2, params: {} },
];

function killTree(child) {
    try {
        if (process.platform === 'win32' && child.pid) {
            // Com shell:true o filho é o cmd.exe; `kill()` não alcança o node/codex por baixo.
            spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {});
        } else {
            child.kill('SIGKILL');
        }
    } catch {
        // já encerrado — ok ignorar.
    }
}

export class CodexSubscriptionProvider extends UsageProvider {
    constructor({ id = 'codex', name = 'Codex', codexBin = 'codex', spawnImpl = spawn } = {}) {
        super(id, name);
        this._codexBin = codexBin;
        this._spawn = spawnImpl;
    }

    async isConfigured() {
        return true; // sem credencial própria a checar; a falha de auth vem do próprio `codex`
    }

    async healthCheck() {
        return true;
    }

    async fetchUsage() {
        let child;
        try {
            // No Windows o `codex` instalado via npm é um shim `.cmd`, que o
            // Node só executa com shell. Os argumentos são fixos (sem
            // entrada do usuário), então não há risco de injeção.
            child = this._spawn(this._codexBin, ['app-server', '--stdio'], {
                stdio: ['pipe', 'pipe', 'ignore'],
                shell: process.platform === 'win32',
                windowsHide: true,
            });
        } catch (error) {
            logError(error, 'CodexSubscriptionProvider: não foi possível iniciar `codex app-server`');
            return this._result('error', [], 'PROVIDER_UNAVAILABLE');
        }

        try {
            const result = await this._exchange(child);
            return this._result('ok', parseCodexRateLimits(result));
        } catch (error) {
            logError(error, 'CodexSubscriptionProvider: falha ao consultar rate limits');
            const errorCode = error?.code ?? 'PROVIDER_UNAVAILABLE';
            return this._result(errorCode === 'PROVIDER_AUTH_REQUIRED' ? 'auth_required' : 'error', [], errorCode);
        } finally {
            killTree(child);
        }
    }

    _exchange(child) {
        return new Promise((resolve, reject) => {
            const fail = (message, code) => reject(Object.assign(new Error(message), { code }));
            const lines = readline.createInterface({ input: child.stdout });
            const timer = setTimeout(() => fail('Codex usage request timed out', 'PROVIDER_TIMEOUT'), TIMEOUT_MS);
            const done = (settle, value) => {
                clearTimeout(timer);
                lines.close();
                settle(value);
            };

            child.on('error', (error) => {
                clearTimeout(timer);
                reject(Object.assign(error, { code: 'PROVIDER_UNAVAILABLE' }));
            });
            child.on('close', () => {
                clearTimeout(timer);
                fail('Codex encerrou sem resposta de rate limits', 'PROVIDER_INVALID_RESPONSE');
            });

            lines.on('line', (line) => {
                let message;
                try {
                    message = JSON.parse(line);
                } catch {
                    return; // o app-server pode emitir linhas não-JSON — ignorar
                }
                if (message?.id !== 2)
                    return;
                if (message.error)
                    done(reject, Object.assign(new Error('Codex rejeitou a consulta; rode `codex login`'), { code: 'PROVIDER_AUTH_REQUIRED' }));
                else
                    done(resolve, message.result);
            });

            // Não fechar o stdin: o app-server encerra ao receber EOF mesmo
            // com um pedido pendente (ver comentário no provider GJS).
            child.stdin.on('error', () => {}); // EPIPE se o processo morrer antes
            child.stdin.write(REQUESTS.map((r) => JSON.stringify(r)).join('\n') + '\n');
        });
    }

    _result(status, windows, errorCode) {
        return makeResult(this, MANAGE_URL, status, windows, errorCode);
    }
}
