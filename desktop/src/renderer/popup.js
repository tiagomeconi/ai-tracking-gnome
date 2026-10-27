// Desenha o view-model recebido do processo principal (ver
// src/main/viewModel.js). Só usa textContent/DOM APIs — nunca innerHTML —
// porque parte dos textos vem de respostas de rede.

const content = document.getElementById('content');
const updated = document.getElementById('updated');

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text != null)
        node.textContent = text;
    return node;
}

function renderWindow(w) {
    const row = el('div', 'window');
    const bar = el('div', 'bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', w.text);
    if (w.percent != null) {
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        bar.setAttribute('aria-valuenow', String(Math.round(w.percent)));
    }
    const fill = el('div', `fill ${w.state}`);
    fill.style.width = `${w.percent ?? 0}%`;
    bar.append(fill);
    row.append(bar, el('div', 'window-label', w.text));
    if (w.resetText)
        row.append(el('div', 'window-reset', w.resetText));
    if (w.budgetText)
        row.append(el('div', 'window-budget', w.budgetText));
    return row;
}

function renderProvider(p) {
    const card = el('section', 'provider');

    const header = el('div', 'provider-header');
    const icon = document.createElement('img');
    icon.src = `../../assets/icons/${encodeURIComponent(p.id)}.png`;
    icon.alt = '';
    icon.addEventListener('error', () => icon.remove());
    header.append(icon, el('span', 'provider-name', p.name));
    if (p.manageUrl) {
        const link = el('button', null, '↗');
        link.type = 'button';
        link.title = `Abrir página de uso/cobrança de ${p.name}`;
        link.setAttribute('aria-label', link.title);
        link.addEventListener('click', () => window.aiUsage.openExternal(p.manageUrl));
        header.append(link);
    }
    card.append(header);

    if (p.accountLabel)
        card.append(el('div', 'account', p.accountLabel));
    if (p.message)
        card.append(el('div', 'status', p.message));

    if (p.windows.length > 0) {
        const rows = p.windows.map(renderWindow);
        if (p.collapsed) {
            const details = el('details');
            details.append(el('summary', null, `Ver ${p.windows.length} janelas de uso`), ...rows);
            details.addEventListener('toggle', reportHeight);
            card.append(details);
        } else {
            card.append(...rows);
        }
        if (p.stale)
            card.append(el('div', 'stale', 'Último dado conhecido (desatualizado)'));
    }
    return card;
}

function render(vm) {
    content.replaceChildren(...(vm.empty
        ? [el('p', 'empty', 'Nenhum provedor para exibir. Ative algum nas preferências.')]
        : vm.providers.map(renderProvider)));
    updated.textContent = vm.lastUpdatedText;
    reportHeight();
}

function reportHeight() {
    // Dois frames: espera o <details> aplicar o novo layout antes de medir.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        // body (altura do conteúdo), não <html> (que nunca fica menor que a janela).
        window.aiUsage.reportHeight(document.body.offsetHeight);
    }));
}

document.getElementById('refresh').addEventListener('click', () => window.aiUsage.refresh());
document.getElementById('prefs').addEventListener('click', () => window.aiUsage.openPreferences());
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape')
        window.aiUsage.hidePopup();
});

window.aiUsage.onState(render);
window.aiUsage.getState().then(render);
