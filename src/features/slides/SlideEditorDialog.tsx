import { useEffect, useRef, useState } from "react";
import { useDialogA11y } from "../../hooks/useDialogA11y";
import { fileToBackgroundDataUrl } from "../../lib/imageToDataUrl";
import { useAppStore } from "../../store/app";
import { ANNOUNCEMENT_BODY_ID, ANNOUNCEMENT_TITLE_ID, textElement, toPayload, type SlideElement, type SlidePage } from "./api";
import EditorCanvas from "./EditorCanvas";
import PageStrip from "./PageStrip";
import { forPlatform } from "../../lib/platform";
import { selectCanRedo, selectCanUndo, selectDirty, useSlidesStore } from "./slidesStore";

export default function SlideEditorDialog() {
  const draft = useSlidesStore((s) => s.draft);
  const pageIndex = useSlidesStore((s) => s.pageIndex);
  const dirty = useSlidesStore(selectDirty);
  const saving = useSlidesStore((s) => s.saving);
  const saveError = useSlidesStore((s) => s.saveError);
  const theme = useAppStore((s) => s.activePresentationTheme);
  const canUndo = useSlidesStore(selectCanUndo);
  const canRedo = useSlidesStore(selectCanRedo);
  const { update, updateElement, apply, ok, cancel, setPage, addPage, duplicatePage, removePage, movePage, undo, redo } = useSlidesStore.getState();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // A selection belongs to one page; switching pages starts with nothing selected.
  useEffect(() => { setSelectedId(null); }, [pageIndex]);

  function requestCancel() {
    if (dirty) setConfirmDiscard(true);
    else cancel();
  }

  // Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, also while a text field has
  // focus: the fields are driven by the draft, so the draft's history is the one that counts.
  function onUndoKeys(e: React.KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((key === "z" && e.shiftKey) || key === "y") { e.preventDefault(); redo(); }
  }

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, !!draft, requestCancel);

  if (!draft) return null;
  const freeform = draft.kind === "freeform";
  const page = draft.pages[Math.min(pageIndex, draft.pages.length - 1)];

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => e.target === e.currentTarget && requestCancel()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Slide Editor" onKeyDown={onUndoKeys} className="w-[min(1180px,96vw)] h-[min(780px,94vh)] flex flex-col glass glass-strong rounded-3xl overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant shrink-0">
          <input
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Slide title"
            autoFocus={draft.id === null}
            aria-label="Slide title"
            className="field w-80 max-w-[50%] rounded-md h-9 px-3 font-body-ui text-[14px] text-on-surface outline-none"
          />
          <span className="flex-1" />
          <div role="group" aria-label="Undo and redo" className="flex ctl rounded-md overflow-hidden">
            <button onClick={undo} disabled={!canUndo} title={forPlatform("Undo (Ctrl+Z)")} aria-label="Undo" className="px-2 py-1 hover:bg-on-surface/10 disabled:pointer-events-none disabled:opacity-30">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">undo</span>
            </button>
            <button onClick={redo} disabled={!canRedo} title={forPlatform("Redo (Ctrl+Shift+Z)")} aria-label="Redo" className="px-2 py-1 hover:bg-on-surface/10 disabled:pointer-events-none disabled:opacity-30">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">redo</span>
            </button>
          </div>
          <h2 className="font-body-ui text-[13px] text-on-surface-variant">
            {freeform ? `Free-form slide — page ${pageIndex + 1} of ${draft.pages.length}` : "Announcement"}{dirty ? " — unsaved" : ""}
          </h2>
        </header>

        <div className="flex flex-1 min-h-0">
          {freeform && (
            <PageStrip
              pages={draft.pages}
              title={draft.title}
              index={pageIndex}
              theme={theme}
              onSelect={setPage}
              onAdd={addPage}
              onDuplicate={duplicatePage}
              onRemove={removePage}
              onMove={movePage}
            />
          )}
          <section className="flex-1 min-w-0 flex flex-col items-center justify-center gap-3 p-6 bg-surface-container-lowest/30">
            <div className="w-full max-w-[860px]">
              <EditorCanvas
                slide={toPayload(draft, pageIndex)}
                theme={theme}
                editable={freeform}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={updateElement}
              />
            </div>
            <p className="font-body-ui text-[12px] text-on-surface-variant">
              {freeform ? "Drag a box to move it, drag its corner to resize, or use the arrow keys." : "This is how the slide will look on the output."}
            </p>
          </section>

          <aside className="w-[340px] shrink-0 border-l border-outline-variant overflow-y-auto p-4 space-y-5">
            {freeform
              ? <FreeformInspector page={page} selectedId={selectedId} onSelect={setSelectedId} />
              : <AnnouncementInspector page={page} />}
            <BackgroundField page={page} pageCount={draft.pages.length} />
          </aside>
        </div>

        <footer className="flex items-center gap-3 px-4 py-3 border-t border-outline-variant shrink-0">
          <p className={`flex-1 min-w-0 truncate font-body-ui text-[12px] ${saveError ? "text-error" : "text-on-surface-variant"}`} role={saveError ? "alert" : undefined}>
            {saveError ?? (confirmDiscard ? "Discard your changes?" : "")}
          </p>
          {confirmDiscard ? (
            <>
              <button onClick={cancel} className="rounded-md px-4 py-1.5 text-[13px] font-body-ui bg-error text-on-error">Discard</button>
              <button onClick={() => setConfirmDiscard(false)} className="ctl rounded-md px-4 py-1.5 text-[13px] font-body-ui text-on-surface">Keep editing</button>
            </>
          ) : (
            <>
              <button onClick={() => void apply()} disabled={saving || !dirty} className="ctl rounded-md px-4 py-1.5 text-[13px] font-body-ui text-on-surface disabled:opacity-40">Apply</button>
              <button onClick={() => void ok()} disabled={saving} className="btn-primary rounded-md px-4 py-1.5 text-[13px] font-body-ui disabled:opacity-40">OK</button>
              <button onClick={requestCancel} className="ctl rounded-md px-4 py-1.5 text-[13px] font-body-ui text-on-surface">Cancel</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

function Align({ value, onChange }: { value: SlideElement["align"]; onChange: (v: SlideElement["align"]) => void }) {
  const options: [SlideElement["align"], string, string][] = [["left", "format_align_left", "Align left"], ["center", "format_align_center", "Align centre"], ["right", "format_align_right", "Align right"]];
  return (
    <div role="group" aria-label="Alignment" className="flex ctl rounded-md overflow-hidden self-start">
      {options.map(([v, icon, label]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} title={label} aria-label={label} className={`px-2 py-1 ${value === v ? "ctl-active" : "hover:bg-on-surface/10"}`}>
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </button>
      ))}
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1 }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <label className="block min-w-0">
      <span className="field-label">{label}</span>
      <input
        type="number" min={min} max={max} step={step} value={Math.round(value * 10) / 10}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))); }}
        className="field-input"
      />
    </label>
  );
}

