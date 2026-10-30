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
import { buildCompactRows, buildPanelReading, knownWindows } from './lib/compact.js';
import { FloatingWidget } from './widget.js';
import {
    buildProviderMenuItem,
    buildLoadingMenuItem,
    buildEmptyMenuItem,
    buildFooterMenuItem,
    buildProviderIcon,
    STATE_LABEL,
} from './menu.js';

const REFRESH_INTERVAL_SECONDS = 300;

// Mesmas cores das barras (stylesheet.css), em RGB 0-1 para o Cairo.
const GAUGE_COLORS = {
    normal: [0.227, 0.612, 0.227],
    attention: [0.816, 0.627, 0.125],
    high: [0.851, 0.467, 0.024],
    critical: [0.8, 0.2, 0.2],
    unknown: [0.533, 0.533, 0.533],
};

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
        // Opções de exibição (indicador e widget flutuante): qualquer mudança
        // só redesenha a partir do cache, sem nova coleta.
        this._displaySettingIds = ['panel-provider', 'panel-style', 'widget-enabled', 'widget-opacity', 'widget-windows']
            .map((key) => this._settings?.connect(`changed::${key}`, () => this._renderFromCache()))
            .filter((id) => id);
        this._widget = null;
        this._gaugeReading = { percent: null, state: 'unknown' };

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

        this._logo = buildProviderIcon('logo', this._extensionPath, 16);
        box.add_child(this._logo);

        // Velocímetro opcional (panel-style = gauge) no lugar do logo.
        this._gauge = new St.DrawingArea({ width: 22, height: 14, y_align: Clutter.ActorAlign.CENTER, visible: false });
        this._gauge.connect('repaint', (area) => this._paintGauge(area));
        box.add_child(this._gauge);

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

        this._updateWidget(usages);

        if (usages.length === 0) {
            this.menu.addMenuItem(buildEmptyMenuItem());
            this._label.set_text('—');
            this._updatePanelIndicator(null);
            return;
        }

        const reading = buildPanelReading(usages, this._settings?.get_string('panel-provider') ?? 'auto');
        this._label.set_text(reading
            ? `${reading.name} ${reading.percent === null ? '—' : `${reading.percent}%`}`
            : '—');
        this._updatePanelIndicator(reading);
        this._publishKnownWindows(usages);

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

    /** Logo ou velocímetro, conforme `panel-style`. */
    _updatePanelIndicator(reading) {
        const gauge = this._settings?.get_string('panel-style') === 'gauge';
        this._logo.visible = !gauge;
        this._gauge.visible = gauge;
        this._gaugeReading = { percent: reading?.percent ?? null, state: reading?.state ?? 'unknown' };
        this._gauge.queue_repaint();
    }

    _paintGauge(area) {
        const cr = area.get_context();
        const [width, height] = area.get_surface_size();
        const lineWidth = 3;
        const radius = Math.min(width / 2, height - 1) - lineWidth / 2;
        const cx = width / 2;
        const cy = height - 1;

        cr.setLineWidth(lineWidth);
        cr.setSourceRGBA(0.6, 0.6, 0.6, 0.55);
        cr.arc(cx, cy, radius, Math.PI, 2 * Math.PI);
        cr.stroke();

        const { percent, state } = this._gaugeReading;
        if (typeof percent === 'number' && percent > 0) {
            const [r, g, b] = GAUGE_COLORS[state] ?? GAUGE_COLORS.unknown;
            cr.setSourceRGBA(r, g, b, 1);
            cr.arc(cx, cy, radius, Math.PI, Math.PI + Math.PI * Math.min(100, percent) / 100);
            cr.stroke();
        }
        cr.$dispose();
    }

    /** Cria/atualiza/destrói o widget flutuante conforme `widget-enabled`. */
    _updateWidget(usages) {
        // O widget é um extra: se ele falhar, o menu da barra tem que seguir funcionando.
        try {
            this._syncWidget(usages);
        } catch (error) {
            const log = typeof logError === 'function' ? logError : console.error;
            log(error, 'AIUsageIndicator: falha no widget flutuante');
            this._widget?.destroy();
            this._widget = null;
        }
    }

    _syncWidget(usages) {
        if (!this._settings)
            return;
        if (!this._settings.get_boolean('widget-enabled')) {
            this._widget?.destroy();
            this._widget = null;
            return;
        }
        if (!this._widget) {
            this._widget = new FloatingWidget({
                extensionPath: this._extensionPath,
                settings: this._settings,
                onOpen: () => this.menu.open(),
            });
        }
        this._widget.setOpacity();
        const choices = this._settings.get_value('widget-windows').deepUnpack();
        this._widget.update(buildCompactRows(usages, choices));
    }

    // As preferências rodam em outro processo e não enxergam o cache: a lista
    // de janelas de cada IA (para escolher a do widget) vai por um GSettings.
    _publishKnownWindows(usages) {
        if (!this._settings)
            return;
        const json = JSON.stringify(knownWindows(usages));
        if (json !== this._settings.get_string('known-windows'))
            this._settings.set_string('known-windows', json);
    }

    destroy() {
        this._widget?.destroy();
        this._widget = null;
        for (const id of this._displaySettingIds ?? [])
            this._settings?.disconnect(id);
        this._displaySettingIds = [];
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
