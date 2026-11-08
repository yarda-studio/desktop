import { invoke } from "@tauri-apps/api/core";

export interface ExportOptions {
  include_modules: boolean;
  include_videos: boolean;
}

export interface ImportSummary {
  modules: number;
  videos: number;
}

export const transferApi = {
  /** Write a backup to `path` and return its size in bytes. */
  exportToFile: (path: string, options: ExportOptions) =>
    invoke<number>("export_backup_to_file", { path, options }),
  /** Replace everything on this computer with the backup at `path`. */
  importFromFile: (path: string) => invoke<ImportSummary>("import_backup_from_file", { path }),
};
