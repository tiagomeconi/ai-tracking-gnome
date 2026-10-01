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
    }
}
