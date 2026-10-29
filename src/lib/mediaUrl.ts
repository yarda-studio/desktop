import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { api } from "./tauri";

let mediaDir: Promise<string> | null = null;

function loadMediaDir() {
  mediaDir ??= api.getMediaDir().catch((e) => {
    mediaDir = null; // let the next caller retry
    throw e;
  });
  return mediaDir;
}

/** Asset URL for a file in the app media folder, or null while it resolves
 * (or if the folder can't be found — callers fall back to the static backdrop). */
export function useMediaUrl(name: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!name) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    loadMediaDir()
      .then((dir) => {
        if (!cancelled) setUrl(convertFileSrc(`${dir}/${name}`));
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);
  return url;
}
