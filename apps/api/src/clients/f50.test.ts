import { describe, expect, it } from 'vitest';
import { cuitFrom, parseContactCell, parseF50Sheet } from './f50';

describe('cuitFrom', () => {
  it('acepta texto con guiones y números (incluso con ".0")', () => {
    expect(cuitFrom('30-50001091-2').cuit).toBe('30500010912');
    expect(cuitFrom(30500010912).cuit).toBe('30500010912');
    expect(cuitFrom('30500010912.0').cuit).toBe('30500010912');
  });

  it('marca el CUIT inválido sin descartar la fila', () => {
    expect(cuitFrom('30-50001091-3')).toEqual({ cuit: null, invalid: '30-50001091-3' });
    expect(cuitFrom(null)).toEqual({ cuit: null, invalid: null });
  });
});

describe('parseContactCell', () => {
  it('separa nombre, teléfono y mail aunque vengan en renglones', () => {
    expect(parseContactCell('Operaciones', 'Ana Pérez\n11 5555-0001\nana@x.com')).toEqual([
      { role: 'Operaciones', name: 'Ana Pérez', email: 'ana@x.com', phone: '11 5555-0001' },
    ]);
  });

  it('una celda con dos personas da dos contactos', () => {
    const r = parseContactCell(
      'Facturación',
      'Juan Gómez juan@x.com 1155550002 / Sol Ruiz sol@x.com 1155550003',
    );
    expect(r.map((c) => [c.name, c.email, c.phone])).toEqual([
      ['Juan Gómez', 'juan@x.com', '1155550002'],
      ['Sol Ruiz', 'sol@x.com', '1155550003'],
    ]);
  });

  it('ignora "ídem", "-" y celdas vacías', () => {
    expect(parseContactCell('Administración', 'idem')).toEqual([]);
    expect(parseContactCell('Administración', '-')).toEqual([]);
    expect(parseContactCell('Administración', null)).toEqual([]);
  });

  it('solo mail: usa el usuario del mail como nombre', () => {
    expect(parseContactCell('Tráfico', 'trafico@x.com')[0]).toMatchObject({
      name: 'trafico',
      email: 'trafico@x.com',
    });
  });
});

describe('parseF50Sheet', () => {
  it('busca las columnas por encabezado (sin importar acentos ni orden)', () => {
    const rows = parseF50Sheet([
      ['FOLIO', 'Razon Social', 'CUIT', 'ESTA DE BAJA?\n(COMERCIAL)', 'Domicilio', 'Localidad'],
      ['F-1', 'Cliente SA', '30-50001091-2', true, 'Calle 1', 'Garín'],
      [null, null, null, null, null, null],
    ]);
    expect(rows).toEqual([
      expect.objectContaining({
        row: 2,
        folio: 'F-1',
        legalName: 'Cliente SA',
        cuit: '30500010912',
        inactive: true,
        address: 'Calle 1 · Garín',
      }),
    ]);
  });

  it('sin la columna de razón social avisa que no es el F50', () => {
    expect(() => parseF50Sheet([['Nombre', 'Mail']])).toThrow(/RAZÓN SOCIAL/);
  });
});
