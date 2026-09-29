// Entry point da extensão (GNOME 45+, sistema ESM). Ver ADR-001 sobre a
// pendência de suporte a GNOME 42–44.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { AIUsageIndicator } from './indicator.js';

export default class AIUsageMonitorExtension extends Extension {
    enable() {
        this._indicator = new AIUsageIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
