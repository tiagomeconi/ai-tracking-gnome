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
    _init(extensionPath) {
        super._init(0.0, 'AI Usage Monitor', false);

        // Usado para resolver os ícones em icons/<providerId>.svg (ver
        // menu.js). `extensionPath` vem de `Extension.path` (extension.js).
        this._extensionPath = extensionPath ?? null;

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
            new MockProvider('gemini', 'Gemini', MockProvider.SCENARIOS.MULTI_WINDOW, 4000, 'https://gemini.google.com/'),
            new MockProvider('copilot', 'Copilot', MockProvider.SCENARIOS.USAGE_20, 4000, 'https://github.com/settings/billing'),
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
            const usages = await this._manager.fetchAll();
            this._cache.setAll(usages);
        } catch (error) {
            const log = typeof logError === 'function' ? logError : console.error;
            log(error, 'AIUsageIndicator: falha inesperada no refresh geral');
        }
        this._renderFromCache();
    }

    _renderFromCache() {
        const usages = this._cache.getAll();

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
        this.menu.addMenuItem(buildFooterMenuItem(lastFetchedAt, () => this.refresh()));
    }

    destroy() {
        if (this._refreshTimeoutId) {
            GLib.source_remove(this._refreshTimeoutId);
            this._refreshTimeoutId = null;
        }
        super.destroy();
    }
});
