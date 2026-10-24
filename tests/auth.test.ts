import test from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken } from '../src/server/auth';

test('bearerToken accepts a well-formed header', () => {
  const t = 'eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop.qrstuvwxyz123456';
  assert.equal(bearerToken(`Bearer ${t}`), t);
});

test('bearerToken rejects missing, short or malformed headers', () => {
  assert.equal(bearerToken(null), null);
  assert.equal(bearerToken(''), null);
  assert.equal(bearerToken('Bearer short'), null);
  assert.equal(bearerToken('Basic abcdefghijklmnopqrstuvwxyz'), null);
  assert.equal(bearerToken('Bearer abc def ghijklmnopqrstuvwxyz1234'), null);
});
