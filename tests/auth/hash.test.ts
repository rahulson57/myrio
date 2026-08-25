import { describe, expect, it } from 'vitest';
import { hashPassword, hashPasswordWithSalt, verifyPassword } from '../../src/server/auth/hash';

const PASSWORD = 'correct horse battery staple';
const SALT_A = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const SALT_B = new Uint8Array([16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);

describe('hashPassword', () => {
  it('produces an argon2id hash encoding m=19456, t=2, p=1', async () => {
    const encoded = await hashPassword(PASSWORD);
    expect(encoded).toMatch(/^\$argon2id\$/);
    const match = encoded.match(/\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/);
    expect(match).not.toBeNull();
    const [, m, t, p] = match!;
    expect(m).toBe('19456');
    expect(t).toBe('2');
    expect(p).toBe('1');
  });

  it('uses a random salt: hashing the same password twice yields different encoded hashes', async () => {
    const first = await hashPassword(PASSWORD);
    const second = await hashPassword(PASSWORD);
    expect(first).not.toBe(second);
  });

  it('a hash produced by hashPassword verifies against the original password', async () => {
    const encoded = await hashPassword(PASSWORD);
    await expect(verifyPassword(encoded, PASSWORD)).resolves.toBe(true);
    await expect(verifyPassword(encoded, 'wrong password')).resolves.toBe(false);
  });
});

describe('hashPasswordWithSalt', () => {
  it('is deterministic: same password + same salt produces a byte-identical hash across calls', async () => {
    const first = await hashPasswordWithSalt(PASSWORD, SALT_A);
    const second = await hashPasswordWithSalt(PASSWORD, SALT_A);
    expect(second).toBe(first);
  });

  it('is deterministic across freshly-allocated salt buffers with the same bytes', async () => {
    const cloneOfA = Uint8Array.from(SALT_A);
    const first = await hashPasswordWithSalt(PASSWORD, SALT_A);
    const second = await hashPasswordWithSalt(PASSWORD, cloneOfA);
    expect(second).toBe(first);
  });

  it('different salts produce different hashes for the same password', async () => {
    const withA = await hashPasswordWithSalt(PASSWORD, SALT_A);
    const withB = await hashPasswordWithSalt(PASSWORD, SALT_B);
    expect(withA).not.toBe(withB);
  });

  it('still encodes m=19456, t=2, p=1 — same params as the random-salt path', async () => {
    const encoded = await hashPasswordWithSalt(PASSWORD, SALT_A);
    expect(encoded).toMatch(/^\$argon2id\$v=\d+\$m=19456,t=2,p=1\$/);
  });

  it('a deterministic hash still verifies against the original password', async () => {
    const encoded = await hashPasswordWithSalt(PASSWORD, SALT_A);
    await expect(verifyPassword(encoded, PASSWORD)).resolves.toBe(true);
    await expect(verifyPassword(encoded, 'wrong password')).resolves.toBe(false);
  });
});

describe('verifyPassword', () => {
  it('never throws: a malformed hash is treated as a verification failure', async () => {
    await expect(verifyPassword('not-an-argon2-hash', PASSWORD)).resolves.toBe(false);
    await expect(verifyPassword('', PASSWORD)).resolves.toBe(false);
  });
});
