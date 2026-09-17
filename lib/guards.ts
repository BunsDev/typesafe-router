/** Tiny runtime type guards shared by the library, the API route and the lab's storage. */

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Option ids become object keys in the wire format and in score maps, and an
 * id such as `constructor` or `__proto__` would otherwise be read from (or, for
 * `__proto__`, silently swallowed by) `Object.prototype`. Every read of a map
 * keyed by option id goes through this, and every such map is built with
 * `Object.fromEntries`, which defines own properties instead of assigning.
 */
export function readOwn<T>(map: Record<string, T> | undefined | null, key: string): T | undefined {
  return map && typeof map === "object" && Object.hasOwn(map, key) ? map[key] : undefined;
}
