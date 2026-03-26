import { describe, it, expect } from 'vitest';
import { importEncryptionKey, encryptApiKey, decryptApiKey, sha256Hex, randomHex } from '../../src/oauth/crypto.js';

// A valid 256-bit hex key (64 hex chars = 32 bytes)
const TEST_KEY_HEX = 'a'.repeat(64);

describe('importEncryptionKey', () => {
  it('imports a valid 32-byte hex key', async () => {
    const key = await importEncryptionKey(TEST_KEY_HEX);
    expect(key).toBeDefined();
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM' });
  });

  it('rejects a key that is not 32 bytes', async () => {
    await expect(importEncryptionKey('abcd')).rejects.toThrow('32 bytes');
  });

  it('rejects an empty key', async () => {
    await expect(importEncryptionKey('')).rejects.toThrow('32 bytes');
  });
});

describe('encryptApiKey / decryptApiKey', () => {
  it('round-trips a plaintext string', async () => {
    const key = await importEncryptionKey(TEST_KEY_HEX);
    const plaintext = 'my-secret-api-key-12345';
    const encrypted = await encryptApiKey(key, plaintext);
    const decrypted = await decryptApiKey(key, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (random IV)', async () => {
    const key = await importEncryptionKey(TEST_KEY_HEX);
    const plaintext = 'same-plaintext';
    const a = await encryptApiKey(key, plaintext);
    const b = await encryptApiKey(key, plaintext);
    expect(a).not.toBe(b);
  });

  it('fails to decrypt with a different key', async () => {
    const key1 = await importEncryptionKey(TEST_KEY_HEX);
    const key2 = await importEncryptionKey('b'.repeat(64));
    const encrypted = await encryptApiKey(key1, 'secret');
    await expect(decryptApiKey(key2, encrypted)).rejects.toThrow();
  });

  it('fails on truncated ciphertext', async () => {
    const key = await importEncryptionKey(TEST_KEY_HEX);
    await expect(decryptApiKey(key, 'dG9vc2hvcnQ=')).rejects.toThrow();
  });
});

describe('sha256Hex', () => {
  it('returns consistent results', async () => {
    const a = await sha256Hex('hello');
    const b = await sha256Hex('hello');
    expect(a).toBe(b);
  });

  it('returns a 64-char hex string', async () => {
    const hash = await sha256Hex('test');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns different hashes for different inputs', async () => {
    const a = await sha256Hex('input1');
    const b = await sha256Hex('input2');
    expect(a).not.toBe(b);
  });
});

describe('randomHex', () => {
  it('returns a hex string of the expected length', () => {
    const hex = randomHex(16);
    expect(hex).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns different values each call', () => {
    const a = randomHex(32);
    const b = randomHex(32);
    expect(a).not.toBe(b);
  });
});
