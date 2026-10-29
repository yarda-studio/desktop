import type { PresentationTheme, StrongsEntry } from "../../lib/tauri";
import type { DisplayPrefs } from "../../store/app";
import type { StrongsDocPayload } from "../../lib/presentation";
import { liveDisplayPrefs, liveFontFamily, liveFontSize } from "../../lib/liveText";

export interface StrongsStage { w: number; h: number }

/**
 * Geometry of the audience's Strong's screen, all derived from the output's
 * size (1u = 1px on a 1080p frame). The output renders with these exact
 * numbers and the console paginates with them, so a page that fits here fits
 * there.
 */
export function strongsLayout(stage: StrongsStage) {
  const u = stage.h / 1080;
  const padX = 96 * u;
  const padY = 72 * u;
  const headerH = 290 * u;
  const footerH = 64 * u;
  return {
    u,
    padX,
    padY,
    headerH,
    footerH,
    bodyW: Math.max(1, stage.w - 2 * padX),
    bodyH: Math.max(1, stage.h - 2 * padY - headerH - footerH),
  };
}

export interface StrongsType {
  fontFamily: string;
  fontPx: number;
  lineHeight: number;
  letterSpacing: string;
}

/**
 * The body type: size, family, line spacing and tracking all come from the
 * live theme (Theme editor), the same fields the verse layouts read — so the
 * definition honours the font size the operator chose. Floors keep a very
 * small or very large setting readable and guarantee a page holds a few lines.
 */
export function strongsType(theme: PresentationTheme | null, base: DisplayPrefs, stage: StrongsStage): StrongsType {
  const prefs = liveDisplayPrefs(base, theme);
  const l = strongsLayout(stage);
  const lineHeight = Math.max(1.35, 1 + prefs.lineSpacing);
  const wanted = liveFontSize(theme) * (theme?.font_scale ?? 1);
  const fontPx = Math.min(Math.max(wanted, 14), l.bodyH / (lineHeight * 3));
  return {
    fontFamily: liveFontFamily(base, theme),
    fontPx,
    lineHeight,
    letterSpacing: `${prefs.letterSpacing * 0.1}em`,
  };
}

// ── Markup → word tokens ─────────────────────────────────────────────────────

/** One word (or paragraph gap) of the definition, with its formatting baked in as HTML. */
interface Token {
  h: string;
  /** Whitespace separated this from the previous word in the source. */
  sp: boolean;
  gap?: boolean;
}

