// Leitura (somente leitura) de um item do chat de credenciais do sistema
// operacional — usado para o token OAuth que o Antigravity CLI (`agy`) já
// gravou no keyring (ADR-008). Equivalente multiplataforma do
// `Secret.password_lookup` (libsecret) da extensão GNOME:
//
//   Linux   -> `secret-tool lookup` (Secret Service / libsecret)
//   Windows -> Credential Manager (CredRead via PowerShell, sem módulo nativo)
//   macOS   -> `security find-generic-password`
//
// Regra inegociável (seção 8.1 do plano): o valor do segredo nunca é
// logado nem incluído em erro. Só o item exato pedido é consultado — nunca
// `secret-tool search --all`, que imprimiria segredos alheios (ver ADR-008).
//
// NÃO validado em Windows/macOS reais neste ambiente de desenvolvimento
// (e o nome exato do item do `agy` no Credential Manager é uma suposição
// baseada no padrão `<service>:<user>` do go-keyring) — validar à mão.

import { execFile } from 'node:child_process';

const SAFE_ARG = /^[A-Za-z0-9._:-]+$/;
const EXEC_TIMEOUT_MS = 10_000;

function defaultRun(command, args) {
    return new Promise((resolve, reject) => {
        execFile(command, args, { timeout: EXEC_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout) => {
            if (error)
                reject(error);
            else
                resolve(stdout);
        });
    });
}

/**
 * O go-keyring (usado por CLIs em Go) grava o segredo no Credential Manager
 * ora como UTF-8, ora como UTF-16LE, conforme a versão — detecta pelo
 * padrão de bytes nulos intercalados típico de UTF-16 com texto ASCII.
 */
export function decodeWindowsBlob(buffer) {
    if (buffer.length === 0)
        return null;
    const looksUtf16 = buffer.length >= 4 && buffer.length % 2 === 0 && buffer[1] === 0 && buffer[3] === 0;
    return buffer.toString(looksUtf16 ? 'utf16le' : 'utf8');
}

function windowsScript(target) {
    return `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CredReader {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags; public int Type; public string TargetName; public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist;
        public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
    }
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
    [DllImport("advapi32.dll")]
    static extern void CredFree(IntPtr credential);
    public static string Read(string target) {
        IntPtr ptr;
        if (!CredRead(target, 1, 0, out ptr)) return null;
        try {
            CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            byte[] blob = new byte[c.CredentialBlobSize];
            Marshal.Copy(c.CredentialBlob, blob, 0, blob.Length);
            return Convert.ToBase64String(blob);
        } finally { CredFree(ptr); }
    }
}
"@
$result = [CredReader]::Read('${target}')
if ($null -eq $result) { exit 1 }
[Console]::Out.Write($result)
`;
}

/**
 * @param {{service: string, username: string}} attributes
 * @param {{platform?: string, run?: (cmd: string, args: string[]) => Promise<string>}} [options]
 * @returns {Promise<string|null>} o segredo, ou null se o item não existe /
 *   a ferramenta de keyring não está disponível.
 */
export async function readKeyringSecret({ service, username }, { platform = process.platform, run = defaultRun } = {}) {
    if (!SAFE_ARG.test(service) || !SAFE_ARG.test(username))
        throw new Error('readKeyringSecret: service/username contêm caracteres inválidos');

    try {
        if (platform === 'linux') {
            const out = await run('secret-tool', ['lookup', 'service', service, 'username', username]);
            return out.length > 0 ? out.replace(/\r?\n$/, '') : null;
        }

        if (platform === 'darwin') {
            const out = await run('security', ['find-generic-password', '-s', service, '-a', username, '-w']);
            return out.length > 0 ? out.replace(/\r?\n$/, '') : null;
        }

        if (platform === 'win32') {
            const encoded = Buffer.from(windowsScript(`${service}:${username}`), 'utf16le').toString('base64');
            const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
            const b64 = out.trim();
            return b64 ? decodeWindowsBlob(Buffer.from(b64, 'base64')) : null;
        }
    } catch {
        // Item inexistente (exit 1), ferramenta ausente (ENOENT) ou keyring
        // bloqueado — tudo tratado como "não configurado". Não propaga a
        // mensagem de erro (poderia conter dado sensível).
        return null;
    }

    return null;
}
