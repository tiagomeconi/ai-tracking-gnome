// Posição do popup perto do ícone da bandeja (pura, sem Electron).
// `anchor` é o retângulo do ícone (`tray.getBounds()`); no Linux muitos
// ambientes retornam 0x0 — nesse caso o chamador passa o ponto do cursor
// como retângulo de tamanho zero.

const MARGIN = 8;

/**
 * @param {{x:number,y:number,width:number,height:number}} anchor
 * @param {{width:number,height:number}} size - tamanho do popup
 * @param {{x:number,y:number,width:number,height:number}} workArea - área útil do monitor (sem a barra de tarefas)
 */
export function computePopupPosition(anchor, size, workArea) {
    const anchorCenterX = anchor.x + anchor.width / 2;
    const workMidY = workArea.y + workArea.height / 2;

    // Ícone na metade de baixo da tela (barra do Windows, normal) -> popup acima; senão abaixo.
    const y = anchor.y + anchor.height / 2 >= workMidY
        ? anchor.y - size.height - MARGIN
        : anchor.y + anchor.height + MARGIN;
    const x = anchorCenterX - size.width / 2;

    const maxX = workArea.x + workArea.width - size.width - MARGIN;
    const maxY = workArea.y + workArea.height - size.height - MARGIN;

    return {
        x: Math.round(Math.max(workArea.x + MARGIN, Math.min(x, maxX))),
        y: Math.round(Math.max(workArea.y + MARGIN, Math.min(y, maxY))),
    };
}

/**
 * Posição inicial do widget flutuante: a salva, se ainda estiver visível em
 * algum monitor (o usuário pode ter desligado a tela onde ela estava);
 * senão o canto inferior direito da área útil principal.
 * @param {{x:number,y:number}|null} saved
 * @param {{width:number,height:number}} size
 * @param {{x:number,y:number,width:number,height:number}[]} workAreas
 * @param {{x:number,y:number,width:number,height:number}} primary
 */
export function resolveWidgetPosition(saved, size, workAreas, primary) {
    const visible = saved && workAreas.some((area) =>
        saved.x + size.width > area.x + MARGIN && saved.x < area.x + area.width - MARGIN
        && saved.y + size.height > area.y + MARGIN && saved.y < area.y + area.height - MARGIN);
    if (visible)
        return { x: Math.round(saved.x), y: Math.round(saved.y) };
    return {
        x: Math.round(primary.x + primary.width - size.width - 16),
        y: Math.round(primary.y + primary.height - size.height - 16),
    };
}

/** Âncora de tamanho zero no canto inferior direito da área útil (bandeja sem posição conhecida). */
export function cornerAnchor(workArea) {
    return { x: workArea.x + workArea.width, y: workArea.y + workArea.height, width: 0, height: 0 };
}
