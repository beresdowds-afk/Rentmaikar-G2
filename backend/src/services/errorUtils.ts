type AggregateErrorConstructor = new (
  errors: Iterable<unknown>,
  message?: string,
) => Error;

type ErrorWithCauseConstructor = new (
  message?: string,
  options?: { cause?: unknown },
) => Error;

const NativeAggregateError = (
  globalThis as unknown as { AggregateError: AggregateErrorConstructor }
).AggregateError;
const NativeErrorWithCause = Error as unknown as ErrorWithCauseConstructor;

export function createAggregateError(errors: Iterable<unknown>, message: string): Error {
  return new NativeAggregateError(errors, message);
}

export function createErrorWithCause(message: string, cause: unknown): Error {
  return new NativeErrorWithCause(message, { cause });
}
