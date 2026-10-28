// Gera o ícone da bandeja como PNG em memória (RGBA, sem dependência
// nativa): um círculo na cor do estado com o percentual em dígitos. É
// necessário porque a bandeja do Windows (e da maioria dos ambientes
// Linux) não exibe texto ao lado do ícone, ao contrário da top bar do
// GNOME — então o número precisa estar desenhado no próprio ícone.

import zlib from 'node:zlib';

export const STATE_COLORS = {
    normal: [58, 156, 58],
    attention: [208, 160, 32],
    high: [217, 119, 6],
    critical: [204, 51, 51],
    unknown: [110, 110, 110],
};

// Fonte bitmap 5x7 (cada string é uma linha; '#' = pixel aceso).
const GLYPHS = {
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
};

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer)
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([length, typeBuf, data, crc]);
}

export function encodePng(width, height, rgba) {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // bit depth
    header[9] = 6; // RGBA

    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = 0; // filtro "none"
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// Cobertura (0..1) de um pixel para um segmento de arco: anel entre os raios
// `inner` e `outer`, na faixa de ângulos [from, to] (graus, 180 = esquerda,
// 270 = topo, 360 = direita; y cresce para baixo). Borda suavizada.
function arcCoverage(x, y, cx, cy, inner, outer, from, to) {
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.hypot(dx, dy);
    const radial = Math.min(outer - dist, dist - inner) + 0.5;
    if (radial <= 0)
        return 0;
    const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    const mid = (inner + outer) / 2;
    const toDeg = (px) => (px / mid) * 180 / Math.PI; // 1px de arco em graus
    const angular = Math.min(1, Math.max(0, Math.min(angle - from, to - angle) / toDeg(1) + 0.5));
    return Math.min(1, radial) * angular;
}

function setPixel(rgba, size, x, y, [r, g, b], alpha) {
    if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0)
        return;
    const i = (y * size + x) * 4;
    const prev = rgba[i + 3] / 255;
    const out = alpha + prev * (1 - alpha);
    for (let c = 0; c < 3; c++)
        rgba[i + c] = Math.round(([r, g, b][c] * alpha + rgba[i + c] * prev * (1 - alpha)) / out);
    rgba[i + 3] = Math.round(out * 255);
}

// Dígitos brancos com contorno escuro: o fundo do painel pode ser claro ou escuro.
function drawDigits(rgba, size, text, scale, topY, ink, outline = [25, 25, 25]) {
    const glyphW = 5 * scale;
    const gap = scale;
    const textW = text.length * glyphW + (text.length - 1) * gap;
    const startX = Math.round((size - textW) / 2);
    const paint = (offsetX, offsetY, color) => [...text].forEach((char, index) => {
        const glyph = GLYPHS[char];
        const originX = startX + index * (glyphW + gap) + offsetX;
        for (let row = 0; row < 7; row++)
            for (let col = 0; col < 5; col++)
                if (glyph[row][col] === '#')
                    for (let dy = 0; dy < scale; dy++)
                        for (let dx = 0; dx < scale; dx++)
                            setPixel(rgba, size, originX + col * scale + dx, topY + offsetY + row * scale + dy, color, 1);
    });
    for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]])
        paint(ox, oy, outline);
    paint(0, 0, ink);
}

/**
 * Ícone de velocímetro (meia-lua): trilho cinza, arco preenchido na cor do
 * estado proporcional ao percentual, ponteiro e o número embaixo.
 * @param {number|null} percent - null desenha só o trilho cinza e "-".
 * @param {keyof typeof STATE_COLORS} state
 * @param {number} [size] - lado em pixels (padrão 64; o painel do KDE reduz para ~22).
 * @returns {Buffer} PNG
 */
