// Indicador da top bar (RF-01) + popup (RF-02). Lê apenas o estado
// normalizado do ProviderManager/UsageCache — nenhuma lógica específica de
// provider deve viver aqui (seção 5.1).

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { ProviderManager } from './lib/providerManager.js';
import { UsageCache } from './lib/cache.js';
import { MockProvider } from './lib/providers/mock.js';
import { ClaudeSubscriptionProvider } from './lib/providers/claudeSubscription.js';
import { CodexSubscriptionProvider } from './lib/providers/codexSubscription.js';
import { mostRecentFetchedAt } from './lib/format.js';
import {
    buildProviderMenuItem,
    buildLoadingMenuItem,
    buildEmptyMenuItem,
    buildFooterMenuItem,
    buildProviderIcon,
} from './menu.js';

const REFRESH_INTERVAL_SECONDS = 300;

export const AIUsageIndicator = GObject.registerClass(
class AIUsageIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.0, 'AI Usage Monitor', false);

        // `extension` é a instância de `Extension` (extension.js). O path
        // resolve os ícones em icons/<providerId>.{svg,png} (ver menu.js);
        // settings é o GSettings do schema em schemas/*.gschema.xml (RF-05:
        // providers ocultos pelas preferências).
        this._extension = extension ?? null;
        this._extensionPath = extension?.path ?? null;
        this._settings = extension?.getSettings?.() ?? null;
        this._settingsChangedId = this._settings?.connect('changed::disabled-providers', () => {
            this._renderFromCache();
        }) ?? null;

        // Claude e Codex usam a cota REAL da assinatura, reaproveitando o
        // login OAuth que os próprios CLIs oficiais já gravam — EXPERIMENTAL
        // (endpoint/protocolo não documentados publicamente), ver
        // lib/providers/{claudeSubscription,codexSubscription}.js e
        // docs/providers/ + ADR-007. Gemini segue em Mock (Antigravity CLI
        // investigado, sem fonte viável). Copilot (único OFFICIAL_API) foi
        // adiado a pedido do usuário.
        this._cache = new UsageCache();
        this._manager = new ProviderManager([
            new ClaudeSubscriptionProvider(),
            new CodexSubscriptionProvider(),
            new MockProvider('gemini', 'Antigravity (em desenvolvimento)', MockProvider.SCENARIOS.MULTI_WINDOW, 4000, 'https://gemini.google.com/'),
            new MockProvider('copilot', 'Copilot (em desenvolvimento)', MockProvider.SCENARIOS.USAGE_20, 4000, 'https://github.com/settings/billing'),
        ]);

        const box = new St.BoxLayout({ style_class: 'ai-usage-panel-box' });

        box.add_child(buildProviderIcon('logo', this._extensionPath, 16));

        this._label = new St.Label({
            text: 'AI …',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._label);

        this.add_child(box);

        this._buildEmptyMenu();
        this._refreshTimeoutId = null;
        this._refreshPromise = null;

        this.menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this._renderFromCache();
        });

        this._startScheduler();
        this.refresh();
    }

    _buildEmptyMenu() {
        this.menu.removeAll();
        this.menu.addMenuItem(buildLoadingMenuItem());
    }

    _startScheduler() {
        this._refreshTimeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            REFRESH_INTERVAL_SECONDS,
            () => {
                this.refresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    /**
     * Dispara nova coleta (refresh manual ou automático). RF-04. Chamadas
     * concorrentes (ex.: clique manual enquanto o polling automático já
     * está em andamento) compartilham a mesma requisição em vez de disparar
     * uma tempestade de fetches (critério de aceite da Fase 3).
     */
    refresh() {
        if (this._refreshPromise)
            return this._refreshPromise;

        this._refreshPromise = this._doRefresh().finally(() => {
            this._refreshPromise = null;
        });
        return this._refreshPromise;
    }

    async _doRefresh() {
        try {
            const usages = await this._manager.fetchAll(this._enabledProviderIds());
            this._cache.setAll(usages);
        } catch (error) {
            const log = typeof logError === 'function' ? logError : console.error;
            log(error, 'AIUsageIndicator: falha inesperada no refresh geral');
        }
        this._renderFromCache();
    }

    /** RF-05: providers listados em `disabled-providers` (preferências). */
    _enabledProviderIds() {
        const disabled = new Set(this._settings?.get_strv('disabled-providers') ?? []);
        return new Set(this._manager.providers.map((p) => p.id).filter((id) => !disabled.has(id)));
    }

    _renderFromCache() {
        const enabledIds = this._enabledProviderIds();
        const usages = this._cache.getAll().filter((u) => enabledIds.has(u.providerId));

        if (usages.length === 0) {
            this.menu.removeAll();
            this.menu.addMenuItem(buildEmptyMenuItem());
            this._label.set_text('AI —');
            return;
        }

        const best = this._manager.getMostCritical(usages);
        this._label.set_text(best ? `AI ${Math.round(best.percent)}%` : 'AI —');

        this.menu.removeAll();
        for (const usage of usages)
            this.menu.addMenuItem(buildProviderMenuItem(usage, this._extensionPath));

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const lastFetchedAt = mostRecentFetchedAt(usages);
        this.menu.addMenuItem(buildFooterMenuItem(
            lastFetchedAt,
            () => this.refresh(),
            this._extension ? () => this._extension.openPreferences() : null
        ));
    }

    destroy() {
        if (this._refreshTimeoutId) {
            GLib.source_remove(this._refreshTimeoutId);
            this._refreshTimeoutId = null;
        }
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        super.destroy();
    }
});
