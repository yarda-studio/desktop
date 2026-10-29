import { useLayoutEffect, useRef, type CSSProperties } from "react";
import type { StrongsDocPayload } from "../../lib/presentation";
import { applyBodyType, strongsLayout } from "./pagination";

interface Props {
  doc: StrongsDocPayload;
  /** Which page of the definition to show (clamped). */
  page: number;
  /** Output screen size in CSS px — chrome is sized from its height so it matches any projector. */
  stage: { w: number; h: number };
  /** Theme-derived colour / shadow shared with the scripture layouts. */
  textStyle: Pick<CSSProperties, "color" | "textShadow">;
  /** Accent for the lemma / labels (the theme's reference colour). */
  accent: string;
}

/**
 * The audience's full-screen Strong's lookup: the word, its number and one
 * page of the full lexicon definition. Purely presentational — the operator
 * has already fetched, formatted and paginated the text (see pagination.ts) and
 * sends it whole, so this never fetches and always shows exactly the page the
 * operator picked, in the theme's font size.
 */
export default function StrongsLive({ doc, page, stage, textStyle, accent }: Props) {
  const l = strongsLayout(stage);
  const u = l.u;
  const last = Math.max(0, doc.pages.length - 1);
  const current = Math.min(Math.max(0, Math.floor(page) || 0), last);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Safety net: the operator paginates for the stage size it knows. If this
  // screen is smaller (window resized, different monitor) a page could spill
  // past the box — step the type down until it fits rather than clip words.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    applyBodyType(el.style, doc);
    let px = doc.fontPx;
    for (let i = 0; i < 12 && el.scrollHeight > el.clientHeight + 1 && px > 12; i++) {
      px *= 0.94;
      el.style.fontSize = `${px}px`;
    }
  }, [doc, current, l.bodyW, l.bodyH]);

  return (
    <div
      className="absolute inset-0 z-40 bg-black/90 backdrop-blur-md overflow-hidden"
      style={{ ...textStyle, padding: `${l.padY}px ${l.padX}px`, ["--strongs-accent" as string]: accent }}
    >
      <style>{`.strongs-body .sref{color:var(--strongs-accent)}.strongs-body b{font-weight:700}`}</style>
      <div className="h-full flex flex-col">
        <header className="shrink-0 overflow-hidden" style={{ height: l.headerH }}>
          <div className="flex items-baseline flex-wrap" style={{ gap: `${14 * u}px ${40 * u}px` }}>
            <span dir="auto" className="font-semibold leading-tight" style={{ fontSize: 104 * u, color: accent }}>
              {doc.lemma}
            </span>
            {doc.transliteration && (
              <span className="italic opacity-80" style={{ fontSize: 48 * u }}>{doc.transliteration}</span>
            )}
          </div>
          <div className="flex items-center flex-wrap opacity-80" style={{ gap: `${12 * u}px ${28 * u}px`, marginTop: 20 * u, fontSize: 30 * u }}>
            <span className="font-metadata-mono tracking-wide rounded border border-current" style={{ padding: `${4 * u}px ${20 * u}px` }}>
              Strong's {doc.number}
            </span>
            {doc.partOfSpeech && <span className="italic">{doc.partOfSpeech}</span>}
            {doc.etymology && (
              <span>
                from <span style={{ color: accent }}>{doc.etymology.lemma}</span> {doc.etymology.number}
              </span>
            )}
          </div>
          <div className="opacity-20 bg-current" style={{ height: Math.max(1, 2 * u), marginTop: 28 * u }} />
        </header>

        <div
          ref={bodyRef}
          className="strongs-body shrink-0 overflow-hidden"
          style={{ height: l.bodyH, paddingTop: 0 }}
          dangerouslySetInnerHTML={{ __html: doc.pages[current] ?? "" }}
        />

        <footer className="shrink-0 flex items-end justify-end opacity-60 font-metadata-mono" style={{ height: l.footerH, fontSize: 28 * u }}>
          {doc.pages.length > 1 ? `${current + 1} / ${doc.pages.length}` : ""}
        </footer>
      </div>
    </div>
  );
}