const GAP_HTML = `<span style="display:block;height:0.6em"></span>`;
const BLOCK_TAGS = new Set(["BR", "P", "DIV", "LI", "UL", "OL", "TR"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface Fmt { b: boolean; i: boolean; ref: boolean }

/**
 * Lexicon markup (<b>, <i>, <ref>, line breaks) as word tokens. Bold, italic
 * and scripture references survive; every other tag is dropped and everything
 * is re-escaped, so the result is safe to inject as HTML. Newlines become
 * paragraph gaps (the console shows them as line breaks).
 */
function tokenize(markup: string): Token[] {
  const tokens: Token[] = [];
  let pendingSpace = false;

  const pushGap = () => {
    const last = tokens[tokens.length - 1];
    if (!last || last.gap) return; // no leading or doubled gaps
    tokens.push({ h: GAP_HTML, sp: false, gap: true });
    pendingSpace = false;
  };

  const walk = (node: Node, fmt: Fmt) => {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const piece of (node.textContent ?? "").split(/(\n+)/)) {
        if (!piece) continue;
        if (piece.startsWith("\n")) { pushGap(); continue; }
        for (const chunk of piece.split(/(\s+)/)) {
          if (!chunk) continue;
          if (/^\s+$/.test(chunk)) { pendingSpace = true; continue; }
          let h = esc(chunk);
          if (fmt.ref) h = `<span class="sref">${h}</span>`;
          if (fmt.i) h = `<i>${h}</i>`;
          if (fmt.b) h = `<b>${h}</b>`;
          tokens.push({ h, sp: pendingSpace });
          pendingSpace = false;
        }
      }
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE") return;
    const block = BLOCK_TAGS.has(tag);
    if (block) pushGap();
    const next: Fmt = {
      b: fmt.b || tag === "B" || tag === "STRONG",
      i: fmt.i || tag === "I" || tag === "EM",
      ref: fmt.ref || tag === "REF",
    };
    el.childNodes.forEach((child) => walk(child, next));
    if (block) pushGap();
  };

  try {
    const doc = new DOMParser().parseFromString(`<body>${markup}</body>`, "text/html");
    doc.body.childNodes.forEach((child) => walk(child, { b: false, i: false, ref: false }));
  } catch {
    // Unparseable markup: fall back to its raw words rather than dropping the entry.
    for (const w of markup.split(/\s+/).filter(Boolean)) tokens.push({ h: esc(w), sp: true });
  }
  while (tokens.length && tokens[tokens.length - 1].gap) tokens.pop();
  return tokens;
}

/** The definition the audience reads: the entry's full text, then any extra content words in the phrase. */
function definitionTokens(entry: StrongsEntry, extras: StrongsEntry[]): Token[] {
  const tokens = tokenize(entry.long_def || entry.short_def || "");
  for (const extra of extras) {
    const more = tokenize(`<b>${esc(extra.lemma)}</b> (${esc(extra.number)}): ${extra.short_def ?? ""}`);
    if (more.length === 0) continue;
    if (tokens.length) tokens.push({ h: GAP_HTML, sp: false, gap: true });
    tokens.push(...more);
  }
  return tokens;
}

function render(tokens: Token[], from: number, to: number): string {
  let out = "";
  for (let k = from; k < to; k++) out += (k > from && tokens[k].sp ? " " : "") + tokens[k].h;
  return out;
}

/** Applies the body type to an element — shared by the measuring probe and the output. */
export function applyBodyType(style: CSSStyleDeclaration, type: StrongsType) {
  style.fontFamily = type.fontFamily;
  style.fontSize = `${type.fontPx}px`;
  style.lineHeight = String(type.lineHeight);
  style.letterSpacing = type.letterSpacing;
  style.fontWeight = "400";
  style.textAlign = "left";
  style.overflowWrap = "anywhere";
  style.whiteSpace = "normal";
}

const MAX_PAGES = 300;

/**
 * Splits the definition into pages that each fill, but never overflow, the
 * output's body box — measured with real browser layout in the exact type the
 * output uses, so bold/italic and paragraph gaps are accounted for. Always at
 * least one page; formatting is kept as sanitized HTML.
 */
export function paginateStrongs(
  entry: StrongsEntry | null,
  extras: StrongsEntry[],
  stage: StrongsStage,
  type: StrongsType,
): string[] {
  if (!entry) return [];
  const tokens = definitionTokens(entry, extras);
  if (tokens.length === 0) return [""];

  const l = strongsLayout(stage);
  const probe = document.createElement("div");
  Object.assign(probe.style, {
    position: "fixed",
    top: "-99999px",
    left: "-99999px",
    width: `${l.bodyW}px`,
    boxSizing: "border-box",
    padding: "0",
    margin: "0",
    visibility: "hidden",
    pointerEvents: "none",
  });
  applyBodyType(probe.style, type);
  document.body.appendChild(probe);

  const fits = (from: number, to: number) => {
    probe.innerHTML = render(tokens, from, to);
    return probe.offsetHeight <= l.bodyH + 0.5;
  };

  try {
    const n = tokens.length;
    const pages: string[] = [];
    let start = 0;

    while (start < n) {
      while (start < n && tokens[start].gap) start++;
      if (start >= n) break;

      if (pages.length >= MAX_PAGES - 1 || fits(start, n)) {
        pages.push(render(tokens, start, n));
        break;
      }

      // Grow the window geometrically to bracket the break, then bisect.
      let end = start + 1; // a page always takes at least one word
      if (fits(start, end)) {
        let lo = end;
        let hi = n - 1;
        let probeAt = start + 16;
        while (probeAt < n) {
          if (fits(start, probeAt)) { lo = probeAt; probeAt = start + (probeAt - start) * 2; }
          else { hi = probeAt - 1; break; }
        }
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (fits(start, mid)) lo = mid; else hi = mid - 1;
        }
        end = lo;
      }
      // Don't strand punctuation at the top of the next page or end on a gap.
      while (end > start + 1 && end < n && !tokens[end].sp && !tokens[end].gap) end--;
      while (end > start + 1 && tokens[end - 1].gap) end--;

      pages.push(render(tokens, start, end));
      start = end;
    }
    return pages.length > 0 ? pages : [""];
  } finally {
    document.body.removeChild(probe);
  }
}

export function buildStrongsDoc(
  entry: StrongsEntry,
  etymology: { number: string; lemma: string } | null,
  pages: string[],
  type: StrongsType,
): StrongsDocPayload {
  return {
    number: entry.number,
    lemma: entry.lemma,
    transliteration: entry.transliteration ?? "",
    partOfSpeech: entry.part_of_speech ?? "",
    etymology,
    pages,
    ...type,
  };
}
