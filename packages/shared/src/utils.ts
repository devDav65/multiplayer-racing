/**
 * Lit `items[index]` en bouclant : -1 donne le dernier élément, `length` donne le premier.
 * Pratique pour un circuit fermé, et nécessaire car `noUncheckedIndexedAccess`
 * type chaque accès à un tableau comme « T | undefined ».
 */
export function wrapAt<T>(items: ReadonlyArray<T>, index: number): T {
  const length = items.length;
  const item = items[((index % length) + length) % length];
  if (item === undefined) {
    throw new Error("wrapAt : tableau vide");
  }
  return item;
}
