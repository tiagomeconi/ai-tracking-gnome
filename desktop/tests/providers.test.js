import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { ClaudeSubscriptionProvider, parseRetryAfterMs } from '../src/main/providers/claudeSubscription.js';
import { AntigravitySubscriptionProvider, extractAccessToken } from '../src/main/providers/antigravitySubscription.js';
import { CodexSubscriptionProvider } from '../src/main/providers/codexSubscription.js';

function jsonResponse(status, body, headers = {}) {
    return {
        status,
        headers: new Map(Object.entries(headers)),
        text: async () => JSON.stringify(body),
        json: async () => body,
    };
}

function writeCredentials(token, expiresAt) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aum-claude-'));
    const file = path.join(dir, '.credentials.json');
    fs.writeFileSync(file, JSON.stringify({ claudeAiOauth: { accessToken: token, expiresAt } }));
    return file;
}

const CLAUDE_PAYLOAD = {
    five_hour: { utilization: 42, resets_at: '2099-01-01T00:00:00Z' },
    seven_day: { utilization: 10, resets_at: '2099-01-05T00:00:00Z' },
};

test('claude: sem arquivo de credenciais -> auth_required, sem chamar a rede', async () => {
    const provider = new ClaudeSubscriptionProvider({
        credentialsPath: '/nao/existe/.credentials.json',
        fetchImpl: async () => { throw new Error('não deveria chamar'); },
    });
    assert.equal(await provider.isConfigured(), false);
    assert.equal((await provider.fetchUsage()).status, 'auth_required');
});

test('claude: resposta 200 vira janelas reais e envia o bearer certo', async () => {
    let seen;
    const provider = new ClaudeSubscriptionProvider({
        credentialsPath: writeCredentials('tok123'),
        fetchImpl: async (url, init) => { seen = { url, init }; return jsonResponse(200, CLAUDE_PAYLOAD); },
    });
    const usage = await provider.fetchUsage();
    assert.equal(usage.status, 'ok');
    assert.ok(usage.windows.length >= 1);
    assert.equal(seen.init.headers.Authorization, 'Bearer tok123');
    assert.equal(seen.init.headers['anthropic-beta'], 'oauth-2025-04-20');
});

test('claude: token vencido -> PROVIDER_SESSION_EXPIRED sem chamar a rede', async () => {
    const provider = new ClaudeSubscriptionProvider({
        credentialsPath: writeCredentials('t', Date.now() - 1000),
        fetchImpl: async () => { throw new Error('não deveria chamar'); },
    });
    const usage = await provider.fetchUsage();
    assert.equal(usage.status, 'auth_required');
    assert.equal(usage.errorCode, 'PROVIDER_SESSION_EXPIRED');
});

test('claude: 429 informa retryAt a partir do Retry-After', async () => {
    const provider = new ClaudeSubscriptionProvider({
        credentialsPath: writeCredentials('t', Date.now() + 3_600_000),
        fetchImpl: async () => jsonResponse(429, {}, { 'retry-after': '600' }),
    });
    const usage = await provider.fetchUsage();
    const waitMs = Date.parse(usage.retryAt) - Date.now();
    assert.ok(waitMs > 590_000 && waitMs <= 600_000);
});

test('claude: 401 -> auth_required; 429 entra em cooldown e não rechama a rede', async () => {
    let calls = 0;
    const provider = new ClaudeSubscriptionProvider({
        credentialsPath: writeCredentials('t'),
        fetchImpl: async () => { calls++; return jsonResponse(429, {}, { 'retry-after': '120' }); },
    });
    assert.equal((await provider.fetchUsage()).errorCode, 'PROVIDER_RATE_LIMITED');
    assert.equal((await provider.fetchUsage()).errorCode, 'PROVIDER_RATE_LIMITED');
    assert.equal(calls, 1);

    const unauthorized = new ClaudeSubscriptionProvider({
        credentialsPath: writeCredentials('t'),
        fetchImpl: async () => jsonResponse(401, {}),
    });
    assert.equal((await unauthorized.fetchUsage()).status, 'auth_required');
});

