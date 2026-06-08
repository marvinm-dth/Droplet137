export const TABLE_PREFIX = "inv_";

export function table(name) {
  if (!name) {
    throw new Error("table(name) requires a table name.");
  }
  if (name.startsWith(TABLE_PREFIX)) {
    return name;
  }
  return `${TABLE_PREFIX}${name}`;
}
