/** Small unique id generator with a crypto preference and a safe fallback. */

let counter = 0;

export function getRandomId(prefix = "id"): string {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
