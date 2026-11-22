interface Props {
  /** Book completions to offer; the first is the one Space accepts. */
  suggestions: string[];
  /** The resolved "Book ch:v" line shown when there are no completions to pick. */
  previewText: string | null;
  showDropdown: boolean;
  /** False while Space wouldn't accept the first suggestion (e.g. only a number typed). */
  spaceAccepts?: boolean;
  /** Open upward instead of downward when anchored near the bottom of the window. */
  openUp?: boolean;
  onPick: (book: string) => void;
}

/** The dropdown under a verse-reference input: book completions, or the resolved reference. */
export default function ScriptureSuggestions({ suggestions, previewText, showDropdown, onPick, spaceAccepts = true, openUp = false }: Props) {
  const posCls = openUp ? "bottom-full mb-1" : "top-full mt-1";

  if (showDropdown) {
    return (
      <div className={`absolute ${posCls} left-0 right-0 glass rounded-xl z-[200] overflow-hidden`}>
        {suggestions.slice(0, 6).map((book, i) => (
          <button
            key={book}
            className={`w-full text-left px-3 py-1.5 font-body-ui text-body-ui flex items-center justify-between transition-colors ${
              i === 0
                ? "bg-secondary-container text-on-secondary-container"
                : "text-on-surface hover:bg-surface-container-low"
            }`}
            onMouseDown={(e) => { e.preventDefault(); onPick(book); }}
          >
            <span>{book}</span>
            {i === 0 && spaceAccepts && (
              <kbd className="font-metadata-mono text-[12px] opacity-60 bg-surface-container px-1.5 py-0.5 rounded ml-3">
                Space
              </kbd>
            )}
          </button>
        ))}
      </div>
    );
  }

  if (previewText) {
    return (
      <div className={`absolute ${posCls} left-0 right-0 z-[200] px-3 py-1.5 flex items-center gap-2 glass rounded-2xl`}>
        <span className="material-symbols-outlined text-[14px] text-primary">arrow_forward</span>
        <span className="font-body-ui text-body-ui text-primary truncate">{previewText}</span>
        <kbd className="font-metadata-mono text-[12px] text-secondary ml-auto shrink-0 bg-surface-container px-1.5 py-0.5 rounded">
          Enter
        </kbd>
      </div>
    );
  }

  return null;
}
