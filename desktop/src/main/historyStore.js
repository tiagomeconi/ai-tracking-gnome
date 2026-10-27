// Persistência do histórico local de uso (versão Node de
// extension/lib/historyStore.js — mesma lógica pura de history.js, mesmo
// formato de arquivo). Nunca lança: falha de disco só deixa de registrar o
// ponto.

import fs from 'node:fs';
import path from 'node:path';

import { parseHistoryText, serializeHistory, pruneHistory, samplesFromUsages } from '../shared/history.js';

export class UsageHistoryStore {
    constructor(dir) {
        this._path = path.join(dir, 'history.jsonl');
    }

    read() {
        try {
            return parseHistoryText(fs.readFileSync(this._path, 'utf8'));
        } catch {
            return []; // ainda não existe na primeira execução — estado normal
        }
    }

    appendUsages(usages, now = new Date()) {
        try {
            const newSamples = samplesFromUsages(usages, now);
            if (newSamples.length === 0)
                return;

            const pruned = pruneHistory([...this.read(), ...newSamples], { now });
            fs.mkdirSync(path.dirname(this._path), { recursive: true });
            fs.writeFileSync(this._path, serializeHistory(pruned));
        } catch (error) {
            console.error('UsageHistoryStore: falha ao gravar histórico', error);
        }
    }
}
