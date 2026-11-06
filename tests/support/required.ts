/** Returns `value`, failing the test with a clear message instead of using a type assertion. */
export function required<T>(value: T | null | undefined, what = 'value'): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);
  return value;
}
