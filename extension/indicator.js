// Indicador da top bar (RF-01) + popup (RF-02). Lê apenas o estado
// normalizado do ProviderManager/UsageCache — nenhuma lógica específica de
// provider deve viver aqui (seção 5.1).

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ProviderManager } from './lib/providerManager.js';
import { UsageCache } from './lib/cache.js';
import { UsageHistoryStore } from './lib/historyStore.js';
import { computeThresholdEvents, DEFAULT_THRESHOLD_PERCENT } from './lib/thresholdNotifier.js';
import { MockProvider } from './lib/providers/mock.js';
import { ClaudeSubscriptionProvider } from './lib/providers/claudeSubscription.js';
import { CodexSubscriptionProvider } from './lib/providers/codexSubscription.js';
import { AntigravitySubscriptionProvider } from './lib/providers/antigravitySubscription.js';
import { mostRecentFetchedAt, shortProviderName, formatRemaining } from './lib/format.js';
import {
    buildProviderMenuItem,
    buildLoadingMenuItem,
    buildEmptyMenuItem,
    buildFooterMenuItem,
    buildProviderIcon,
    STATE_LABEL,
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

        // Claude, Codex e Antigravity usam a cota REAL da assinatura,
        // reaproveitando o login OAuth que os próprios CLIs oficiais já
        // gravam (arquivo de credenciais ou Secret Service) — EXPERIMENTAL
        // (endpoint/protocolo não documentados publicamente), ver
        // lib/providers/{claudeSubscription,codexSubscription,
        // antigravitySubscription}.js e docs/providers/ + ADR-007. Copilot
        // (único OFFICIAL_API) foi adiado a pedido do usuário.
        this._cache = new UsageCache();
        // Histórico local (seção 16, backlog P2): um snapshot por janela a
        // cada refresh bem-sucedido, lido pela aba "Estatísticas" das
        // preferências (prefs.js, processo separado) pro gráfico de
        // tendência. Arquivo em ~/.cache/ai-usage-monitor/history.jsonl,
        // nunca enviado pra fora da máquina.
        this._historyStore = new UsageHistoryStore();
        // Se cada janela já estava acima do limite de notificação na
        // última checagem (backlog P2: "Notificação de limite") — só em
        // memória, não persiste entre reinícios da extensão; ver
        // lib/thresholdNotifier.js para a lógica de quando notificar e o
        // limite configurável (`notification-threshold-percent`) em
        // preferências.
        this._aboveNotificationThreshold = {};
        this._manager = new ProviderManager([
            new ClaudeSubscriptionProvider(),
            new CodexSubscriptionProvider(),
            new AntigravitySubscriptionProvider(),
            new MockProvider('copilot', 'Copilot (em desenvolvimento)', MockProvider.SCENARIOS.USAGE_20, 4000, 'https://github.com/settings/billing'),
        ]);

        const box = new St.BoxLayout({ style_class: 'ai-usage-panel-box' });

        box.add_child(buildProviderIcon('logo', this._extensionPath, 16));

        this._label = new St.Label({
            text: '…',
            y_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._label);

        this.add_child(box);

        // Um St.ScrollView customizado em volta da lista foi tentado (pra
        // listas grandes, ex.: Antigravity com 15-20 janelas), mas causou
        // três bugs reais num GNOME Shell real (seta de atalho cortada,
        // trava de scroll combinado com dropdown, botão de atualizar do
        // rodapé parando de responder a clique) sem solução confiável —
        // removido. Sem ele, um popup com muitas janelas pode crescer além
        // da tela (sem rolar), mas todo o resto funciona.
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
            this._historyStore.appendUsages(usages);
            this._notifyThresholdEvents(usages);
        } catch (error) {
            const log = typeof logError === 'function' ? logError : console.error;
            log(error, 'AIUsageIndicator: falha inesperada no refresh geral');
        }
        this._renderFromCache();
    }

    /**
     * Notificação de limite (backlog P2): dispara uma notificação do
     * sistema quando uma janela cruza o limite configurável pela primeira
     * vez (ver lib/thresholdNotifier.js). Desligável e configurável
     * (`notifications-enabled`/`notification-threshold-percent`) nas
     * preferências.
     */
    _notifyThresholdEvents(usages) {
        if (this._settings && !this._settings.get_boolean('notifications-enabled'))
            return;

        const thresholdPercent = this._settings?.get_int('notification-threshold-percent') ?? DEFAULT_THRESHOLD_PERCENT;
        const { events, nextAboveThreshold } = computeThresholdEvents(usages, this._aboveNotificationThreshold, thresholdPercent);
        this._aboveNotificationThreshold = nextAboveThreshold;

        for (const event of events)
            this._showThresholdNotification(event);
    }

    _showThresholdNotification(event) {
        const stateLabel = STATE_LABEL[event.state] ?? event.state;
        const title = `${shortProviderName(event.providerName)} — ${event.windowLabel}`;
        const remaining = formatRemaining(event.resetsAt);
        const body = remaining
            ? `${Math.round(event.percent)}% usado · ${stateLabel} — renova em ${remaining}`
            : `${Math.round(event.percent)}% usado · ${stateLabel}`;

        Main.notify(title, body);
    }

    /** RF-05: providers listados em `disabled-providers` (preferências). */
    _enabledProviderIds() {
        const disabled = new Set(this._settings?.get_strv('disabled-providers') ?? []);
        return new Set(this._manager.providers.map((p) => p.id).filter((id) => !disabled.has(id)));
    }

    _renderFromCache() {
        const enabledIds = this._enabledProviderIds();
        const usages = this._cache.getAll().filter((u) => enabledIds.has(u.providerId));

        this.menu.removeAll();

        if (usages.length === 0) {
            this.menu.addMenuItem(buildEmptyMenuItem());
            this._label.set_text('—');
            return;
        }

        const best = this._manager.getMostCritical(usages);
        this._label.set_text(best
            ? `${shortProviderName(best.provider.providerName)} ${Math.round(best.percent)}%`
            : '—');

        for (const usage of usages) {
            for (const item of buildProviderMenuItem(usage, this._extensionPath))
                this.menu.addMenuItem(item);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const lastFetchedAt = mostRecentFetchedAt(usages);
        this.menu.addMenuItem(buildFooterMenuItem(
            lastFetchedAt,
            () => this.refresh(),
            this._extension ? () => this._extension.openPreferences() : null,
            this._extensionPath
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
