// CodexLocalProvider — provider EXPERIMENTAL (seção 2.1 do plano).
//
// Consulta localmente `~/.codex/state_5.sqlite` (tabela `threads`, coluna
// `tokens_used`) para estimar tokens usados em threads recentes do Codex
// CLI. Schema confirmado por inspeção direta (`sqlite3 ... .schema`) da
// instalação real do usuário — não documentado publicamente pela OpenAI,
// pode mudar sem aviso em uma atualização do Codex.
//
// Isto NÃO é a cota da assinatura ChatGPT nem da API para desenvolvedores
// (ver docs/providers/chatgpt.md) — é só volume de tokens em threads locais
// do Codex. Nunca fabrica `limit`/`percent`.
//
// Usa o binário `sqlite3` via subprocesso (leitura, `-readonly`) em vez de
// uma dependência GI de SQLite — se `sqlite3` não estiver instalado, o
// provider reporta `unavailable` graciosamente.
//
// NÃO validado contra uma execução real dentro do GNOME Shell (este
// ambiente de desenvolvimento não tem GJS) — validar manualmente.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { UsageProvider } from './provider.js';
import { aggregateThreadTokens } from './codexLocalAggregate.js';

// `communicate_utf8_async` não está na lista de auto-promisify de todas as
// versões do GJS — ver mesmo comentário em claudeCodeLocal.js.
try {
    Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');
} catch {
    // já promisificado nesta versão/carregamento do GJS — ok ignorar.
}

const WINDOW_MS = 5 * 60 * 60 * 1000; // mesma janela de 5h reportada por `codex /status`
const QUERY = 'SELECT tokens_used, updated_at_ms FROM threads WHERE archived = 0;';

export class CodexLocalProvider extends UsageProvider {
    constructor(
        id = 'codex-local',
        name = 'Codex (local)',
        dbPath = GLib.build_filenamev([GLib.get_home_dir(), '.codex', 'state_5.sqlite'])
    ) {
        super(id, name);
        this._dbPath = dbPath;
    }

    async isConfigured() {
        return Gio.File.new_for_path(this._dbPath).query_exists(null);
    }

    async healthCheck() {
        return this.isConfigured();
    }

    async fetchUsage() {
        const rows = await this._queryThreads();
        const { totalTokens, threadCount } = aggregateThreadTokens(rows, WINDOW_MS);

        return {
            providerId: this.id,
            providerName: this.name,
            accountLabel: 'Estimativa local — não é a cota da assinatura ChatGPT nem da API',
            status: 'ok',
            windows: [{
                id: 'codex-tokens-5h',
                label: `Tokens usados em threads do Codex (${threadCount}, últimas 5h)`,
                unit: 'tokens',
                used: totalTokens,
                window: '5h',
                estimated: true,
            }],
            fetchedAt: new Date().toISOString(),
            stale: false,
        };
    }

    async _queryThreads() {
        if (!await this.isConfigured())
            return [];

        try {
            const proc = new Gio.Subprocess({
                argv: ['sqlite3', '-readonly', '-json', this._dbPath, QUERY],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            proc.init(null);

            const [stdout] = await proc.communicate_utf8_async(null, null);
            if (!stdout || !stdout.trim())
                return [];

            return JSON.parse(stdout);
        } catch (error) {
            this._logError(error, 'CodexLocalProvider: falha ao consultar state_5.sqlite');
            return [];
        }
    }

    _logError(error, message) {
        const log = typeof logError === 'function' ? logError : console.error;
        log(error, message);
    }
}
