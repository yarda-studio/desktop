/** Small pure helpers for the backup-file transfer panel. */

/** The suggested name when saving a backup: `yarda-backup-2026-11-08.zip`. */
export function backupFileName(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `yarda-backup-${y}-${m}-${d}.zip`;
}

/** A file size for people: `340 KB`, `12.5 MB`, `1.2 GB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** What an import brought back besides the data, in a sentence ("" when nothing). */
export function importedExtras(modules: number, videos: number): string {
  const parts: string[] = [];
  if (modules > 0) parts.push(`${modules} Bible module${modules === 1 ? "" : "s"}`);
  if (videos > 0) parts.push(`${videos} theme video${videos === 1 ? "" : "s"}`);
  return parts.join(" and ");
}
