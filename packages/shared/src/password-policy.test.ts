import { describe, expect, it } from 'vitest';
import { checkPassword } from './password-policy';
import { requiresMfa, SYSTEM_ROLES, STANDARD_PERMISSIONS } from './permissions';

describe('checkPassword', () => {
  it('acepta una frase larga', () => {
    expect(checkPassword('caballo bateria grapa correcta')).toEqual([]);
  });

  it('rechaza contraseñas cortas', () => {
    expect(checkPassword('corta1')).toContain('Tiene que tener al menos 12 caracteres.');
  });

  it('rechaza contraseñas comunes sin importar mayúsculas', () => {
    expect(checkPassword('Password1234')).toContain('Es una contraseña demasiado común.');
  });

  it('rechaza caracteres repetidos', () => {
    expect(checkPassword('abababababab')).toContain('Tiene demasiados caracteres repetidos.');
  });

  it('rechaza contraseñas que contienen el email o el nombre', () => {
    const ctx = { email: 'agustin@tml.com.ar', fullName: 'Agustín Gómez' };
    expect(checkPassword('agustin-2026-segura', ctx)).toContain(
      'No puede contener tu usuario de email.',
    );
    expect(checkPassword('soy-gómez-y-listo', ctx)).toContain(
      'No puede contener tu nombre o apellido.',
    );
  });

  it('cuenta caracteres Unicode, no unidades UTF-16', () => {
    expect(checkPassword('ñandú-ñandú-ñ')).toEqual([]);
  });
});

describe('requiresMfa', () => {
  it('no exige MFA a un usuario común', () => {
    expect(requiresMfa(STANDARD_PERMISSIONS)).toBe(false);
    expect(requiresMfa(SYSTEM_ROLES.user.permissions)).toBe(false);
  });

  it('exige MFA a IT y Admin', () => {
    expect(requiresMfa(SYSTEM_ROLES.it.permissions)).toBe(true);
    expect(requiresMfa(SYSTEM_ROLES.admin.permissions)).toBe(true);
  });

  it('exige MFA ante un solo permiso de gestión', () => {
    expect(requiresMfa([...STANDARD_PERMISSIONS, 'client.read'])).toBe(true);
  });

  it('IT no tiene permisos exclusivos de Admin', () => {
    expect(SYSTEM_ROLES.it.permissions).not.toContain('user.manage');
    expect(SYSTEM_ROLES.it.permissions).toContain('ticket.manage');
  });
});
