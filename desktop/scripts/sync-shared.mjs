// Copia a lógica de domínio pura de extension/lib para src/shared — o
// electron-builder só empacota arquivos dentro de desktop/, e assim há uma
// única fonte de verdade (extension/lib) compartilhada com a extensão GNOME.
// Arquivos que importam `gi://` (GJS) são pulados automaticamente.

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', '..', 'extension', 'lib');
const target = join(here, '..', 'src', 'shared');

rmSync(target, { recursive: true, force: true });

function copyDir(from, to) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
        const src = join(from, entry);
        if (statSync(src).isDirectory()) {
            copyDir(src, join(to, entry));
        } else if (entry.endsWith('.js') && !readFileSync(src, 'utf8').includes("'gi://")) {
            cpSync(src, join(to, entry));
        }
    }
}

copyDir(source, target);
console.log(`shared: ${source} -> ${target}`);
