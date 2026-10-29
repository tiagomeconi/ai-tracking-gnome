// Widget flutuante: resumo compacto (um pico de uso por provider). Só DOM
// APIs, sem innerHTML. O arraste é manual: o processo principal move a janela.

const root = document.getElementById('widget');

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text != null)
        node.textContent = text;
    return node;
}

function renderProvider(p) {
    const wrap = el('div', 'row-wrap');
    const row = el('div', 'row');
    const icon = document.createElement('img');
    icon.src = `../../assets/icons/${encodeURIComponent(p.id)}.png`;
    icon.alt = '';
    icon.addEventListener('error', () => icon.remove());
    row.append(icon, el('span', 'name', p.name.replace(/\s*\(.*\)$/, '')), el('span', 'percent', p.widget ? `${p.widget.percent}%` : '—'));

    const bar = el('div', 'mini-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', `${p.name}${p.widget ? ` — ${p.widget.label}` : ''}: ${p.widget ? `${p.widget.percent}%` : 'sem dados'}`);
    const fill = el('div', `mini-fill ${p.widget?.state ?? 'unknown'}`);
    fill.style.width = `${p.widget?.percent ?? 0}%`;
    bar.append(fill);

    wrap.append(row, bar);
    if (p.widget) {
        const detail = [p.widget.label, p.widget.resetText].filter(Boolean).join(' · ');
        wrap.append(el('div', 'detail', detail));
    } else if (p.message) {
        wrap.title = p.message;
    }
    return wrap;
}

function render(vm) {
    root.replaceChildren(...(vm.empty ? [el('div', 'empty', 'Nenhum provedor ativo')] : vm.providers.map(renderProvider)));
    requestAnimationFrame(() => requestAnimationFrame(() => window.aiUsage.reportWidgetHeight(root.offsetHeight + 4)));
}

// O arraste fica em drag.js; aqui só menu de contexto e duplo clique.
document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.aiUsage.widgetMenu();
});
document.addEventListener('dblclick', () => window.aiUsage.openPopup());

window.aiUsage.onState(render);
window.aiUsage.getState().then(render);
