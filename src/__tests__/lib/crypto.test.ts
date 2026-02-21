/**
 * Unit tests for src/lib/crypto.ts
 * Tests encrypt/decrypt round-trip and edge cases.
 */

// Set up a stable 32-byte hex key for tests
process.env.ENCRYPTION_KEY = 'd321cc88fb86797afd581b5731ca6995d11f16c2c8cd81fcbb2c21e815d38716';

import { encrypt, decrypt, tryDecrypt } from '@/lib/crypto';

describe('crypto — AES-256-GCM', () => {
  it('encrypts and decrypts a simple string round-trip', () => {
    const plaintext = 'sk-test-1234567890abcdef';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  it('produces different ciphertexts on each call (random IV)', () => {
    const plaintext = 'same-input-each-time';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe(plaintext);
    expect(decrypt(c2)).toBe(plaintext);
  });

  it('ciphertext is in iv:authTag:ciphertext format', () => {
    const ciphertext = encrypt('hello');
    const parts = ciphertext.split(':');
    expect(parts).toHaveLength(3);
    parts.forEach((p) => expect(p.length).toBeGreaterThan(0));
  });

  it('encrypts and decrypts an Anthropic-style API key', () => {
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF';
    expect(decrypt(encrypt(key))).toBe(key);
  });

  it('tryDecrypt returns plaintext values as-is (no colon = not encrypted)', () => {
    const plain = 'some-legacy-plaintext-key';
    expect(tryDecrypt(plain)).toBe(plain);
  });

  it('tryDecrypt decrypts valid ciphertext', () => {
    const plaintext = 'api-key-for-openai';
    const cipher = encrypt(plaintext);
    expect(tryDecrypt(cipher)).toBe(plaintext);
  });

  it('tryDecrypt returns value unchanged if decryption fails (legacy plaintext with colon)', () => {
    // A value with colons but not valid ciphertext — should not throw
    const badValue = 'some:garbage:value';
    const result = tryDecrypt(badValue);
    expect(result).toBe(badValue);
  });

  it('throws if ENCRYPTION_KEY is missing', () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY');
    process.env.ENCRYPTION_KEY = saved;
  });
});
