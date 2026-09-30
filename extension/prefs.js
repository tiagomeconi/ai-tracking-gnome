// Janela de preferências (Fase 8, RF-05: "ativar/desativar providers").
// Roda em processo GTK4/Adwaita separado da Shell — não compartilha estado
// em memória com extension.js/indicator.js, só o GSettings (schema em
// schemas/org.gnome.shell.extensions.ai-usage-monitor.gschema.xml).

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/shell/extensions/prefs.js';

// Lista de providers mostrada aqui é mantida manualmente, em espelho da
// lista instanciada em indicator.js — os dois processos não compartilham
// código em runtime, então isto precisa ser atualizado junto se um
// provider for adicionado/removido/renomeado.
const PROVIDERS = [
    { id: 'claude', name: 'Claude' },
    { id: 'codex', name: 'Codex (ChatGPT)' },
    { id: 'gemini', name: 'Gemini' },
    { id: 'copilot', name: 'Copilot' },
];

export default class AIUsageMonitorPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'Providers',
            icon_name: 'view-list-symbolic',
        });
        window.add(page);

        const group = new Adw.PreferencesGroup({
            title: 'Providers visíveis',
            description: 'Desligue um provider para ocultá-lo do indicador e do popup.',
        });
        page.add(group);

        const disabled = new Set(settings.get_strv('disabled-providers'));

        for (const provider of PROVIDERS) {
            const row = new Adw.ActionRow({ title: provider.name });

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
    }
}
