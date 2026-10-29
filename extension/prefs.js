// Janela de preferências (Fase 8, RF-05: "ativar/desativar providers").
// Roda em processo GTK4/Adwaita separado da Shell — não compartilha estado
// em memória com extension.js/indicator.js, só o GSettings (schema em
// schemas/org.gnome.shell.extensions.ai-usage-monitor.gschema.xml).

// Versão explícita obrigatória: sem isso, a resolução do typelib pode ficar
// ambígua se o sistema tiver GTK3 instalado ao lado do GTK4, quebrando o
// carregamento inteiro do módulo de preferências.
import Adw from 'gi://Adw?version=1';
import Gtk from 'gi://Gtk?version=4.0';
import GLib from 'gi://GLib';

// O app de preferências ("Extensões") roda separado do processo principal
// da Shell e usa um namespace de recurso diferente do de extension.js —
// confirmado comparando com outra extensão do usuário que já funciona
// neste mesmo sistema (GNOME Shell 46).
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { UsageHistoryStore } from './lib/historyStore.js';
import { listHistorySeries } from './lib/history.js';
import { aggregateDailyMax, layoutBarChart } from './lib/historyChart.js';
import { visualStateFromPercent } from './lib/normalizer.js';

// Mesmas cores de `extension/stylesheet.css` (.ai-usage-bar-fill-*), só
// que em RGB 0-1 pro Cairo — mantém o gráfico de estatísticas visualmente
// consistente com as barras de uso do popup.
const BAR_COLOR_BY_STATE = {
    normal: [0.227, 0.612, 0.227],
    attention: [0.816, 0.627, 0.125],
    high: [0.851, 0.467, 0.024],
    critical: [0.8, 0.2, 0.2],
    unknown: [0.533, 0.533, 0.533],
};

// Lista de providers mostrada aqui é mantida manualmente, em espelho da
// lista instanciada em indicator.js — os dois processos não compartilham
// código em runtime, então isto precisa ser atualizado junto se um
// provider for adicionado/removido/renomeado.
const PROVIDERS = [
    { id: 'claude', name: 'Claude' },
    { id: 'codex', name: 'Codex (ChatGPT)' },
    { id: 'gemini', name: 'Antigravity' },
    { id: 'copilot', name: 'Copilot', dev: true },
];

