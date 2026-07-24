/** Resolve a dotted JSON path ("category_fields.mobile.addOns.0.amount"). */
export function resolvePath(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const segment of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}

/** True when the path exists AND its value is non-null. */
export function pathHasValue(root: unknown, path: string): boolean {
  const v = resolvePath(root, path);
  return v !== undefined && v !== null;
}
