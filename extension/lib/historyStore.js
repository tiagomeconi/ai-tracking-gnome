// Persistência do histórico local de uso (lib/history.js tem as funções
// puras de parsing/retenção). Depende de GJS (Gio/GLib) — não importável
// em Node, por isso fica separado de history.js.
//
// Lido tanto pelo processo da extensão (indicator.js, que escreve a cada
// refresh bem-sucedido) quanto pelo processo separado das preferências
// (prefs.js, que só lê pro gráfico) — os dois processos não compartilham
// memória, então toda operação aqui abre/fecha o arquivo do zero, sem
// nenhum estado cacheado entre chamadas.
//
// NÃO validado contra uma execução real dentro do GNOME Shell (este
// ambiente de desenvolvimento não tem GJS) — validar manualmente.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { parseHistoryText, serializeHistory, pruneHistory, samplesFromUsages } from './history.js';

export function defaultHistoryPath() {
    return GLib.build_filenamev([GLib.get_user_cache_dir(), 'ai-usage-monitor', 'history.jsonl']);
}

export class UsageHistoryStore {
    constructor(path = defaultHistoryPath()) {
        this._path = path;
    }

    /** Lê todas as amostras do arquivo. Retorna `[]` se ainda não existir/ilegível — nunca lança. */
    read() {
        try {
            const [ok, contents] = GLib.file_get_contents(this._path);
            if (!ok)
                return [];
            return parseHistoryText(new TextDecoder('utf-8').decode(contents));
        } catch {
            return []; // arquivo ainda não existe na primeira execução — estado normal, não erro
        }
    }

    /**
     * Deriva amostras de `usages` (seção 4 do plano) e acrescenta ao
     * histórico, aplicando retenção. Lê e reescreve o arquivo inteiro —
     * aceitável dado o volume modesto de dados e a cadência de minutos
     * entre chamadas (ver `REFRESH_INTERVAL_SECONDS` em indicator.js).
     * Nunca lança — falha de disco não deve derrubar o refresh da
     * extensão, só deixa de registrar aquele ponto.
     */
    appendUsages(usages, now = new Date()) {
        try {
            const newSamples = samplesFromUsages(usages, now);
            if (newSamples.length === 0)
                return;

            const existing = this.read();
            const pruned = pruneHistory([...existing, ...newSamples], { now });
            this._write(pruned);
        } catch (error) {
            this._logError(error, 'UsageHistoryStore: falha ao gravar histórico');
        }
    }

    _write(samples) {
        const file = Gio.File.new_for_path(this._path);
        const dir = file.get_parent();
        if (dir && !dir.query_exists(null))
            dir.make_directory_with_parents(null);

        GLib.file_set_contents(this._path, serializeHistory(samples));
    }

    _logError(error, message) {
        const log = typeof logError === 'function' ? logError : console.error;
        log(error, message);
    }
}
