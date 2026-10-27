// Diretórios de dados/configuração por plataforma, sem depender do Electron
// (testável em Node puro). No Linux usa o mesmo caminho da extensão GNOME
// (~/.cache/ai-usage-monitor/history.jsonl), então os dois compartilham o
// histórico se estiverem instalados na mesma máquina.

import os from 'node:os';
import path from 'node:path';

const APP_DIR = 'ai-usage-monitor';

export function dataDir(env = process.env, platform = process.platform, home = os.homedir()) {
    if (platform === 'win32')
        return path.win32.join(env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local'), APP_DIR);
    return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), APP_DIR);
}

export function configDir(env = process.env, platform = process.platform, home = os.homedir()) {
    if (platform === 'win32')
        return path.win32.join(env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming'), APP_DIR);
    return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_DIR);
}

/** Pasta de configuração do Claude Code (`CLAUDE_CONFIG_DIR` ou ~/.claude). */
export function claudeConfigDir(env = process.env, home = os.homedir()) {
    return env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
}
