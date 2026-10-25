import { describe, expect, it } from 'vitest';
import { clientSchema, formatCuit, normalizeCuit } from './schemas/clients';

describe('normalizeCuit', () => {
  it('acepta CUIT válidos con o sin guiones', () => {
    expect(normalizeCuit('30-71234567-1')).toBe('30712345671');
    expect(normalizeCuit('20-12345678-6')).toBe('20123456786');
    expect(normalizeCuit('20123456786')).toBe('20123456786');
    expect(normalizeCuit('30 50001091 2')).toBe('30500010912');
  });

  it('rechaza dígito verificador incorrecto o largo inválido', () => {
    expect(normalizeCuit('20-12345678-5')).toBeNull();
    expect(normalizeCuit('2012345678')).toBeNull();
  });

  it('formatea con guiones', () => {
    expect(formatCuit('30500010912')).toBe('30-50001091-2');
  });
});

describe('clientSchema', () => {
  it('normaliza el CUIT y permite dejarlo vacío', () => {
    expect(clientSchema.parse({ legalName: 'Cliente SA', cuit: '30-50001091-2' }).cuit).toBe(
      '30500010912',
    );
    expect(clientSchema.parse({ legalName: 'Cliente SA', cuit: '' }).cuit).toBeNull();
    expect(clientSchema.safeParse({ legalName: 'Cliente SA', cuit: '30-50001091-3' }).success).toBe(
      false,
    );
  });
});
