export const LOCKOUT_THRESHOLD = 5;
const BASE_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 24 * 60;

/**
 * Bloqueo incremental: cada LOCKOUT_THRESHOLD fallos consecutivos bloquea la cuenta,
 * duplicando la duración (15, 30, 60 min…) hasta un máximo de 24 h.
 * Devuelve la fecha de desbloqueo o null si este fallo no dispara un bloqueo.
 */
export function lockUntilAfterFailure(failedCount: number, now: Date): Date | null {
  if (failedCount < LOCKOUT_THRESHOLD || failedCount % LOCKOUT_THRESHOLD !== 0) return null;
  const level = failedCount / LOCKOUT_THRESHOLD - 1;
  const minutes = Math.min(BASE_LOCK_MINUTES * 2 ** level, MAX_LOCK_MINUTES);
  return new Date(now.getTime() + minutes * 60_000);
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}
