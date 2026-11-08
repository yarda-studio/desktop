/**
 * Numbered buttons for jumping between the pages of the previewed or live
 * slide. Renders nothing for a one-page slide, so announcements look as before.
 */
export default function PageChips({ count, index, onSelect }: {
  count: number;
  index: number;
  onSelect: (page: number) => void;
}) {
  if (count < 2) return null;
  return (
    <div role="group" aria-label="Pages" className="flex flex-wrap items-center gap-1 max-h-[4.5rem] overflow-y-auto">
      <span className="mr-1 whitespace-nowrap font-body-ui text-[12px] text-on-surface-variant">Page {index + 1} of {count}</span>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          aria-pressed={i === index}
          aria-label={`Page ${i + 1}`}
          className={`h-6 min-w-6 rounded px-1.5 font-metadata-mono text-[12px] ${i === index ? "ctl-active" : "ctl text-on-surface-variant hover:text-on-surface"}`}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