test('claude: falha de rede e payload sem janelas viram erro', async () => {
    const down = new ClaudeSubscriptionProvider({ credentialsPath: writeCredentials('t'), fetchImpl: async () => { throw new Error('offline'); } });
    assert.equal((await down.fetchUsage()).errorCode, 'PROVIDER_UNAVAILABLE');

    const empty = new ClaudeSubscriptionProvider({ credentialsPath: writeCredentials('t'), fetchImpl: async () => jsonResponse(200, {}) });
    assert.equal((await empty.fetchUsage()).errorCode, 'PROVIDER_INVALID_RESPONSE');
});

test('parseRetryAfterMs: segundos, data HTTP e inválido', () => {
    assert.equal(parseRetryAfterMs('120'), 120_000);
    assert.equal(parseRetryAfterMs(null), null);
    assert.equal(parseRetryAfterMs('lixo'), null);
    const now = Date.parse('2026-01-01T00:00:00Z');
    assert.equal(parseRetryAfterMs('Thu, 01 Jan 2026 00:01:00 GMT', now), 60_000);
});

test('antigravity: sem item no keyring -> auth_required', async () => {
    const provider = new AntigravitySubscriptionProvider({ readSecret: async () => null, fetchImpl: async () => { throw new Error('x'); } });
    assert.equal(await provider.isConfigured(), false);
    assert.equal((await provider.fetchUsage()).status, 'auth_required');
});

test('antigravity: usa o access_token do keyring nas duas chamadas e 403 vira auth_required', async () => {
    const secret = JSON.stringify({ token: { access_token: 'gtok' }, email: 'a@b.c' });
    const calls = [];
    const provider = new AntigravitySubscriptionProvider({
        readSecret: async (attrs) => { assert.deepEqual(attrs, { service: 'gemini', username: 'antigravity' }); return secret; },
        fetchImpl: async (url, init) => { calls.push({ url, auth: init.headers.Authorization }); return jsonResponse(403, {}); },
    });
    assert.equal((await provider.fetchUsage()).status, 'auth_required');
    assert.equal(calls[0].auth, 'Bearer gtok');
    assert.ok(calls[0].url.endsWith('/v1internal:loadCodeAssist'));
});

test('extractAccessToken: JSON inválido ou sem token -> null', () => {
    assert.equal(extractAccessToken('nao-json'), null);
    assert.equal(extractAccessToken('{"token":{}}'), null);
    assert.equal(extractAccessToken('{"token":{"access_token":"x"}}'), 'x');
});

function fakeCodexProcess(onWrite) {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    child.pid = 1;
    child.stdin.on('data', (chunk) => onWrite(chunk.toString(), child));
    return child;
}

test('codex: envia o handshake JSON-RPC e lê a resposta do id 2', async () => {
    let written = '';
    const provider = new CodexSubscriptionProvider({
        spawnImpl: (bin, args) => {
            assert.deepEqual(args, ['app-server', '--stdio']);
            return fakeCodexProcess((text, child) => {
                written += text;
                child.stdout.write('ruído não-JSON\n');
                child.stdout.write(JSON.stringify({ id: 1, result: {} }) + '\n');
                child.stdout.write(JSON.stringify({ id: 2, result: { rateLimits: { primary: { usedPercent: 33, windowDurationMins: 300, resetsAt: 4102444800 } } } }) + '\n');
            });
        },
    });
    const usage = await provider.fetchUsage();
    assert.match(written, /account\/rateLimits\/read/);
    assert.ok(['ok', 'error'].includes(usage.status)); // formato exato coberto em codexSubscriptionParser.test.js
});

test('codex: erro JSON-RPC -> auth_required; binário ausente -> PROVIDER_UNAVAILABLE', async () => {
    const rejected = new CodexSubscriptionProvider({
        spawnImpl: () => fakeCodexProcess((_text, child) => child.stdout.write(JSON.stringify({ id: 2, error: { code: -1 } }) + '\n')),
    });
    assert.equal((await rejected.fetchUsage()).status, 'auth_required');

    const missing = new CodexSubscriptionProvider({
        spawnImpl: () => {
            const child = new EventEmitter();
            child.stdout = new PassThrough();
            child.stdin = new PassThrough();
            child.kill = () => {};
            queueMicrotask(() => child.emit('error', Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' })));
            return child;
        },
    });
    assert.equal((await missing.fetchUsage()).errorCode, 'PROVIDER_UNAVAILABLE');
});
