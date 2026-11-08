import type { CSSProperties } from "react";
import { useMediaUrl } from "../../lib/mediaUrl";
import { pictureSource } from "./pictureSource";

/**
 * One picture on a slide. Draws nothing until a saved picture's address is
 * known (or if the media folder can't be found), so a missing file leaves an
 * empty box rather than a broken-image icon on the projector.
 */
export default function SlidePicture({ image, style }: { image: string; style: CSSProperties }) {
  const source = pictureSource(image);
  const fileUrl = useMediaUrl(source.kind === "file" ? source.name : null);
  const url = source.kind === "inline" ? source.url : fileUrl;
  return url ? <img src={url} alt="" style={style} draggable={false} /> : null;
}