export default class AIUsageMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Providers',
            icon_name: 'view-list-symbolic',
        });
        window.add(page);

        const headerGroup = new Adw.PreferencesGroup();
        const header = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 12,
            halign: Gtk.Align.CENTER,
            margin_top: 6,
            margin_bottom: 6,
        });

        const logoPath = GLib.build_filenamev([this.path, 'icons', 'logo.png']);
        if (GLib.file_test(logoPath, GLib.FileTest.EXISTS)) {
            const logo = Gtk.Image.new_from_file(logoPath);
            logo.pixel_size = 96;
            header.append(logo);
        }

        header.append(new Gtk.Label({
            label: '<span size="large" weight="bold">AI Usage Monitor</span>',
            use_markup: true,
        }));
        headerGroup.add(header);
        page.add(headerGroup);

        const group = new Adw.PreferencesGroup({
            title: 'Providers visíveis',
            description: 'Desligue um provider para ocultá-lo do indicador e do popup.',
        });
        page.add(group);

        const disabled = new Set(settings.get_strv('disabled-providers'));

        for (const provider of PROVIDERS) {
            const row = new Adw.ActionRow({
                title: provider.name,
                subtitle: provider.dev ? 'Em desenvolvimento — ainda usa dados de demonstração' : null,
            });

            const toggle = new Gtk.Switch({
                active: !disabled.has(provider.id),
                valign: Gtk.Align.CENTER,
            });
            row.add_suffix(toggle);
            row.activatable_widget = toggle;
            group.add(row);

            toggle.connect('notify::active', () => {
                const current = new Set(settings.get_strv('disabled-providers'));
                if (toggle.active)
                    current.delete(provider.id);
                else
                    current.add(provider.id);
                settings.set_strv('disabled-providers', [...current]);
            });
        }

        this._fillDisplayGroups(page, settings);

        const notificationsGroup = new Adw.PreferencesGroup({
            title: 'Notificações',
        });
        page.add(notificationsGroup);

        const notificationsRow = new Adw.ActionRow({
            title: 'Notificar ao cruzar um limite de uso',
            subtitle: 'Avisa uma vez por janela ao atingir o % escolhido abaixo, até ela resetar.',
        });
        const notificationsToggle = new Gtk.Switch({
            active: settings.get_boolean('notifications-enabled'),
            valign: Gtk.Align.CENTER,
        });
        notificationsRow.add_suffix(notificationsToggle);
        notificationsRow.activatable_widget = notificationsToggle;
        notificationsGroup.add(notificationsRow);

        notificationsToggle.connect('notify::active', () => {
            settings.set_boolean('notifications-enabled', notificationsToggle.active);
        });

        const thresholdRow = new Adw.ActionRow({
            title: 'A partir de quantos % de uso',
            subtitle: 'Independente das cores da barra — é só o gatilho da notificação.',
        });
        const thresholdSpin = Gtk.SpinButton.new_with_range(1, 99, 1);
        thresholdSpin.value = settings.get_int('notification-threshold-percent');
        thresholdSpin.valign = Gtk.Align.CENTER;
        thresholdRow.add_suffix(thresholdSpin);
        thresholdRow.activatable_widget = thresholdSpin;
        notificationsGroup.add(thresholdRow);

        thresholdSpin.connect('value-changed', () => {
            settings.set_int('notification-threshold-percent', thresholdSpin.get_value_as_int());
        });

        this._fillStatsPage(window);
    }

    /**
     * Opções de exibição: qual IA/estilo aparece na barra e o widget
     * flutuante opcional (com a janela de uso mostrada por IA).
     */
    _fillDisplayGroups(page, settings) {
        const panelGroup = new Adw.PreferencesGroup({
            title: 'Indicador da barra',
            description: 'Qual IA aparece na barra superior e em que estilo.',
        });
        page.add(panelGroup);

        const providerChoices = [{ id: 'auto', name: 'Automático (mais próxima do limite)' }, ...PROVIDERS];
        const providerRow = new Adw.ComboRow({
            title: 'IA exibida na barra',
            model: Gtk.StringList.new(providerChoices.map((p) => p.name)),
        });
        providerRow.selected = Math.max(0, providerChoices.findIndex((p) => p.id === settings.get_string('panel-provider')));
        providerRow.connect('notify::selected', () => settings.set_string('panel-provider', providerChoices[providerRow.selected].id));
        panelGroup.add(providerRow);

        const styleChoices = [{ id: 'text', name: 'Logo + texto' }, { id: 'gauge', name: 'Velocímetro + texto' }];
        const styleRow = new Adw.ComboRow({
            title: 'Estilo do indicador',
            model: Gtk.StringList.new(styleChoices.map((s) => s.name)),
        });
        styleRow.selected = Math.max(0, styleChoices.findIndex((s) => s.id === settings.get_string('panel-style')));
        styleRow.connect('notify::selected', () => settings.set_string('panel-style', styleChoices[styleRow.selected].id));
        panelGroup.add(styleRow);

        const widgetGroup = new Adw.PreferencesGroup({
            title: 'Widget flutuante',
            description: 'Quadrado compacto e translúcido, sempre sobre as janelas. Arraste para qualquer canto; duplo clique abre o painel completo.',
        });
        page.add(widgetGroup);

        const widgetRow = new Adw.ActionRow({ title: 'Mostrar widget flutuante' });
        const widgetSwitch = new Gtk.Switch({ active: settings.get_boolean('widget-enabled'), valign: Gtk.Align.CENTER });
        widgetRow.add_suffix(widgetSwitch);
        widgetRow.activatable_widget = widgetSwitch;
        widgetGroup.add(widgetRow);
        widgetSwitch.connect('notify::active', () => settings.set_boolean('widget-enabled', widgetSwitch.active));

        const opacityRow = new Adw.ActionRow({ title: 'Opacidade (%)' });
        const opacitySpin = Gtk.SpinButton.new_with_range(40, 100, 5);
        opacitySpin.value = settings.get_int('widget-opacity');
        opacitySpin.valign = Gtk.Align.CENTER;
        opacityRow.add_suffix(opacitySpin);
        opacityRow.activatable_widget = opacitySpin;
        widgetGroup.add(opacityRow);
        opacitySpin.connect('value-changed', () => settings.set_int('widget-opacity', opacitySpin.get_value_as_int()));

        // Janelas conhecidas vêm da extensão (indicator.js) via GSettings.
        let known = {};
        try {
            known = JSON.parse(settings.get_string('known-windows'));
        } catch (_e) {
            known = {};
        }

        for (const provider of PROVIDERS) {
            const choices = [{ id: 'auto', label: 'Automático (maior consumo)' }, ...(known[provider.id] ?? [])];
            const saved = settings.get_value('widget-windows').deepUnpack()[provider.id];
            if (saved && saved !== 'auto' && !choices.some((c) => c.id === saved))
                choices.push({ id: saved, label: saved });

            const row = new Adw.ComboRow({
                title: `Widget — ${provider.name}`,
                subtitle: 'Janela de uso mostrada (e quando renova)',
                model: Gtk.StringList.new(choices.map((c) => c.label)),
            });
            row.selected = Math.max(0, choices.findIndex((c) => c.id === (saved ?? 'auto')));
            row.connect('notify::selected', () => {
                const current = settings.get_value('widget-windows').deepUnpack();
                current[provider.id] = choices[row.selected].id;
                settings.set_value('widget-windows', new GLib.Variant('a{ss}', current));
            });
            widgetGroup.add(row);
        }
    }

    /**
     * Aba "Estatísticas": gráfico de tendência a partir do histórico local
     * (lib/historyStore.js — um snapshot por janela a cada refresh
     * bem-sucedido da extensão, escrito por indicator.js). Puramente
     * derivado de dados já coletados; não faz nenhuma chamada de rede
     * nem lê credenciais.
     */
    _fillStatsPage(window) {
        const statsPage = new Adw.PreferencesPage({
            title: 'Estatísticas',
            icon_name: 'utilities-system-monitor-symbolic',
        });
        window.add(statsPage);

        const statsGroup = new Adw.PreferencesGroup({
            title: 'Histórico de uso',
            description: 'Baseado nos snapshots salvos localmente a cada atualização da extensão — nada é enviado pra fora da máquina.',
        });
        statsPage.add(statsGroup);

        const historyStore = new UsageHistoryStore();
        const allSamples = historyStore.read();
        const series = listHistorySeries(allSamples);

        if (series.length === 0) {
            statsGroup.add(new Adw.ActionRow({
                title: 'Ainda não há histórico suficiente',
                subtitle: 'Volte depois de a extensão rodar por um tempo coletando dados (um ponto a cada atualização bem-sucedida).',
            }));
            return;
        }

        const providerNameById = new Map(PROVIDERS.map((p) => [p.id, p.name]));

        const model = new Gtk.StringList();
        for (const s of series)
            model.append(`${providerNameById.get(s.providerId) ?? s.providerId} — ${s.windowLabel}`);

        const dropdown = new Gtk.DropDown({ model, selected: 0, valign: Gtk.Align.CENTER });
        const dropdownRow = new Adw.ActionRow({ title: 'Série' });
        dropdownRow.add_suffix(dropdown);
        dropdownRow.activatable_widget = dropdown;
        statsGroup.add(dropdownRow);

        const drawingArea = new Gtk.DrawingArea({
            content_width: 400,
            content_height: 220,
            hexpand: true,
            margin_top: 12,
            margin_bottom: 12,
        });

        // Preenchido a cada desenho, lido pelo tooltip (`query-tooltip`) —
        // os dois callbacks não compartilham argumento nenhum, só esta
        // closure.
        let currentBars = [];

        drawingArea.set_draw_func((_area, cr, width, height) => {
            const selected = series[dropdown.selected] ?? series[0];
            const samplesForSeries = allSamples.filter(
                (s) => s.providerId === selected.providerId && s.windowId === selected.windowId
            );
            const daily = aggregateDailyMax(samplesForSeries);
            const { bars } = layoutBarChart(daily, { width, height });
            currentBars = bars;

            // Linhas guia (eixo X/Y), cor neutra translúcida.
            cr.setSourceRGBA(1, 1, 1, 0.15);
            cr.setLineWidth(1);
            cr.moveTo(24, 20);
            cr.lineTo(24, height - 24);
            cr.lineTo(width - 20, height - 24);
            cr.stroke();

            // Rótulos do eixo Y (0%/100%) e do eixo X (primeiro/último dia).
            cr.setSourceRGBA(1, 1, 1, 0.5);
            cr.setFontSize(10);
            cr.moveTo(2, 28);
            cr.showText('100%');
            cr.moveTo(2, height - 26);
            cr.showText('0%');

            if (bars.length > 0) {
                cr.moveTo(24, height - 8);
                cr.showText(formatChartDate(bars[0].date));
                cr.moveTo(Math.max(24, width - 70), height - 8);
                cr.showText(formatChartDate(bars[bars.length - 1].date));
            }

            for (const bar of bars) {
                const [r, g, b] = BAR_COLOR_BY_STATE[visualStateFromPercent(bar.percent)] ?? BAR_COLOR_BY_STATE.unknown;
                cr.setSourceRGBA(r, g, b, 1);
                cr.rectangle(bar.x, bar.y, bar.width, bar.height);
                cr.fill();
            }
        });

        // Tooltip com o valor exato da barra sob o cursor — `query-tooltip`
        // é o mecanismo padrão do GTK4 pra tooltips dinâmicos em widgets
        // desenhados à mão (`Gtk.DrawingArea` não tem tooltip "de graça"
        // como um botão/label).
        drawingArea.set_has_tooltip(true);
        drawingArea.connect('query-tooltip', (_widget, x, _y, _keyboardMode, tooltip) => {
            const bar = currentBars.find((b) => x >= b.x && x <= b.x + b.width);
            if (!bar)
                return false;

            tooltip.set_text(`${formatChartDate(bar.date)} — pico de ${Math.round(bar.percent)}%`);
            return true;
        });

        statsGroup.add(drawingArea);

        dropdown.connect('notify::selected', () => drawingArea.queue_draw());
    }
}

/** Formata uma data "AAAA-MM-DD" (ver aggregateDailyMax) como "DD/MM". */
function formatChartDate(isoDate) {
    const [, month, day] = isoDate.split('-');
    return `${day}/${month}`;
}
