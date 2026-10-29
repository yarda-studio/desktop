import { useAppStore, type View } from "../../store/app";
import { useAiSearchStore } from "../../store/aiSearchStore";
import { appears, changes, clicked, pressed, submitted, typed, when, type TourTask } from "./tasks";

export type TourDepth = "essentials" | "full";
export type TourWorkspace = "study" | "presentation";

export interface TourShortcut {
  /** Tokens rendered as key caps — see keys.tsx ("mod" = Ctrl/⌘). */
  keys: string[];
  label: string;
}

export interface TourStep {
  id: string;
  /** "essentials" steps appear in both tours; "full" steps only in the full one. */
  depth: TourDepth;
  title: string;
  body: string;
  /** Value of the `data-tour` attribute on the element to spotlight. Omit for a centred card. */
  target?: string;
  /** Preferred side for the card, for when it would otherwise cover what the user is working with. */
  placement?: "bottom" | "top" | "left" | "right";
  /** Switch to this view when the step opens, so the thing being explained is on screen. */
  view?: View;
  shortcuts?: TourShortcut[];
  /** Hands-on work, done in order. Each completes when the user really does it. */
  tasks?: TourTask[];
  /** Setup when the step opens (beyond switching view). */
  onEnter?: () => void;
  /** Tidy-up when the step closes — dismiss sheets, panels and so on that the task opened. */
  onLeave?: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const t = (name: string) => `[data-tour="${name}"]`;
const app = () => useAppStore.getState();

/** Esc closes the sheets and menus the tasks open. Flagged so the tour's own Esc handler ignores it. */
export function closeOverlays() {
  const e = new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true });
  (e as KeyboardEvent & { fromTour?: boolean }).fromTour = true;
  document.dispatchEvent(e);
}

