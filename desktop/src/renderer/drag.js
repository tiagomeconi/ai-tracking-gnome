// Arraste manual da janela inteira (popup e widget): o processo principal
// move a janela com deltas de tela. Regiões `-webkit-app-region: drag` só
// cobriam a barra inferior e engolem clique direito/duplo clique no Windows.
// Controles interativos (botões, links, resumos) continuam clicáveis.

(() => {
    const INTERACTIVE = 'button, a, summary, input, select, textarea';
    let origin = null;

    document.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || event.target.closest(INTERACTIVE))
            return;
        origin = { x: event.screenX, y: event.screenY };
        document.body.classList.add('dragging');
        document.body.setPointerCapture(event.pointerId);
        window.aiUsage.dragStart();
    });
    document.addEventListener('pointermove', (event) => {
        if (origin)
            window.aiUsage.dragMove(event.screenX - origin.x, event.screenY - origin.y);
    });
    const end = () => {
        if (!origin)
            return;
        origin = null;
        document.body.classList.remove('dragging');
        window.aiUsage.dragEnd();
    };
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
})();