function AnnouncementInspector({ page }: { page: SlidePage }) {
  const { updateElement, updateElements } = useSlidesStore.getState();
  const title = page.elements.find((e) => e.id === ANNOUNCEMENT_TITLE_ID);
  const body = page.elements.find((e) => e.id === ANNOUNCEMENT_BODY_ID);
  if (!title || !body) return <p className="font-body-ui text-[12px] text-error">This announcement is missing its text boxes.</p>;
  const both = (patch: Partial<SlideElement>) => updateElements([title.id, body.id], patch);
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="field-label">Heading</span>
        <input value={title.text} onChange={(e) => updateElement(title.id, { text: e.target.value })} className="field-input" />
      </label>
      <label className="block">
        <span className="field-label">Message</span>
        <textarea value={body.text} onChange={(e) => updateElement(body.id, { text: e.target.value })} rows={6} className="field w-full rounded-md px-3 py-2 text-[13px] font-body-ui text-on-surface outline-none resize-y" />
      </label>
      <label className="block">
        <span className="field-label">Message size — {body.font_size}px</span>
        <input type="range" min={24} max={120} step={2} value={body.font_size} onChange={(e) => updateElement(body.id, { font_size: Number(e.target.value) })} className="w-full accent-primary" />
      </label>
      <label className="flex items-center gap-2 font-body-ui text-[13px] text-on-surface" title="Makes the heading and message smaller when they would not fit. They never get larger than their set size.">
        <input type="checkbox" checked={title.auto_fit === true && body.auto_fit === true} onChange={(e) => both({ auto_fit: e.target.checked })} className="accent-primary" />Shrink text to fit
      </label>
      <div className="flex items-end gap-4">
        <div>
          <span className="field-label">Alignment</span>
          <Align value={body.align} onChange={(align) => both({ align })} />
        </div>
        <label className="block">
          <span className="field-label">Text colour</span>
          <input type="color" value={title.color} onChange={(e) => both({ color: e.target.value })} aria-label="Text colour" className="h-8 w-12 rounded-md cursor-pointer bg-transparent" />
        </label>
      </div>
    </div>
  );
}

