/**
 * `FormData.get()` returns `string | File | null`, and stringifying a File silently
 * yields "[object File]" — so a file dropped into a text field would be submitted as
 * that literal. This narrows properly instead.
 */
export function readText(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
}
