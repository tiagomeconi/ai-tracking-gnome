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
