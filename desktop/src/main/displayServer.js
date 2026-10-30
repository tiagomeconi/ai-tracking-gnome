// Decide se o app precisa se relançar em XWayland. O Electron >= 38 usa
// Wayland nativo por padrão e, lá, o app não pode posicionar nem mover a
// própria janela (arrastar painel/widget não funciona, e o painel abre no
// lugar errado). A plataforma é escolhida antes do JS rodar e o Chromium já
// preenche `ozone-platform` sozinho, então o que importa é o VALOR dela.

/**
 * @param {NodeJS.Platform} platform
 * @param {Record<string, string|undefined>} env
 * @param {string} ozoneValue - valor atual de `ozone-platform` ('' se ausente).
 */
export function isWaylandSession(platform, env) {
    return platform === 'linux' && (env.XDG_SESSION_TYPE === 'wayland' || Boolean(env.WAYLAND_DISPLAY));
}

export function shouldRelaunchForX11(platform, env, ozoneValue) {
    if (!isWaylandSession(platform, env) || env.AI_USAGE_NATIVE_WAYLAND)
        return false;
    return ozoneValue !== 'x11';
}
