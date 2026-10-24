import { describe, expect, it } from 'vitest';
import { computeAuditHash } from './audit.service';
import { canonicalJson } from '../common/canonical-json';

describe('canonicalJson', () => {
  it('ordena claves y omite undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, 2], c: null }, z: undefined })).toBe(
      '{"a":{"c":null,"d":[1,2]},"b":1}',
    );
  });
});

describe('computeAuditHash', () => {
  const row = {
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    actorId: null,
    action: 'auth.login.success',
    entityType: 'session',
    entityId: 'abc',
    ip: '127.0.0.1',
    metadata: { b: 2, a: 1 },
  };

  it('es determinístico sin importar el orden de las claves de metadata', () => {
    const h1 = computeAuditHash('0'.repeat(64), row);
    const h2 = computeAuditHash('0'.repeat(64), { ...row, metadata: { a: 1, b: 2 } });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cambia si cambia el hash anterior o cualquier campo', () => {
    const h = computeAuditHash('0'.repeat(64), row);
    expect(computeAuditHash('1'.repeat(64), row)).not.toBe(h);
    expect(computeAuditHash('0'.repeat(64), { ...row, ip: '10.0.0.1' })).not.toBe(h);
  });
});