function FreeformInspector({ page, selectedId, onSelect }: { page: SlidePage; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const { addElement, removeElement, moveElement, updateElement } = useSlidesStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = page.elements.find((e) => e.id === selectedId) ?? null;

  function addText() {
    onSelect(addElement(textElement({ y: 30, h: 24, text: "New text" })));
  }

  async function addPicture(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const image = await fileToBackgroundDataUrl(file, 1600, 1_500_000);
      onSelect(addElement(textElement({ kind: "image", x: 25, y: 15, w: 50, h: 70, image })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const index = selected ? page.elements.findIndex((e) => e.id === selected.id) : -1;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={addText} className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md ctl font-body-ui text-[13px] text-on-surface">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">title</span>Add text
        </button>
        <button onClick={() => fileRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md ctl font-body-ui text-[13px] text-on-surface">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add_photo_alternate</span>Add picture
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void addPicture(e.target.files?.[0])} />
      </div>
      {error && <p className="font-body-ui text-[12px] text-error" role="alert">{error}</p>}

      <div>
        <span className="field-label">Items (front is last)</span>
        {page.elements.length === 0
          ? <p className="font-body-ui text-[12px] text-on-surface-variant">Empty page. Add text or a picture.</p>
          : (
            <ul className="space-y-1">
              {page.elements.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => onSelect(e.id)}
                    aria-pressed={e.id === selectedId}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left font-body-ui text-[13px] ${e.id === selectedId ? "row-selected border-primary/40 text-primary" : "border-outline-variant/50 text-on-surface hover:bg-surface-container-low"}`}
                  >
                    <span className="material-symbols-outlined text-[16px] shrink-0" aria-hidden="true">{e.kind === "image" ? "image" : "title"}</span>
                    <span className="truncate">{e.kind === "image" ? "Picture" : e.text.split("\n")[0] || "Empty text"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>

      {selected && (
        <div className="space-y-4 pt-1 border-t border-outline-variant">
          {selected.kind === "text" && (
            <>
              <label className="block pt-3">
                <span className="field-label">Text</span>
                <textarea value={selected.text} onChange={(e) => updateElement(selected.id, { text: e.target.value })} rows={4} className="field w-full rounded-md px-3 py-2 text-[13px] font-body-ui text-on-surface outline-none resize-y" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label={selected.auto_fit ? "Largest size (px)" : "Size (px)"} value={selected.font_size} min={10} max={400} onChange={(font_size) => updateElement(selected.id, { font_size })} />
                <label className="block">
                  <span className="field-label">Colour</span>
                  <input type="color" value={selected.color} onChange={(e) => updateElement(selected.id, { color: e.target.value })} aria-label="Text colour" className="h-9 w-full rounded-md cursor-pointer bg-transparent" />
                </label>
              </div>
              <div className="flex items-center gap-4">
                <Align value={selected.align} onChange={(align) => updateElement(selected.id, { align })} />
                <label className="flex items-center gap-2 font-body-ui text-[13px] text-on-surface">
                  <input type="checkbox" checked={selected.bold} onChange={(e) => updateElement(selected.id, { bold: e.target.checked })} className="accent-primary" />Bold
                </label>
              </div>
              <label className="flex items-center gap-2 font-body-ui text-[13px] text-on-surface" title="Makes the text smaller when it would not fit in the box. It never gets larger than the size above.">
                <input type="checkbox" checked={selected.auto_fit === true} onChange={(e) => updateElement(selected.id, { auto_fit: e.target.checked })} className="accent-primary" />Shrink text to fit the box
              </label>
            </>
          )}
          <div className={`grid grid-cols-2 gap-3 ${selected.kind === "image" ? "pt-3" : ""}`}>
            <NumberInput label="Left (%)" value={selected.x} min={0} max={100} onChange={(x) => updateElement(selected.id, { x })} />
            <NumberInput label="Top (%)" value={selected.y} min={0} max={100} onChange={(y) => updateElement(selected.id, { y })} />
            <NumberInput label="Width (%)" value={selected.w} min={2} max={100} onChange={(w) => updateElement(selected.id, { w })} />
            <NumberInput label="Height (%)" value={selected.h} min={2} max={100} onChange={(h) => updateElement(selected.id, { h })} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => moveElement(selected.id, 1)} disabled={index >= page.elements.length - 1} className="flex-1 h-8 rounded-md ctl font-body-ui text-[12px] text-on-surface disabled:opacity-40">Bring forward</button>
            <button onClick={() => moveElement(selected.id, -1)} disabled={index <= 0} className="flex-1 h-8 rounded-md ctl font-body-ui text-[12px] text-on-surface disabled:opacity-40">Send back</button>
            <button onClick={() => { removeElement(selected.id); onSelect(null); }} className="h-8 px-3 rounded-md ctl font-body-ui text-[12px] text-error">Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BackgroundField({ page, pageCount }: { page: SlidePage; pageCount: number }) {
  const { setBackground, applyBackgroundToAll } = useSlidesStore.getState();
  const mode = page.background === "theme" ? "theme" : page.background === "black" ? "black" : "colour";
  return (
    <div className="pt-4 border-t border-outline-variant">
      <label className="block">
        <span className="field-label">{pageCount > 1 ? "Background (this page)" : "Background"}</span>
        <select
          value={mode}
          onChange={(e) => setBackground(e.target.value === "colour" ? "#1e293b" : e.target.value)}
          className="field-input"
        >
          <option value="theme">Presentation theme</option>
          <option value="black">Black</option>
          <option value="colour">Solid colour</option>
        </select>
      </label>
      {mode === "colour" && (
        <input type="color" value={page.background} onChange={(e) => setBackground(e.target.value)} aria-label="Background colour" className="mt-2 h-9 w-full rounded-md cursor-pointer bg-transparent" />
      )}
      {mode === "theme" && (
        <p className="mt-1.5 font-body-ui text-[12px] text-on-surface-variant leading-relaxed">Uses the active theme's colour, picture or video behind your text.</p>
      )}
      {pageCount > 1 && (
        <button onClick={applyBackgroundToAll} className="mt-2 h-8 w-full rounded-md ctl font-body-ui text-[12px] text-on-surface">Use for all pages</button>
      )}
    </div>
  );
}
