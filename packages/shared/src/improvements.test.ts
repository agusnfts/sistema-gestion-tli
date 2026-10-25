import { describe, expect, it } from 'vitest';
import {
  changeImprovementStatusSchema,
  formatImprovementCode,
  improvementPriority,
} from './schemas/improvements';

describe('improvementPriority', () => {
  it('mucho impacto con poco esfuerzo va primero', () => {
    expect(improvementPriority(3, 1)).toBe('HIGH');
    expect(improvementPriority(3, 2)).toBe('HIGH');
    expect(improvementPriority(2, 2)).toBe('MEDIUM');
    expect(improvementPriority(3, 3)).toBe('MEDIUM');
    expect(improvementPriority(1, 3)).toBe('LOW');
  });
});

describe('changeImprovementStatusSchema', () => {
  it('exige mensaje de cierre solo en estados finales', () => {
    expect(changeImprovementStatusSchema.safeParse({ status: 'TESTING' }).success).toBe(true);
    expect(changeImprovementStatusSchema.safeParse({ status: 'IMPLEMENTED' }).success).toBe(false);
    expect(
      changeImprovementStatusSchema.safeParse({
        status: 'DISCARDED',
        closingMessage: 'No se hace porque el WMS nuevo ya lo trae.',
      }).success,
    ).toBe(true);
  });
});

it('formatea el código', () => {
  expect(formatImprovementCode(7)).toBe('MEJ-0007');
});
