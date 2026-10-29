import { useMediaUrl } from "../lib/mediaUrl";

interface Props {
  video: string | null | undefined;
  dim: number;
  /** False for thumbnails: show the first frame instead of decoding a running video. */
  playing?: boolean;
}

/**
 * A theme's looping background video, with the same darkening layer pictures
 * get. Renders nothing for a theme without a video, so callers keep their
 * existing colour/gradient/picture backdrop underneath (which also shows while
 * the video loads or if it fails).
 *
 * Place it as the first child of a container that has `isolate`: it sits at
 * z-index -1, above the container's own background and below its content.
 */
export default function ThemeBackdrop({ video, dim, playing = true }: Props) {
  const url = useMediaUrl(video);
  if (!video || !url) return null;
  return (
    <>
      <video
        key={url}
        src={playing ? url : `${url}#t=0.1`}
        className="absolute inset-0 -z-10 h-full w-full object-cover pointer-events-none"
        autoPlay={playing}
        loop
        muted
        playsInline
        preload={playing ? "auto" : "metadata"}
        disablePictureInPicture
        aria-hidden="true"
      />
      {dim > 0 && <div className="absolute inset-0 -z-10 pointer-events-none" style={{ background: `rgba(0,0,0,${dim})` }} />}
    </>
  );
}