const looksLikeWord = (v: string) => /[a-z]{4,}/i.test(v) && !/[\d?/"]/.test(v);

// ── Study ────────────────────────────────────────────────────────────────────

const STUDY: TourStep[] = [
  {
    id: "study-intro", depth: "essentials", view: "reading",
    title: "Welcome to your study space",
    body: "This tour is hands-on: you'll type real references, search real words and open real tools, so you learn by doing. Each step has a short checklist — or press Skip step if you'd rather move on. Esc leaves the tour.",
  },
  {
    id: "study-jump", depth: "essentials", view: "reading", target: "topbar-search", placement: "right",
    title: "Jump to any passage",
    body: "This bar takes a reference. Abbreviations work (jn, rom, 1co), and Space completes a book name.",
    shortcuts: [{ keys: ["mod", "L"], label: "Focus this bar from anywhere" }],
    onEnter: () => app().setSearchMode("scripture"),
    tasks: [
      { prompt: "Click the bar and type a reference, e.g. rom 8:28", done: typed(`${t("topbar-search")} input`, (v) => v.trim().length >= 3) },
      {
        prompt: "Press Enter to go there",
        // Enter itself counts too, so typing the verse you're already on still completes.
        done: [when((n, b) => n.verseKey !== b.verseKey), submitted(`${t("topbar-search")} input`, (v) => /\d/.test(v))],
      },
    ],
  },
  {
    id: "study-books", depth: "full", view: "reading", target: "book-nav", placement: "right",
    title: "Browse by book",
    body: "The Study Library lists every book in groups. Open a group, pick a book, and you're at its first chapter.",
    tasks: [{ prompt: "Pick a different book from the list", done: when((n, b) => n.book !== b.book) }],
  },
  {
    id: "study-chapters", depth: "full", view: "reading", target: "chapter-nav", placement: "bottom",
    title: "Step through chapters",
    body: "Use the arrows here, or the keyboard, to move chapter by chapter.",
    shortcuts: [
      { keys: ["mod", "P"], label: "Previous chapter" },
      { keys: ["mod", "N"], label: "Next chapter" },
    ],
    tasks: [{ prompt: "Go to the next chapter", done: when((n, b) => n.chapterKey !== b.chapterKey) }],
  },
  {
    id: "study-select", depth: "essentials", view: "reading", target: "reading-text",
    title: "Select a verse",
    body: "The highlighted verse is your place in the chapter — it's where tools open from and what the app remembers.",
    tasks: [{ prompt: "Click any verse", done: clicked(`${t("reading-text")} .verse-container`) }],
  },
  {
    id: "study-tools", depth: "essentials", view: "reading", target: "reading-text",
    title: "Verse tools",
    body: "Hover a verse and a small toolbar appears at its right edge: copy, note, bookmark, commentary, cross-references and translation compare. Cross-references link to related passages elsewhere in the Bible.",
    tasks: [{ prompt: "Hover a verse and click the cross-references icon (the link)", done: clicked('.verse-actions button[title="Cross-references"]') }],
    onLeave: closeOverlays,
  },
  {
    id: "study-commentary", depth: "full", view: "reading", target: "reading-text",
    title: "Commentary",
    body: "Commentary shows Matthew Henry's notes on the verse you pick.",
    tasks: [{ prompt: "Hover a verse and click the commentary icon (the book)", done: clicked('.verse-actions button[title="Commentary"]') }],
    onLeave: closeOverlays,
  },
  {
    id: "study-compare", depth: "full", view: "reading", target: "reading-text",
    title: "Compare translations",
    body: "See the same verse in every translation you've installed, one under the other.",
    tasks: [{ prompt: "Hover a verse and click the compare icon", done: clicked('.verse-actions button[title="Compare translations"]') }],
    onLeave: closeOverlays,
  },
  {
    id: "study-notes", depth: "full", view: "reading", target: "reading-text",
    title: "Write a note",
    body: "Notes attach to the verse you write them on and are collected in the Notes view.",
    shortcuts: [{ keys: ["mod", "Enter"], label: "Save a note (inside the note box)" }],
    tasks: [{ prompt: "Hover a verse and click the note icon", done: clicked('.verse-actions button[title="Add note"]') }],
    onLeave: closeOverlays,
  },
  {
    id: "study-strongs", depth: "essentials", view: "reading", target: "reading-text",
    title: "Original-language words",
    body: "Words with a dashed underline have a Strong's number. Open one to see its Hebrew or Greek entry, definition and where else it's used. (No dashed words? Turn on Strong's numbers in Settings → Study Tools.)",
    tasks: [{ prompt: "Double-click a dashed word", done: when((n, b) => n.strongs !== null && n.strongs !== b.strongs) }],
    onLeave: () => { app().setSelectedStrongs(null); closeOverlays(); },
  },
  {
    id: "study-search", depth: "essentials", view: "search", target: "search-input", placement: "bottom",
    title: "Search the whole Bible",
    body: "Search finds every verse containing your word or phrase, with the match highlighted. Click a result to read it in context.",
    shortcuts: [{ keys: ["mod", "K"], label: "Open word search from anywhere" }],
    onEnter: () => app().setSearchMode("word"),
    tasks: [
      { prompt: "Type a word, e.g. shepherd", done: typed(t("search-input"), (v) => v.trim().length >= 3) },
      { prompt: "Wait for results to appear below", done: appears(`${t("search-results")} button`) },
      { prompt: "Click a result to open it", done: clicked(`${t("search-results")} button`) },
    ],
  },
  {
    id: "study-scope", depth: "full", view: "search", target: "search-scope", placement: "bottom",
    title: "Narrow a search",
    body: "Limit a search to the Old or New Testament, or to specific books, to cut the noise. The filter applies to the next search you run.",
    tasks: [{ prompt: "Click a filter, e.g. NT or Books", done: clicked(`${t("search-scope")} button`) }],
  },
  {
    id: "study-history", depth: "full", view: "search", target: "side-nav", placement: "right",
    title: "Search history",
    body: "Every search is kept, with the verse you opened from it, so you can pick up where you left off.",
    shortcuts: [{ keys: ["alt", "H"], label: "Open search history" }],
    tasks: [{ prompt: "Open History in the left rail", done: when((n) => n.view === "history") }],
  },
  {
    id: "study-parallel", depth: "full", view: "reading", target: "parallel",
    title: "Two translations side by side",
    body: "Parallel view adds a second pane. Pick the second translation from the Study Library, and turn on the sync icon to scroll both together.",
    tasks: [{ prompt: "Click the split-screen icon to toggle parallel view", done: when((n, b) => n.parallel !== b.parallel) }],
    onLeave: () => { if (app().parallelMode) app().setParallelMode(false); },
  },
  {
    id: "study-font", depth: "full", view: "reading", target: "font-size",
    title: "Make the text comfortable",
    body: "Resize the reading text any time from the keyboard. Font, spacing and margins are in Settings → Appearance.",
    shortcuts: [
      { keys: ["mod", "plus"], label: "Larger text" },
      { keys: ["mod", "minus"], label: "Smaller text" },
      { keys: ["mod", "alt", "plus"], label: "Next preset size" },
    ],
    tasks: [{ prompt: "Press Ctrl + (⌘ + on Mac) to enlarge the text", done: when((n, b) => n.fontSize !== b.fontSize) }],
  },
  {
    id: "study-focus", depth: "full", view: "reading",
    title: "Focus mode",
    body: "Hide everything but the page when you want to read without distraction. Search and navigation still work from the keyboard while you're in it.",
    shortcuts: [
      { keys: ["mod", "F"], label: "Enter / leave focus mode" },
      { keys: ["Esc"], label: "Leave focus mode" },
    ],
    tasks: [
      { prompt: "Press Ctrl+F (⌘F on Mac) to enter focus mode", done: when((n) => n.fullscreen) },
      { prompt: "Press Esc to come back", done: when((n) => !n.fullscreen) },
    ],
  },
  {
    id: "study-theme", depth: "full", view: "reading", target: "theme",
    title: "Light, dark or system",
    body: "Switch theme from here. Accent colour is in Settings → Appearance.",
    tasks: [{ prompt: "Click the theme icon", done: when((n, b) => n.theme !== b.theme) }],
  },
  {
    id: "study-notes-view", depth: "full", view: "reading", target: "side-nav", placement: "right",
    title: "Your notes and bookmarks",
    body: "Everything you save from a verse is collected here, ready to come back to.",
    tasks: [{ prompt: "Open Notes or Bookmarks in the left rail", done: when((n) => n.view === "notes" || n.view === "bookmarks") }],
  },
  {
    id: "study-modules", depth: "full", view: "reading", target: "side-nav", placement: "right",
    title: "Add more Bibles and tools",
    body: "Modules is where you install other translations, commentaries and lexicons. The KJV and Strong's lexicons are installed for you.",
    tasks: [{ prompt: "Open Modules in the left rail", done: when((n) => n.view === "modules") }],
  },
  {
    id: "study-settings", depth: "full", view: "reading", target: "settings",
    title: "Make it yours",
    body: "Settings holds appearance, study tools, the full shortcut list, and this tour (Help → Interactive tour).",
    tasks: [{ prompt: "Open Settings", done: clicked(t("settings")) }],
  },
  {
    id: "study-done", depth: "essentials", view: "reading",
    title: "You're all set",
    body: "You've jumped to a passage, used the verse tools, opened a Strong's entry and searched the Bible. Replay this any time from Settings → Help → Interactive tour. The two shortcuts worth remembering:",
    shortcuts: [
      { keys: ["mod", "L"], label: "Jump to a passage" },
      { keys: ["mod", "K"], label: "Search for words" },
    ],
  },
];

// ── Presentation ─────────────────────────────────────────────────────────────

const SEARCH_INPUT = `${t("live-search")} input`;
const RESULTS = `${t("live-search-results")} button`;
const PREVIEW_TITLE = `${t("live-preview")} h2`;

const PRESENTATION: TourStep[] = [
  {
    id: "live-intro", depth: "essentials", view: "live",
    title: "Welcome to the Live Show console",
    body: "This tour is hands-on: you'll find verses, build a schedule and send them to the screen exactly as you would in a service. Nothing reaches an audience until you open the output window. Press Skip step to move on, or Esc to leave.",
  },
  {
    id: "live-jump", depth: "essentials", view: "live", target: "live-search", placement: "top",
    title: "Find a verse by reference",
    body: "One search bar does everything. Type a reference and the Preview jumps to it. Abbreviations work (jn, rom, 1co).",
    shortcuts: [{ keys: ["mod", "K"], label: "Focus the search bar" }],
    tasks: [
      { prompt: "Type a reference, e.g. rom 8:28", done: typed(SEARCH_INPUT, (v) => /\d/.test(v)) },
      { prompt: "Press Enter — the Preview changes", done: [changes(PREVIEW_TITLE), submitted(SEARCH_INPUT, (v) => /\d/.test(v))] },
    ],
  },
  {
    id: "live-search-text", depth: "essentials", view: "live", target: "live-search", placement: "top",
    title: "Or search the text",
    body: "Type words instead and the bar searches the Bible text, showing matches as you type. Pick one to jump straight to it.",
    tasks: [
      { prompt: "Type a word, e.g. shepherd", done: typed(SEARCH_INPUT, looksLikeWord) },
      { prompt: "Wait for matches to appear", done: appears(RESULTS) },
      { prompt: "Click a match", done: clicked(RESULTS, { on: "mousedown" }) },
    ],
  },
  {
    id: "live-scope", depth: "full", view: "live", target: "live-search", placement: "top",
    title: "Limit a search to a testament or book",
    body: "Put a scope and a slash before your word: nt/grace searches the New Testament, ot/mercy the Old, john,romans/love only those books.",
    tasks: [
      { prompt: "Type nt/grace", done: typed(SEARCH_INPUT, (v) => v.includes("/")) },
      { prompt: "Wait for matches to appear", done: appears(RESULTS) },
    ],
  },
  {
    id: "live-phrase", depth: "full", view: "live", target: "live-search", placement: "top",
    title: "Match an exact phrase",
    body: "Wrap words in quotes to match them together, in order.",
    tasks: [
      { prompt: 'Type "good shepherd" with the quotes', done: typed(SEARCH_INPUT, (v) => /"[^"]{3,}/.test(v)) },
      { prompt: "Wait for matches to appear", done: appears(RESULTS) },
    ],
  },
  {
    id: "live-filter", depth: "full", view: "live", target: "live-search", placement: "top",
    title: "Filters and whole-word matching",
    body: "The filter menu at the right of the bar sets the testament or books, and can match whole words only (so 'son' won't find 'person').",
    shortcuts: [{ keys: ["alt", "F"], label: "Open the filter menu" }],
    tasks: [{ prompt: "Press Alt+F with the search bar focused", done: pressed("alt", "F") }],
    onLeave: closeOverlays,
  },
  {
    id: "live-verses", depth: "essentials", view: "live", target: "live-verses", placement: "top",
    title: "The chapter you're previewing",
    body: "The list at the bottom shows the whole chapter. Click a verse to preview it — it appears in the Preview panel above, but not on the audience screen.",
    tasks: [{ prompt: "Click a verse in the list", done: clicked(`${t("live-verses")} [data-verse]`) }],
  },
  {
    id: "live-range", depth: "full", view: "live", target: "live-verses", placement: "top",
    title: "Select several verses",
    body: "Hold Shift and click a second verse to select everything between. The selection previews as a group and queues as one item.",
    shortcuts: [{ keys: ["shift", "left"], label: "Shrink the range" }, { keys: ["shift", "right"], label: "Extend the range" }],
    tasks: [{ prompt: "Shift+click another verse", done: clicked(`${t("live-verses")} [data-verse]`, { shift: true }) }],
  },
  {
    id: "live-queue", depth: "essentials", view: "live", target: "live-queue-add", placement: "bottom",
    title: "Add it to the schedule",
    body: "Queue puts what you're previewing into the schedule, in the order you'll use it. You can do this for the whole service ahead of time.",
    shortcuts: [{ keys: ["mod", "Q"], label: "Add to schedule" }],
    tasks: [{ prompt: "Click Queue (or press Ctrl+Q)", done: when((n, b) => n.queueLength > b.queueLength) }],
  },
  {
    id: "live-schedule", depth: "essentials", view: "live", target: "live-schedule", placement: "right",
    title: "Work through the schedule",
    body: "Click an item to load it into Preview. Edit reorders or removes items, and the arrow keys step up and down the list.",
    shortcuts: [
      { keys: ["up"], label: "Previous schedule item" },
      { keys: ["down"], label: "Next schedule item" },
      { keys: ["mod", "shift", "Q"], label: "Reorder or remove items" },
    ],
    tasks: [{ prompt: "Click your item in the schedule", done: clicked(`${t("live-schedule-list")} button`) }],
  },
  {
    id: "live-golive", depth: "essentials", view: "live", target: "live-golive", placement: "bottom",
    title: "Send it live",
    body: "Go Live moves the previewed verse into the Live panel — that's the moment it goes to the audience screen. You can also press Enter, or double-click a verse or schedule item.",
    shortcuts: [{ keys: ["Enter"], label: "Send the previewed verse live" }],
    tasks: [{ prompt: "Click Go Live", done: when((n, b) => n.verseKey !== b.verseKey || n.versePart !== b.versePart) }],
  },
  {
    id: "live-double", depth: "full", view: "live", target: "live-verses", placement: "top",
    title: "The fast way: double-click",
    body: "Double-click any verse — in the chapter list or the schedule — to preview and send it live in one move. Use it when you need a verse on screen right now.",
    tasks: [{ prompt: "Double-click a different verse", done: when((n, b) => n.verseKey !== b.verseKey) }],
  },
  {
    id: "live-step", depth: "full", view: "live", target: "live-preview", placement: "right",
    title: "Step through with the keyboard",
    body: "Click out of the search bar first, then use the arrows to move through the chapter. Preview follows you; nothing goes live until you send it.",
    shortcuts: [
      { keys: ["left"], label: "Previous verse" },
      { keys: ["right"], label: "Next verse" },
      { keys: ["mod", "N"], label: "Next chapter" },
    ],
    tasks: [{ prompt: "Press → to step to the next verse", done: pressed("right") }],
  },
  {
    id: "live-back", depth: "full", view: "live", target: "live-output", placement: "left",
    title: "Take it back",
    body: "Sent the wrong verse? Back returns to whatever was on screen before.",
    shortcuts: [{ keys: ["Backspace"], label: "Return to the previous live verse" }],
    tasks: [{ prompt: "Press Backspace", done: pressed("Backspace") }],
  },
  {
    id: "live-strongs", depth: "full", view: "live", target: "live-strongs", placement: "top",
    title: "Strong's numbers",
    body: "Toggle Strong's numbers on the verses in the console. Click a number to open its lexicon entry.",
    tasks: [{ prompt: "Click the Strong's button", done: when((n, b) => n.showStrongs !== b.showStrongs) }],
  },
  {
    id: "live-black", depth: "essentials", view: "live", target: "live-controls", placement: "bottom",
    title: "Black out the screen",
    body: "BLACK cuts the output to a plain black screen at once without losing your place; CLEAR brings the normal output back. LIVE (left) opens or closes the audience window on your chosen display.",
    shortcuts: [{ keys: ["C"], label: "Black screen on / off" }],
    tasks: [
      { prompt: "Click BLACK (or press C)", done: when((n) => n.black) },
      { prompt: "Click CLEAR to resume", done: when((n) => !n.black && !n.emergency) },
    ],
    onLeave: () => { app().setLiveBlack(false); app().setLiveEmergency(false); },
  },
  {
    id: "live-emergency", depth: "full", view: "live", target: "live-controls", placement: "bottom",
    title: "Emergency standby screen",
    body: "If something goes wrong mid-service, the emergency screen overrides everything — black and live content alike — until you clear it.",
    shortcuts: [{ keys: ["mod", "shift", "E"], label: "Emergency screen on / off" }],
    tasks: [
      { prompt: "Press Ctrl+Shift+E (⌘⇧E on Mac)", done: when((n) => n.emergency) },
      { prompt: "Click CLEAR to resume", done: when((n) => !n.emergency) },
    ],
    onLeave: () => { app().setLiveBlack(false); app().setLiveEmergency(false); },
  },
  {
    id: "live-context", depth: "full", view: "live", target: "live-output", placement: "left",
    title: "How many verses show at once",
    body: "Once the output is live, switch how much of the passage the audience sees. This only takes effect while LIVE is on.",
    shortcuts: [
      { keys: ["mod", "1"], label: "Active verse only" },
      { keys: ["mod", "2"], label: "Active + next" },
      { keys: ["mod", "3"], label: "Previous + active + next" },
      { keys: ["mod", "4"], label: "Whole chapter" },
    ],
    tasks: [{
      prompt: "Press Ctrl+1, 2, 3 or 4",
      done: [pressed("mod", "1"), pressed("mod", "2"), pressed("mod", "3"), pressed("mod", "4")],
    }],
  },
  {
    id: "live-outputs", depth: "full", view: "live", target: "outputs",
    title: "Pick the right display",
    body: "Outputs lists your connected screens. Choose where the audience window opens — typically the projector or second monitor.",
    tasks: [{ prompt: "Click the Outputs icon", done: clicked(`${t("outputs")} button`) }],
  },
  {
    id: "live-ask", depth: "essentials", view: "live", target: "live-search", placement: "top",
    title: "Ask in plain words",
    body: "Start the bar with ? and describe what you want — 'verses about hope' — and Ask Scripture suggests passages. It uses your free account: if prompted, sign in, or just carry on.",
    shortcuts: [{ keys: ["mod", "shift", "K"], label: "Open / close Ask Scripture" }],
    tasks: [
      { prompt: "Type ? verses about hope", done: typed(SEARCH_INPUT, (v) => v.trim().startsWith("?") && v.trim().length > 3) },
      {
        prompt: "Press Enter to ask",
        done: [when((n, b) => n.aiQuery !== b.aiQuery || (n.aiOpen && !b.aiOpen)), submitted(SEARCH_INPUT, (v) => v.trim().startsWith("?"))],
      },
    ],
    onLeave: () => useAiSearchStore.getState().setOpen(false),
  },
  {
    id: "live-ask-panel", depth: "full", view: "live", target: "live-ask", placement: "top",
    title: "The Ask Scripture panel",
    body: "Answers appear in a panel at the right. Click a suggested verse to send it to Preview. You can also open it without a question and type there.",
    onEnter: () => useAiSearchStore.getState().setOpen(true),
    tasks: [{ prompt: "Press Ctrl+Shift+K (⌘⇧K on Mac) to close it", done: when((n) => !n.aiOpen) }],
    onLeave: () => useAiSearchStore.getState().setOpen(false),
  },
  {
    id: "live-themes", depth: "full", view: "live", target: "themes",
    title: "Style what the audience sees",
    body: "Themes opens the Customization Studio, where you set the font, size and spacing of the output. Ctrl+Z undoes a change there.",
    tasks: [{ prompt: "Click Themes", done: when((n) => n.view === "customize") }],
  },
  {
    id: "live-songs", depth: "full", view: "live", target: "songs-tab",
    title: "Songs alongside scripture",
    body: "Songs has its own library plus the same Schedule → Preview → Live flow, so lyrics and verses go to the same screen. Import songs from the library panel.",
    tasks: [{ prompt: "Click Songs", done: when((n) => n.view === "songs") }],
  },
  {
    id: "live-settings", depth: "full", view: "live", target: "settings",
    title: "Settings and replay",
    body: "Theme, text size and presentation options live in Settings, along with the full shortcut list and this tour (Help → Interactive tour).",
    tasks: [{ prompt: "Open Settings", done: clicked(t("settings")) }],
  },
  {
    id: "live-done", depth: "essentials", view: "live",
    title: "Ready to present",
    body: "You've found verses by reference, text and AI, queued them, sent one live and blacked out the screen. Replay this from Settings → Help → Interactive tour. The ones to keep at your fingertips:",
    shortcuts: [
      { keys: ["Enter"], label: "Send to the screen" },
      { keys: ["C"], label: "Black screen" },
      { keys: ["mod", "Q"], label: "Add to schedule" },
    ],
  },
];

export function stepsFor(workspace: TourWorkspace, depth: TourDepth): TourStep[] {
  const all = workspace === "presentation" ? PRESENTATION : STUDY;
  return depth === "full" ? all : all.filter((s) => s.depth === "essentials");
}
