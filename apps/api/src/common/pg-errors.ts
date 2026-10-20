import { ConflictException } from '@nestjs/common';

/** Postgres error code for exclusion constraint violations. */
const EXCLUSION_VIOLATION = '23P01';
const UNIQUE_VIOLATION = '23505';

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export function isExclusionViolation(err: unknown) {
  return pgCode(err) === EXCLUSION_VIOLATION;
}

export function isUniqueViolation(err: unknown) {
  return pgCode(err) === UNIQUE_VIOLATION;
}

/** Turns DB constraint errors into 409s and rethrows anything else. */
export function rethrowConflict(err: unknown, messages: { exclusion?: string; unique?: string } = {}): never {
  if (isExclusionViolation(err)) {
    throw new ConflictException({ code: 'table_conflict', message: messages.exclusion ?? 'Table is already booked for that time' });
  }
  if (isUniqueViolation(err)) {
    throw new ConflictException({ code: 'duplicate', message: messages.unique ?? 'Already exists' });
  }
  throw err;
}
