/** Title-case each word (used for category labels across dashboard and insights). */
export function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
