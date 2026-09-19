// localStorage that never throws. It's only an offline cache here (the data
// service is the durable store), so a full quota, a corrupt entry or storage
// blocked by the browser must not take the app down with it.

export function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // quota exceeded or storage disabled — the server copy still has it
  }
}

/** Parsed JSON, or `fallback` when the entry is missing, corrupt or the wrong shape. */
export function readJSON<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  const raw = readLS(key);
  if (raw == null) return fallback;
  try {
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
