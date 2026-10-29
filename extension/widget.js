// Widget flutuante (opcional): resumo compacto, translúcido e arrastável,
// por cima das outras janelas. Só lê linhas já prontas de lib/compact.js.

import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { buildProviderIcon } from './menu.js';

const FILL_CLASS = {
    normal: 'ai-usage-bar-fill-normal',
    attention: 'ai-usage-bar-fill-attention',
    high: 'ai-usage-bar-fill-high',
    critical: 'ai-usage-bar-fill-critical',
    unknown: 'ai-usage-bar-fill-unknown',
};

const MARGIN = 16;

export class FloatingWidget {
    /**
     * @param {{extensionPath: string|null, settings: Gio.Settings, onOpen: () => void}} options
     */
    constructor({ extensionPath, settings, onOpen }) {
        this._extensionPath = extensionPath;
        this._settings = settings;
        this._onOpen = onOpen;
        this._rows = [];

        this.actor = new St.BoxLayout({
            vertical: true,
            reactive: true,
            style_class: 'ai-usage-widget',
        });
        this.actor.opacity = this._opacity();

        const drag = new Clutter.DragAction();
        drag.connect('drag-end', () => this._savePosition());
        this.actor.add_action(drag);
        this.actor.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === 1 && typeof event.get_click_count === 'function' && event.get_click_count() === 2)
                this._onOpen?.();
            return Clutter.EVENT_PROPAGATE;
        });
        this._allocationId = this.actor.connect('notify::allocation', () => this._clampOnce());

        Main.layoutManager.addChrome(this.actor, { affectsInputRegion: true, trackFullscreen: true });
        this._placed = false;
    }

    setOpacity() {
        this.actor.opacity = this._opacity();
    }

    update(rows) {
        this._rows = rows;
        this.actor.destroy_all_children();

        if (rows.length === 0) {
            this.actor.add_child(new St.Label({ text: 'Nenhum provedor ativo', style_class: 'ai-usage-widget-detail' }));
            return;
        }

        for (const row of rows)
            this.actor.add_child(this._buildRow(row));
        this._placed = false; // o tamanho mudou: reavalia a posição
    }

    destroy() {
        if (this._allocationId) {
            this.actor.disconnect(this._allocationId);
            this._allocationId = null;
        }
        Main.layoutManager.removeChrome(this.actor);
        this.actor.destroy();
    }

    _opacity() {
        return Math.round(255 * (this._settings.get_int('widget-opacity') / 100));
    }

    _buildRow(row) {
        const box = new St.BoxLayout({ vertical: true, style_class: 'ai-usage-widget-row' });

        const header = new St.BoxLayout({ style_class: 'ai-usage-provider-header' });
        header.add_child(buildProviderIcon(row.providerId, this._extensionPath, 16));
        header.add_child(new St.Label({ text: row.name, style_class: 'ai-usage-provider-name', x_expand: true, y_align: Clutter.ActorAlign.CENTER }));
        header.add_child(new St.Label({ text: row.percent === null ? '—' : `${row.percent}%`, y_align: Clutter.ActorAlign.CENTER }));
        box.add_child(header);

        const track = new St.Widget({ style_class: 'ai-usage-bar-track', x_expand: true });
        const fill = new St.Widget({ style_class: `ai-usage-bar-fill ${FILL_CLASS[row.state] ?? FILL_CLASS.unknown}` });
        track.add_child(fill);
        track.connect('notify::width', () => fill.set_size(track.width * ((row.percent ?? 0) / 100), track.height || 8));
        box.add_child(track);

        const detail = [row.label, row.resetText].filter(Boolean).join(' · ');
        if (detail)
            box.add_child(new St.Label({ text: detail, style_class: 'ai-usage-widget-detail' }));
        return box;
    }

    // Posição salva (se ainda visível em algum monitor) ou canto inferior direito.
    _clampOnce() {
        if (this._placed || this.actor.width === 0)
            return;
        this._placed = true;

        const x = this._settings.get_int('widget-x');
        const y = this._settings.get_int('widget-y');
        const monitors = Main.layoutManager.monitors;
        const visible = x >= 0 && y >= 0 && monitors.some((m) =>
            x + this.actor.width > m.x + MARGIN && x < m.x + m.width - MARGIN &&
            y + this.actor.height > m.y + MARGIN && y < m.y + m.height - MARGIN);

        if (visible) {
            this.actor.set_position(x, y);
        } else {
            const m = Main.layoutManager.primaryMonitor;
            this.actor.set_position(m.x + m.width - this.actor.width - MARGIN, m.y + m.height - this.actor.height - MARGIN * 3);
        }
    }

    _savePosition() {
        this._settings.set_int('widget-x', Math.round(this.actor.x));
        this._settings.set_int('widget-y', Math.round(this.actor.y));
    }
}
