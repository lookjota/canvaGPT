export function toggleSelection(current: Set<string>, id: string, additive: boolean): Set<string> {
  const next = additive ? new Set(current) : new Set<string>();
  if (additive && next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
