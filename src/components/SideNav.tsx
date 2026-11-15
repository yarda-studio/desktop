import { useRef } from "react";
import { useAppStore, type View } from "../store/app";
import { useSlidingIndicator, GLIDE_EASE, type IndicatorBox } from "../hooks/useSlidingIndicator";

interface NavItem {
  id: View;
  icon: string;
  label: string;
}

const NAV_ITEMS: Record<View, NavItem> = {
  reading:    { id: "reading",   icon: "menu_book",  label: "Library"   },
  live:       { id: "live",      icon: "live_tv",    label: "Live Show" },
  bookmarks:  { id: "bookmarks", icon: "bookmark",   label: "Bookmarks" },
  search:     { id: "search",    icon: "search",     label: "Search"    },
  history:    { id: "history",   icon: "history",    label: "History"   },
  modules:    { id: "modules",   icon: "extension",  label: "Modules"   },
  notes:      { id: "notes",     icon: "edit_note",  label: "Notes"     },
  customize:  { id: "customize", icon: "palette",    label: "Customize" },
  songs:      { id: "songs",     icon: "library_music", label: "Songs"  },
  slides:     { id: "slides",    icon: "slideshow",     label: "Slides" },
};

// Study mode is the personal-study experience only — Live Show and
// Customize (presentation themes) don't exist there at all, not just
// reordered lower. Choosing Presentation adds them on top of everything
// Study already has (see Preferences.workspace, src-tauri/src/types.rs).
const STUDY_ORDER: View[] = ["reading", "bookmarks", "search", "history", "modules", "notes"];
const PRESENTATION_ORDER: View[] = ["live", "reading", "customize", "search", "modules", "bookmarks", "notes", "history"];

/** Screens that show the side navigation. App.tsx reserves RAIL_WIDTH_PX on the left for them. */
export const SIDE_NAV_VIEWS: readonly View[] = ["reading", "modules", "search", "history", "bookmarks", "notes"];
/** Collapsed width; the rail grows over the content on hover rather than pushing it. */
export const RAIL_WIDTH_PX = 64;

/** The highlight that glides between nav items (measured from the item marked data-active). */
function NavHighlight({ box }: { box: IndicatorBox }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute left-0 top-0 !m-0 rounded-lg border border-primary/[0.18] bg-primary/[0.12] ${box.animate ? "transition-[transform,width,height] motion-reduce:transition-none" : ""}`}
      style={{ transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h, opacity: box.visible ? 1 : 0, transitionDuration: `${box.duration}ms`, transitionTimingFunction: GLIDE_EASE }}
    />
  );
}

/**
 * The one side navigation for the whole app, drawn once by App.tsx (not by each screen).
 * It stays a slim icon rail on every screen and opens over the content while the pointer
 * (or keyboard focus) is on it, so no screen ever has a permanently wide sidebar. Hovering an
 * item turns it the primary green so it is clear what will open.
 *
 * It is positioned inside the content area (absolute, full height), not at a fixed offset from
 * the window, so it always meets the top bar exactly whatever height the bar is.
 */
export default function SideNav() {
  const { view, setView, workspace } = useAppStore();
  const items = (workspace === "presentation" ? PRESENTATION_ORDER : STUDY_ORDER).map((id) => NAV_ITEMS[id]);
  const listRef = useRef<HTMLDivElement>(null);
  const box = useSlidingIndicator(listRef, view);

  return (
    <nav
      data-tour="side-nav"
      aria-label="Sections"
      className="group absolute inset-y-0 left-0 z-40 glass !rounded-none !border-y-0 !border-l-0 w-16 overflow-hidden transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.4,0.05,0.15,1)] motion-reduce:transition-none hover:w-[200px] hover:delay-100 hover:shadow-xl focus-within:w-[200px]"
    >
      <div ref={listRef} className="relative flex h-full w-full flex-col items-start space-y-2 px-2 py-4">
        {items.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : undefined}
              className={`relative z-10 flex w-full items-center rounded-lg px-3 py-2.5 text-left transition-colors duration-200 ${
                active ? "font-bold text-primary" : "text-secondary hover:text-primary focus-visible:text-primary"
              }`}
            >
              <span className="material-symbols-outlined mr-4 shrink-0 text-[20px]">{item.icon}</span>
              <span className="font-body-ui text-body-ui whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:delay-150 group-focus-within:opacity-100">
                {item.label}
              </span>
            </button>
          );
        })}
        <NavHighlight box={box} />
      </div>
    </nav>
  );
}
