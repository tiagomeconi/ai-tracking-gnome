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
    row.append(icon, el('span', 'name', p.name.replace(/\s*\(.*\)$/, '')), el('span', 'percent', p.peak ? `${p.peak.percent}%` : '—'));

    const bar = el('div', 'mini-bar');
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-label', `${p.name}: ${p.peak ? `${p.peak.percent}%` : 'sem dados'}`);
    const fill = el('div', `mini-fill ${p.peak?.state ?? 'unknown'}`);
    fill.style.width = `${p.peak?.percent ?? 0}%`;
    bar.append(fill);

    wrap.append(row, bar);
    if (p.message)
        wrap.title = p.message;
    return wrap;
}

function render(vm) {
    root.replaceChildren(...(vm.empty ? [el('div', 'empty', 'Nenhum provedor ativo')] : vm.providers.map(renderProvider)));
    requestAnimationFrame(() => requestAnimationFrame(() => window.aiUsage.reportWidgetHeight(root.offsetHeight + 4)));
}

// Arraste manual com deltas de tela.
let drag = null;
document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0)
        return;
    drag = { x: event.screenX, y: event.screenY };
    document.body.classList.add('dragging');
    document.body.setPointerCapture(event.pointerId);
    window.aiUsage.widgetDragStart();
});
document.addEventListener('pointermove', (event) => {
    if (drag)
        window.aiUsage.widgetDragMove(event.screenX - drag.x, event.screenY - drag.y);
});
function endDrag() {
    if (!drag)
        return;
    drag = null;
    document.body.classList.remove('dragging');
    window.aiUsage.widgetDragEnd();
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.aiUsage.widgetMenu();
});
document.addEventListener('dblclick', () => window.aiUsage.openPopup());

window.aiUsage.onState(render);
window.aiUsage.getState().then(render);
