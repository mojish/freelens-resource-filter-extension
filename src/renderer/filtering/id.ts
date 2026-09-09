/** Small unique id generator (no crypto dependency needed in the renderer). */

let counter = 0;

export function getRandomId(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
