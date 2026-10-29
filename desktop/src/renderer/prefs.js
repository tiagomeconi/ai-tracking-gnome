// Janela de preferências: provedores, notificações e gráfico de
// estatísticas (equivalente ao prefs.js da extensão GNOME). Só DOM APIs.

const api = window.aiUsage;
const $ = (id) => document.getElementById(id);

let settings = null;

function stateForPercent(percent) {
    // Mesmos limites de USAGE_THRESHOLDS (shared/types.js): 70 / 85 / 95.
    if (percent >= 95) return 'critical';
    if (percent >= 85) return 'high';
    if (percent >= 70) return 'attention';
    return 'normal';
}

async function save(patch) {
    settings = await api.updateSettings(patch);
}

function renderProviders(providers) {
    $('providers').replaceChildren(...providers.map((provider) => {
        const label = document.createElement('label');
        label.className = 'row';

        const text = document.createElement('span');
        text.textContent = provider.name;
        if (provider.dev) {
            const note = document.createElement('small');
            note.textContent = 'Em desenvolvimento — ainda usa dados de demonstração';
            text.append(note);
        }

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !settings.disabledProviders.includes(provider.id);
        input.addEventListener('change', () => {
            const disabled = new Set(settings.disabledProviders);
            if (input.checked)
                disabled.delete(provider.id);
            else
                disabled.add(provider.id);
            save({ disabledProviders: [...disabled] });
        });

        label.append(text, input);
        return label;
    }));
}

// Para cada provider, qual janela o widget mostra ("auto" = a de maior consumo).
function renderWidgetWindows(providers, windows) {
    $('widget-windows').replaceChildren(...providers.map((provider) => {
        const label = document.createElement('label');
        label.className = 'row';
        const text = document.createElement('span');
        text.textContent = `Widget — ${provider.name}`;

        const select = document.createElement('select');
        const options = [{ id: 'auto', label: 'Automático (maior consumo)' }, ...(windows[provider.id] ?? [])];
        const saved = settings.widgetWindows[provider.id];
        if (saved && !options.some((o) => o.id === saved))
            options.push({ id: saved, label: saved });
        select.replaceChildren(...options.map((o) => {
            const option = document.createElement('option');
            option.value = o.id;
            option.textContent = o.label;
            return option;
        }));
        select.value = saved ?? 'auto';
        select.addEventListener('change', () => save({ widgetWindows: { ...settings.widgetWindows, [provider.id]: select.value } }));

        label.append(text, select);
        return label;
    }));
}

async function init() {
    const data = await api.getSettings();
    settings = data.settings;

    renderProviders(data.providers);

    const trayProvider = $('tray-provider');
    trayProvider.replaceChildren(...[{ id: 'auto', name: 'Automático (mais crítica)' }, ...data.providers].map((p) => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = p.name;
        return option;
    }));
    trayProvider.value = settings.trayProvider;
    trayProvider.addEventListener('change', () => save({ trayProvider: trayProvider.value }));
    $('tray-style').value = settings.trayStyle;
    $('tray-style').addEventListener('change', (event) => save({ trayStyle: event.target.value }));

    renderWidgetWindows(data.providers, data.windows);
    $('widget-enabled').checked = settings.widgetEnabled;
    $('widget-opacity').value = settings.widgetOpacity;
    $('widget-opacity').disabled = !settings.widgetEnabled;
    $('widget-enabled').addEventListener('change', (event) => {
        $('widget-opacity').disabled = !event.target.checked;
        save({ widgetEnabled: event.target.checked });
    });
    $('widget-opacity').addEventListener('change', (event) => save({ widgetOpacity: Number(event.target.value) }));

    $('notif-enabled').checked = settings.notificationsEnabled;
    $('notif-threshold').value = settings.notificationThresholdPercent;
    $('notif-threshold').disabled = !settings.notificationsEnabled;
    $('notif-enabled').addEventListener('change', (event) => {
        $('notif-threshold').disabled = !event.target.checked;
        save({ notificationsEnabled: event.target.checked });
    });
    $('notif-threshold').addEventListener('change', (event) => {
        const value = Math.min(100, Math.max(1, Math.round(Number(event.target.value)) || settings.notificationThresholdPercent));
        event.target.value = value;
        save({ notificationThresholdPercent: value });
    });

    if (data.canLaunchAtLogin) {
        $('login-section').hidden = false;
        $('launch-login').checked = settings.launchAtLogin;
        $('launch-login').addEventListener('change', (event) => save({ launchAtLogin: event.target.checked }));
    }
}

// --- Estatísticas ---

let series = [];

function renderChart() {
    const chosen = series[Number($('series').value)];
    const chart = $('chart');
    chart.replaceChildren();
    $('chart-empty').hidden = series.length > 0;
    $('chart').hidden = series.length === 0;
    if (!chosen)
        return;

    chart.setAttribute('aria-label', `Pico diário de ${chosen.providerName} — ${chosen.windowLabel}`);
    for (const day of chosen.days) {
        const col = document.createElement('div');
        col.className = 'col';
        col.title = `${day.date}: ${Math.round(day.percent)}%`;

        const value = document.createElement('span');
        value.className = 'value';
        value.textContent = `${Math.round(day.percent)}`;

        const bar = document.createElement('div');
        bar.className = `bar ${stateForPercent(day.percent)}`;
        bar.style.height = `${Math.max(0, Math.min(100, day.percent)) * 0.8}%`;

        const label = document.createElement('span');
        label.className = 'day';
        label.textContent = day.date.slice(5); // MM-DD

        col.append(value, bar, label);
        chart.append(col);
    }
}

async function loadStats() {
    series = await api.getHistory();
    $('series').replaceChildren(...series.map((s, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = `${s.providerName} — ${s.windowLabel}`;
        return option;
    }));
    renderChart();
}

$('series').addEventListener('change', renderChart);

for (const tab of document.querySelectorAll('[role="tab"]')) {
    tab.addEventListener('click', () => {
        for (const other of document.querySelectorAll('[role="tab"]')) {
            const active = other === tab;
            other.setAttribute('aria-selected', String(active));
            $(other.dataset.panel).hidden = !active;
        }
        if (tab.dataset.panel === 'stats')
            loadStats();
    });
}

init();
