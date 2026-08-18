import type { TransformFnParams } from 'class-transformer';

function asUnknown(value: TransformFnParams['value']): unknown {
  return value as unknown;
}

export function normalizeEmail({ value }: TransformFnParams): unknown {
  const input = asUnknown(value);

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

export function normalizeUsername({ value }: TransformFnParams): unknown {
  const input = asUnknown(value);

  return typeof input === 'string' ? input.trim().toLowerCase() : input;
}

export function trimString({ value }: TransformFnParams): unknown {
  const input = asUnknown(value);

  return typeof input === 'string' ? input.trim() : input;
}
