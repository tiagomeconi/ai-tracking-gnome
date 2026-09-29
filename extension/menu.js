// Construção do conteúdo do popup (RF-02, seção 10.2/10.3 do plano).
// Mantém a UI sem conhecer regras específicas de nenhum provider — só lê o
// modelo normalizado (AIProviderUsage) e usa lib/normalizer.js para
// derivar estado visual.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { computePercent, visualStateFromPercent } from './lib/normalizer.js';
import { formatRemaining, formatElapsed } from './lib/format.js';

const STATE_STYLE_CLASS = {
    normal: 'ai-usage-bar-fill-normal',
    attention: 'ai-usage-bar-fill-attention',
    high: 'ai-usage-bar-fill-high',
    critical: 'ai-usage-bar-fill-critical',
    unknown: 'ai-usage-bar-fill-unknown',
};

const STATUS_LABEL = {
    unavailable: 'Indisponível',
    auth_required: 'Autenticação necessária',
    error: 'Erro temporário',
};

/**
 * Cria um PopupMenu.PopupBaseMenuItem representando um provider.
 * @param {import('./lib/types.js').AIProviderUsage} usage
 */
export function buildProviderMenuItem(usage) {
    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });

    const box = new St.BoxLayout({
        vertical: true,
        x_expand: true,
        style_class: 'ai-usage-provider-row',
    });

    const header = new St.BoxLayout({ x_expand: true });
    const nameLabel = new St.Label({ text: usage.providerName, style_class: 'ai-usage-provider-name' });
    header.add_child(nameLabel);
    box.add_child(header);

    if (['unavailable', 'auth_required', 'error'].includes(usage.status)) {
        const message = STATUS_LABEL[usage.status] ?? usage.status;
        box.add_child(new St.Label({ text: message, style_class: 'ai-usage-provider-status' }));
        item.add_child(box);
        return item;
    }

    if (!usage.windows || usage.windows.length === 0) {
        box.add_child(new St.Label({
            text: 'Consumo indisponível por integração suportada',
            style_class: 'ai-usage-provider-status',
        }));
        item.add_child(box);
        return item;
    }

    for (const window of usage.windows)
        box.add_child(buildWindowRow(window));

    if (usage.stale) {
        box.add_child(new St.Label({
            text: 'Último dado conhecido (desatualizado)',
            style_class: 'ai-usage-provider-stale',
        }));
    }

    item.add_child(box);
    return item;
}

function buildWindowRow(window) {
    const row = new St.BoxLayout({ vertical: true, x_expand: true, style_class: 'ai-usage-window-row' });

    const percent = computePercent(window);
    const state = visualStateFromPercent(percent);

    const track = new St.Widget({ style_class: 'ai-usage-bar-track', x_expand: true });
    const fill = new St.Widget({
        style_class: `ai-usage-bar-fill ${STATE_STYLE_CLASS[state]}`,
    });
    track.add_child(fill);
    track.connect('notify::width', () => {
        const width = typeof percent === 'number' ? track.width * (percent / 100) : 0;
        fill.set_size(width, track.height || 8);
    });
    row.add_child(track);

    const percentText = typeof percent === 'number' ? `${Math.round(percent)}%` : 'desconhecido';
    const label = new St.Label({
        text: `${window.label} — ${percentText}`,
        style_class: 'ai-usage-window-label',
    });
    row.add_child(label);

    const remaining = formatRemaining(window.resetsAt);
    if (remaining) {
        row.add_child(new St.Label({
            text: `Renova em ${remaining}`,
            style_class: 'ai-usage-window-reset',
        }));
    }

    return row;
}

export function buildLoadingMenuItem() {
    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    item.add_child(new St.Label({ text: 'Carregando…', style_class: 'ai-usage-loading' }));
    return item;
}

export function buildEmptyMenuItem() {
    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
    item.add_child(new St.Label({
        text: 'Nenhum provider configurado',
        style_class: 'ai-usage-loading',
    }));
    return item;
}

/**
 * Rodapé do popup (seção 10.2): "Atualizado há X" + botão de refresh manual.
 * @param {string|null} lastFetchedAt - fetchedAt mais recente entre os
 *   providers exibidos, ou null se nenhum ainda foi buscado.
 * @param {() => void} onRefresh
 */
export function buildFooterMenuItem(lastFetchedAt, onRefresh) {
    const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });

    const box = new St.BoxLayout({ x_expand: true, style_class: 'ai-usage-footer' });

    const label = new St.Label({
        text: formatElapsed(lastFetchedAt),
        x_expand: true,
        y_align: Clutter.ActorAlign.CENTER,
        style_class: 'ai-usage-footer-label',
    });
    box.add_child(label);

    const refreshButton = new St.Button({
        style_class: 'ai-usage-footer-button',
        child: new St.Icon({ icon_name: 'view-refresh-symbolic', icon_size: 16 }),
        reactive: true,
        can_focus: true,
        track_hover: true,
    });
    refreshButton.connect('clicked', () => onRefresh?.());
    box.add_child(refreshButton);

    item.add_child(box);
    return item;
}
