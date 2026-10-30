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
const DOUBLE_CLICK_MS = 400;

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

        // Arraste manual (Clutter.DragAction não existe mais no GNOME 46):
        // o clique captura o ponteiro (stage.grab) e a posição segue o mouse.
        this._drag = null;
        this._lastPress = { time: 0, x: 0, y: 0 };
        this.actor.connect('button-press-event', (_actor, event) => this._onPress(event));
        this.actor.connect('motion-event', (_actor, event) => this._onMotion(event));
        this.actor.connect('button-release-event', () => this._onRelease());
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

    _onPress(event) {
        if (event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        const time = event.get_time();
        const last = this._lastPress;
        const isDouble = time - last.time < DOUBLE_CLICK_MS && Math.hypot(x - last.x, y - last.y) < 6;
        this._lastPress = { time: isDouble ? 0 : time, x, y };
        if (isDouble) {
            this._onOpen?.();
            return Clutter.EVENT_STOP;
        }

        this._drag = {
            pointer: [x, y],
            origin: [this.actor.x, this.actor.y],
            grab: global.stage.grab(this.actor),
        };
        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        if (!this._drag)
            return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        const { pointer, origin } = this._drag;
        this.actor.set_position(Math.round(origin[0] + x - pointer[0]), Math.round(origin[1] + y - pointer[1]));
        return Clutter.EVENT_STOP;
    }

    _onRelease() {
        if (!this._drag)
            return Clutter.EVENT_PROPAGATE;

        this._drag.grab.dismiss();
        this._drag = null;
        this._savePosition();
        return Clutter.EVENT_STOP;
    }

    destroy() {
        this._drag?.grab.dismiss();
        this._drag = null;
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
