import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseClaudeCredentials, EXPIRY_SKEW_MS } from '../extension/lib/providers/claudeCredentials.js';

const NOW = 1_000_000_000_000;
const creds = (expiresAt) => ({ claudeAiOauth: { accessToken: 'tok', expiresAt } });

test('parseClaudeCredentials: token válido no futuro não está expirado', () => {
    assert.deepEqual(parseClaudeCredentials(creds(NOW + 3_600_000), NOW), { token: 'tok', expired: false });
});

test('parseClaudeCredentials: vencido, ou vencendo dentro da margem, conta como expirado', () => {
    assert.equal(parseClaudeCredentials(creds(NOW - 1), NOW).expired, true);
    assert.equal(parseClaudeCredentials(creds(NOW + EXPIRY_SKEW_MS - 1), NOW).expired, true);
    assert.equal(parseClaudeCredentials(creds(NOW + EXPIRY_SKEW_MS + 1), NOW).expired, false);
});

test('parseClaudeCredentials: sem expiresAt assume válido; sem token/JSON estranho -> null', () => {
    assert.equal(parseClaudeCredentials(creds(undefined), NOW).expired, false);
    assert.equal(parseClaudeCredentials({ claudeAiOauth: {} }, NOW), null);
    assert.equal(parseClaudeCredentials(null, NOW), null);
    assert.equal(parseClaudeCredentials({ claudeAiOauth: { accessToken: '' } }, NOW), null);
});
