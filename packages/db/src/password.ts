import { hash, verify, type Algorithm } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';

// Algorithm es un const enum (no usable con isolatedModules): 2 = Argon2id.
const ARGON2ID = 2 as Algorithm;

// Parámetros argon2id: por encima del mínimo recomendado por OWASP (m=19 MiB, t=2, p=1).
const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 3,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password).catch(() => false);
}

// Sin caracteres ambiguos (0/O, 1/l/I).
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Contraseña temporal de 16 caracteres (~92 bits), en grupos de 4 para dictarla. */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) group += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    groups.push(group);
  }
  return groups.join('-');
}
