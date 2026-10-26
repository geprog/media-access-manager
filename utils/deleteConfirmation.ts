/**
 * Whether what the admin typed confirms a deletion. Surrounding spaces do not
 * count, and an empty input never confirms anything: a name of nothing but
 * spaces must not unlock the delete button before a single key was pressed.
 */
export function matchesDeleteConfirmation(typed: string, expected: string): boolean {
  const wanted = expected.trim();
  return wanted.length > 0 && typed.trim() === wanted;
}
