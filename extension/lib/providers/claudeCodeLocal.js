// ClaudeCodeLocalProvider — provider EXPERIMENTAL (seção 2.1 do plano).
//
// Lê os transcripts JSONL que o próprio Claude Code grava localmente em
// `~/.claude/projects/**/*.jsonl` para estimar volume de tokens processados
// numa janela recente. Isto NÃO é a cota da assinatura claude.ai/Claude
// Code — a Anthropic não expõe essa cota via API nem arquivo local
// documentado (ver docs/providers/claude.md). É só uma estimativa de
// atividade local, sem `limit`/`percent` (não fabricados), sempre marcada
// `estimated: true`.
//
// Nunca captura cookies de sessão nem faz scraping de UI web — lê apenas
// arquivos que o próprio Claude Code, rodando como processo oficial do
// usuário, já escreve em disco.
//
// NÃO validado contra uma execução real dentro do GNOME Shell (este
// ambiente de desenvolvimento não tem GJS) — validar manualmente antes de
// confiar nesta integração.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

import { UsageProvider } from './provider.js';
import { aggregateUsage } from './claudeCodeLocalAggregate.js';

const WINDOW_MS = 5 * 60 * 60 * 1000; // janela rolling de ~5h mencionada na ficha de pesquisa
const MAX_DEPTH = 4; // ~/.claude/projects/<projeto>/<sessão>/subagents/*.jsonl

export class ClaudeCodeLocalProvider extends UsageProvider {
    constructor(
        id = 'claude-code-local',
        name = 'Claude Code (local)',
        projectsDir = GLib.build_filenamev([GLib.get_home_dir(), '.claude', 'projects'])
    ) {
        super(id, name);
        this._projectsDir = projectsDir;
    }

    async isConfigured() {
        return Gio.File.new_for_path(this._projectsDir).query_exists(null);
    }

    async healthCheck() {
        return this.isConfigured();
    }

    async fetchUsage() {
        const cutoffMs = Date.now() - WINDOW_MS;
        const files = await this._findJsonlFiles(this._projectsDir, MAX_DEPTH, cutoffMs);
        const lineArrays = await Promise.all(files.map((path) => this._readLines(path)));
        const lines = lineArrays.flat();

        const { totalTokens, messageCount } = aggregateUsage(lines, WINDOW_MS);
        const hasAnyData = files.length > 0;

        return {
            providerId: this.id,
            providerName: this.name,
            accountLabel: 'Estimativa local — não é a cota da assinatura claude.ai',
            status: hasAnyData ? 'ok' : 'unavailable',
            windows: hasAnyData ? [{
                id: 'claude-code-tokens-5h',
                label: `Tokens processados pelo Claude Code (${messageCount} mensagens, últimas 5h)`,
                unit: 'tokens',
                used: totalTokens,
                window: '5h',
                estimated: true,
            }] : [],
            fetchedAt: new Date().toISOString(),
            stale: false,
            errorCode: hasAnyData ? undefined : 'PROVIDER_UNAVAILABLE',
        };
    }

    /**
     * Varre recursivamente `dir` procurando `*.jsonl`, pulando qualquer
     * arquivo cuja última modificação seja anterior a `cutoffMs` — como o
     * formato é append-only, isso descarta com segurança arquivos que não
     * podem conter nenhuma linha dentro da janela, sem ler seu conteúdo.
     */
    async _findJsonlFiles(dir, depthLeft, cutoffMs) {
        if (depthLeft <= 0)
            return [];

        const dirFile = Gio.File.new_for_path(dir);
        let enumerator;
        try {
            enumerator = await dirFile.enumerate_children_async(
                'standard::name,standard::type,time::modified',
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT,
                null
            );
        } catch {
            return []; // diretório não existe ou sem permissão — tratado como "sem dados"
        }

        const found = [];
        let infos;
        while ((infos = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null)).length > 0) {
            for (const info of infos) {
                const name = info.get_name();
                const childPath = GLib.build_filenamev([dir, name]);

                if (info.get_file_type() === Gio.FileType.DIRECTORY) {
                    found.push(...await this._findJsonlFiles(childPath, depthLeft - 1, cutoffMs));
                    continue;
                }

                if (!name.endsWith('.jsonl'))
                    continue;

                const modifiedMs = info.get_modification_date_time()?.to_unix() * 1000;
                if (typeof modifiedMs === 'number' && modifiedMs < cutoffMs)
                    continue;

                found.push(childPath);
            }
        }

        return found;
    }

    async _readLines(path) {
        try {
            const [contents] = await Gio.File.new_for_path(path).load_contents_async(null);
            return new TextDecoder('utf-8').decode(contents).split('\n');
        } catch {
            return [];
        }
    }
}
