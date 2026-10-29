import type { CSSProperties } from "react";
import ThemeBackdrop from "../../components/ThemeBackdrop";
import type { SlideDocPayload } from "../../lib/presentation";
import type { PresentationTheme } from "../../lib/tauri";

const FONT_FAMILY_CSS: Record<string, string> = {
  system: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`,
  serif: `Georgia, "Palatino Linotype", Palatino, serif`,
  times: `"Times New Roman", Times, serif`,
  mono: `"Courier New", Courier, monospace`,
};

function backdropStyle(background: string, theme: PresentationTheme | null): CSSProperties {
  if (background === "black") return { background: "#000000" };
  if (/^#[0-9a-f]{6}$/i.test(background)) return { background };
  const image = theme?.background_image;
  if (image) {
    const dim = theme?.background_image_dim ?? 0;
    return {
      backgroundColor: theme?.background_color || "#000000",
      backgroundImage: `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${image}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { background: theme?.background_gradient || theme?.background_color || "#000000" };
}

/**
 * What the output screen shows for an announcement or free-form slide. Laid out
 * against the stage's CSS-pixel size (the real window, or a thumbnail's virtual
 * one): boxes are placed in percentages and text scales with the stage height,
 * so a slide looks the same on every output.
 */
export default function SlideStage({ slide, theme, stage }: {
  slide: SlideDocPayload;
  theme: PresentationTheme | null;
  stage: { w: number; h: number };
}) {
  const scale = stage.h / 1080;
  const themed = slide.background === "theme";
  const font = FONT_FAMILY_CSS[theme?.font_family ?? "system"] ?? FONT_FAMILY_CSS.system;

  return (
    <div className="output-backdrop h-full w-full relative isolate overflow-hidden select-none" style={backdropStyle(slide.background, theme)}>
      {themed && <ThemeBackdrop video={theme?.background_video} dim={theme?.background_image_dim ?? 0} />}
      {slide.elements.map((e) => {
        const box: CSSProperties = {
          position: "absolute", left: `${e.x}%`, top: `${e.y}%`, width: `${e.w}%`, height: `${e.h}%`,
        };
        if (e.kind === "image") {
          return e.image ? <img key={e.id} src={e.image} alt="" style={{ ...box, objectFit: "contain" }} draggable={false} /> : null;
        }
        return (
          <div
            key={e.id}
            style={{
              ...box,
              display: "flex",
              alignItems: "center",
              justifyContent: e.align === "left" ? "flex-start" : e.align === "right" ? "flex-end" : "center",
              overflow: "hidden",
            }}
          >
            <p
              className="m-0 whitespace-pre-wrap"
              style={{
                width: "100%",
                fontSize: e.font_size * scale,
                lineHeight: 1.25,
                textAlign: e.align,
                color: e.color,
                fontFamily: font,
                fontWeight: e.bold ? 700 : 400,
                fontVariantNumeric: "tabular-nums",
                textShadow: themed && theme?.text_shadow ? "0 2px 12px rgba(0,0,0,.75)" : undefined,
              }}
            >
              {e.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
