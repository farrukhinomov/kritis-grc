const KB = 1024;
const MB = KB * 1024;

/** File sizes the way people read them: whole KB below a megabyte, one decimal above. */
export function formatBytes(bytes: number, language: string): string {
  if (bytes >= MB) {
    const value = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / MB);
    return `${value} MB`;
  }
  return `${new Intl.NumberFormat(language).format(Math.max(1, Math.round(bytes / KB)))} KB`;
}
