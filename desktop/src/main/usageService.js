// Orquestra coleta periódica, cache, histórico e detecção de limite — o
// equivalente (sem GNOME) da parte lógica de extension/indicator.js. Não
// importa Electron: emite eventos que main.js converte em UI (tray,
// popup, notificações), o que mantém tudo testável em Node puro.
//
//   'update'    -> viewModel (ver viewModel.js)
//   'threshold' -> evento de limite cruzado (thresholdNotifier.js)

import { EventEmitter } from 'node:events';

import { ProviderManager } from '../shared/providerManager.js';
import { UsageCache } from '../shared/cache.js';
import { computeThresholdEvents } from '../shared/thresholdNotifier.js';
import { buildViewModel } from './viewModel.js';

export const REFRESH_INTERVAL_MS = 300_000;

export class UsageService extends EventEmitter {
    /**
     * @param {{providers: import('../shared/providers/provider.js').UsageProvider[], settings: {get(): object}, historyStore: {appendUsages(u: object[]): void}, intervalMs?: number, managerOptions?: object}} options
     */
    constructor({ providers, settings, historyStore, intervalMs = REFRESH_INTERVAL_MS, managerOptions }) {
        super();
        this._manager = new ProviderManager(providers, managerOptions);
        this._settings = settings;
        this._history = historyStore;
        this._intervalMs = intervalMs;
        this._cache = new UsageCache();
        this._aboveThreshold = {};
        this._timer = null;
        this._refreshPromise = null;
    }

    get providers() {
        return this._manager.providers;
    }

    start() {
        this.stop();
        this._timer = setInterval(() => this.refresh(), this._intervalMs);
        return this.refresh();
    }

    stop() {
        if (this._timer)
            clearInterval(this._timer);
        this._timer = null;
    }

    /** Chamadas concorrentes compartilham a mesma requisição (sem tempestade de fetches). */
    refresh() {
        if (!this._refreshPromise) {
            this._refreshPromise = this._doRefresh().finally(() => {
                this._refreshPromise = null;
            });
        }
        return this._refreshPromise;
    }

    async _doRefresh() {
        try {
            const usages = await this._manager.fetchAll(this._enabledIds());
            this._cache.setAll(usages);
            this._history.appendUsages(usages);
            this._detectThresholds(usages);
        } catch (error) {
            console.error('UsageService: falha inesperada no refresh geral', error);
        }
        this.emit('update', this.getViewModel());
    }

    _enabledIds() {
        const disabled = new Set(this._settings.get().disabledProviders);
        return new Set(this._manager.providers.map((p) => p.id).filter((id) => !disabled.has(id)));
    }

    _detectThresholds(usages) {
        const { notificationsEnabled, notificationThresholdPercent } = this._settings.get();
        if (!notificationsEnabled)
            return;

        const { events, nextAboveThreshold } = computeThresholdEvents(usages, this._aboveThreshold, notificationThresholdPercent);
        this._aboveThreshold = nextAboveThreshold;
        for (const event of events)
            this.emit('threshold', event);
    }

    /** Usos em cache dos providers habilitados, na ordem de `providers`. */
    _currentUsages() {
        const enabled = this._enabledIds();
        return this._manager.providers
            .filter((p) => enabled.has(p.id))
            .map((p) => this._cache.get(p.id))
            .filter(Boolean);
    }

    getViewModel(now = new Date()) {
        return buildViewModel(this._currentUsages(), now, this._settings.get().widgetWindows ?? {});
    }

    /** URLs "gerenciar" conhecidas — allowlist para `shell.openExternal`. */
    allowedExternalUrls() {
        return new Set(this._currentUsages().map((u) => u.manageUrl).filter(Boolean));
    }
}
