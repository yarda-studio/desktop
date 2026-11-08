/**
 * Where a slide picture's pixels come from. A picture the user has just added,
 * and any saved by an older version, is an inline data URL. A saved picture is
 * the name of a file in the app's media folder (see src-tauri/src/slides/pictures.rs).
 */
export type PictureSource = { kind: "inline"; url: string } | { kind: "file"; name: string };

export function pictureSource(image: string): PictureSource {
  return image.startsWith("data:") ? { kind: "inline", url: image } : { kind: "file", name: image };
}
