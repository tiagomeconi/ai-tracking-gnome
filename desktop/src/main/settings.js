// Preferências do app (equivalente ao GSettings da extensão GNOME), salvas
// como JSON em <configDir>/settings.json. Valores inválidos no arquivo caem
// no padrão — o arquivo é editável à mão e nunca deve derrubar o app.

import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_THRESHOLD_PERCENT } from '../shared/thresholdNotifier.js';

export const DEFAULT_SETTINGS = Object.freeze({
    disabledProviders: [],
    notificationsEnabled: true,
    notificationThresholdPercent: DEFAULT_THRESHOLD_PERCENT,
    launchAtLogin: false,
});

export function sanitizeSettings(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const threshold = Number(input.notificationThresholdPercent);

    return {
        disabledProviders: Array.isArray(input.disabledProviders)
            ? input.disabledProviders.filter((id) => typeof id === 'string')
            : [],
        notificationsEnabled: typeof input.notificationsEnabled === 'boolean'
            ? input.notificationsEnabled
            : DEFAULT_SETTINGS.notificationsEnabled,
        notificationThresholdPercent: Number.isFinite(threshold)
            ? Math.min(100, Math.max(1, Math.round(threshold)))
            : DEFAULT_SETTINGS.notificationThresholdPercent,
        launchAtLogin: typeof input.launchAtLogin === 'boolean'
            ? input.launchAtLogin
            : DEFAULT_SETTINGS.launchAtLogin,
    };
}

export class SettingsStore {
    constructor(dir) {
        this._file = path.join(dir, 'settings.json');
        this._settings = this._load();
    }

    get() {
        return { ...this._settings, disabledProviders: [...this._settings.disabledProviders] };
    }

    /** Mescla `patch` nas preferências atuais, persiste e retorna o resultado. */
    update(patch) {
        this._settings = sanitizeSettings({ ...this._settings, ...patch });
        try {
            fs.mkdirSync(path.dirname(this._file), { recursive: true });
            fs.writeFileSync(this._file, JSON.stringify(this._settings, null, 2));
        } catch (error) {
            console.error('SettingsStore: falha ao gravar preferências', error);
        }
        return this.get();
    }

    _load() {
        try {
            return sanitizeSettings(JSON.parse(fs.readFileSync(this._file, 'utf8')));
        } catch {
            return sanitizeSettings({}); // primeira execução ou arquivo ilegível
        }
    }
}