export function renderGaugeIcon(percent, state = 'unknown', size = 64) {
    const rgba = Buffer.alloc(size * size * 4);
    const color = STATE_COLORS[state] ?? STATE_COLORS.unknown;
    const track = [150, 150, 150];
    const cx = (size - 1) / 2;
    const outer = size / 2 - 1;
    const thickness = Math.max(3, Math.round(size * 0.16));
    const inner = outer - thickness;
    const cy = size * 0.58; // o arco ocupa a parte de cima; o número, a de baixo
    const value = typeof percent === 'number' ? Math.min(100, Math.max(0, percent)) : 0;
    const sweepEnd = 180 + (value / 100) * 180;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            setPixel(rgba, size, x, y, track, arcCoverage(x, y, cx, cy, inner, outer, 180, 360) * 0.55);
            if (value > 0)
                setPixel(rgba, size, x, y, color, arcCoverage(x, y, cx, cy, inner, outer, 180, sweepEnd));
        }
    }

    // Ponteiro do centro até a base do arco.
    if (typeof percent === 'number') {
        const rad = (sweepEnd * Math.PI) / 180;
        const length = inner - 1;
        const half = Math.max(0.9, size / 40);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - cx;
                const dy = y - cy;
                const along = dx * Math.cos(rad) + dy * Math.sin(rad);
                const across = Math.abs(-dx * Math.sin(rad) + dy * Math.cos(rad));
                if (along >= 0 && along <= length)
                    setPixel(rgba, size, x, y, [240, 240, 240], Math.min(1, half - across + 0.5));
            }
        }
    }

    const text = typeof percent === 'number' ? String(Math.min(99, Math.max(0, Math.round(percent)))) : '-';
    const scale = Math.max(1, Math.floor(size / 32));
    const top = Math.min(size - 7 * scale - 1, Math.round(cy + size * 0.06));
    drawDigits(rgba, size, text, scale, top, [245, 245, 245]);

    return encodePng(size, size, rgba);
}

/**
 * @param {number|null} percent - null desenha "-" cinza (sem dado).
 * @param {keyof typeof STATE_COLORS} state
 * @param {number} [size] - lado em pixels (padrão 32; o SO reduz para 16 em telas 1x).
 * @returns {Buffer} PNG
 */
export function renderTrayIcon(percent, state = 'unknown', size = 32) {
    const rgba = Buffer.alloc(size * size * 4);
    const [r, g, b] = STATE_COLORS[state] ?? STATE_COLORS.unknown;
    const center = (size - 1) / 2;
    const radius = size / 2 - 0.5;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const dist = Math.hypot(x - center, y - center);
            const alpha = Math.max(0, Math.min(1, radius - dist + 0.5)); // borda suavizada
            const i = (y * size + x) * 4;
            rgba[i] = r;
            rgba[i + 1] = g;
            rgba[i + 2] = b;
            rgba[i + 3] = Math.round(alpha * 255);
        }
    }

    // O ícone mostra no máximo 2 dígitos (100% aparece como "99"; o valor
    // exato fica no tooltip) para manter o número legível em 16 px.
    const text = typeof percent === 'number' ? String(Math.min(99, Math.max(0, Math.round(percent)))) : '-';
    const scale = Math.max(1, Math.floor(size / 16));
    const glyphW = 5 * scale;
    const glyphH = 7 * scale;
    const gap = scale;
    const textW = text.length * glyphW + (text.length - 1) * gap;
    const startX = Math.round((size - textW) / 2);
    const startY = Math.round((size - glyphH) / 2);
    // Texto escuro sobre amarelo (contraste), branco nos demais.
    const ink = state === 'attention' ? [30, 30, 30] : [255, 255, 255];

    [...text].forEach((char, index) => {
        const glyph = GLYPHS[char];
        const originX = startX + index * (glyphW + gap);
        for (let row = 0; row < 7; row++) {
            for (let col = 0; col < 5; col++) {
                if (glyph[row][col] !== '#')
                    continue;
                for (let dy = 0; dy < scale; dy++) {
                    for (let dx = 0; dx < scale; dx++) {
                        const px = originX + col * scale + dx;
                        const py = startY + row * scale + dy;
                        if (px < 0 || py < 0 || px >= size || py >= size)
                            continue;
                        const i = (py * size + px) * 4;
                        rgba[i] = ink[0];
                        rgba[i + 1] = ink[1];
                        rgba[i + 2] = ink[2];
                        rgba[i + 3] = 255;
                    }
                }
            }
        }
    });

    return encodePng(size, size, rgba);
}
