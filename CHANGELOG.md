# Changelog

All notable changes to Scriptura are listed here, newest first.

## [Unreleased]

## [0.4.1] - 2026-11-08

### Changed
- **Build tooling updated (Vite 8 and its React plugin 6).** This changes how the app is built, not what it does. The two must move together: Vite 8 with the old React plugin failed to install, which is what broke the automatic update PRs for them.

## [0.4.0] - 2026-11-08

### Added
- **Jump to a chapter and verse of the current book by typing `c1v3`.** In the Go-to box and the Live Show search bar, `c2v5`, `c2:v5` or `c2 v5` goes to chapter 2, verse 5 of the book you are in, and `c3` goes to chapter 3, verse 1. `v4` still goes to verse 4 of the chapter you are on. The box shows where it will land ("John 2:5") before you press Enter.
- **Live column mirrors a Strong's lookup on the output.** While a Strong's definition is being shown on the presentation window, the Live column displays a banner ("Strong's G... is on the output") with a Clear button, lists the definition's pages with the current one highlighted (click to switch), and the strip's label and arrows step through its pages. Clearing it returns to the live verse. When the output window is closed, "Show on output" shows a visible hint explaining that the output window must be opened first.
- **Search history in the Live Show search bar.** A history icon beside the Strong's and Ask buttons lists your recent searches, newest first, with the verse you picked and any book or testament filter. Choose one to put it back in the search box and run it again, or clear the list from the bottom.
- **NDI output (Mac, first version).** Outputs → NDI sends the presentation window over your network as an NDI source, so vMix, Wirecast, OBS (with the NDI plugin) and NDI Monitor can pick it up directly, with no browser source in between. It uses the NDI Tools you install yourself from ndi.video; without them the panel says how to get them and nothing else changes. The picture has no transparency (for keying over video, keep using the transparent web output), the presentation window has to be open and not minimised, and it is off each time the app starts. Windows is next.
- **Move everything to another computer with a file.** Settings → Sync & Backup has "Save to file…" and "Open a file…". Saving writes one file with your bookmarks, notes, history, songs, slides and their pictures, themes and the service plan; opening it on another computer replaces what is there and restarts the app. It needs no account and no subscription. Bible modules (with Strong's data) and theme background videos are left out unless you tick the boxes, because they make the file large. Opening a file replaces, it does not merge: whatever is on that computer is overwritten, so save a backup there first if you need it.

### Changed
- **The service plan now lives inside the Schedule column.** The plan strip that ran across the whole window above Live, Songs and Slides is gone. Each of those tabs shows the plan at the top of its Schedule column instead: closed, it is two short lines (steps, back and next, what is on and what is next, the clock); opened, its steps scroll inside the column, so opening it no longer pushes the Preview, Live and library panels down. That gives them the full height of the window. The plan, its keys (Shift+Page Down / Page Up) and its clock work as before, and a step's move, note and remove buttons now appear over the row on hover so narrow columns keep step titles readable.
- **The top bar is now the window's title bar on Mac.** The separate "Yarda" title strip is gone, so the app's top bar sits in that row beside the red, yellow and green window buttons. The bar is slimmer to match (44 points instead of 56, with tighter tab and button groups and smaller labels and icons) and everything in it, the window buttons included, sits on one centre line, so your content gets the room back. The empty parts of the top bar (and the first-run screen) still drag the window, and double-clicking them still enlarges it. Windows and Linux keep their usual title bar.

### Fixed
- **The Strong's lookup adapts to the space it has.** Docked in the Live Show console, the lookup used to keep its full-size header, tabs and action row in a column of any height, so in a shorter window its text was squeezed to a sliver and spilled over the output strip below it. Now the header is compact, the source tabs and "Show on output" share one row that wraps when the column is narrow, the header stays pinned while the lookup scrolls (and scrolls away with it in the very shortest columns), and the output strip below shrinks, down to a single row with arrows, when the column is short. Live Show now uses the same output strip as the Songs and Slides tabs. The floating lookup sheet in study mode keeps a margin at each side in narrow windows.
- **The welcome screen no longer looks as if "Personal study" is already chosen.** The window put its keyboard focus on the first card as it opened, which drew a heavy outline around it, and the tour-length option below looked picked too. Now nothing looks chosen until you click a card, and the tour options stay plain until you do. Tabbing still shows where focus is.
- **Restoring a backup no longer loses track of installed Bible modules.** A restore used to replace the list of installed modules with the one from the backup's computer, so modules only on this computer dropped off the list and modules that were not here stayed listed. The list now matches the files on this computer after any restore, cloud or file.

## [0.3.0] - 2026-11-08

### Added
- **Service plan.** One running order across scripture, songs and slides. A strip above the Live, Songs and Slides tabs shows what is on screen, what is next, and a service clock, and opens into an editable list. Add a song, a slide or a passage with its "Add to plan" button, plus cues for a black screen, a countdown (it starts the countdown timer) or a private note for the operator. Give each step a planned length and the clock shows how far ahead or behind you are as each step begins. Back and Next (or `Shift+Page Down` / `Shift+Page Up`) put the next step on screen and switch to the right tab; inside a song or a multi-page slide they move through its slides or pages first. When the plan is running, the phone remote's Next and Back step the plan too. The plan keeps its own file, so a problem with it cannot affect songs, slides or scripture.
- **Multi-page free-form slides.** A free-form slide can now have several pages, each with its own text boxes, pictures and background. The slide editor gets a page strip with live thumbnails to add, duplicate, reorder and delete pages, and a "Use for all pages" button for the background. On the Slides tab, Page Down / Page Up (and the phone remote's Next / Back) step through a slide's pages before moving to the next scheduled slide, and going back lands on the previous slide's last page. Preview and Live show page buttons for jumping straight to a page, and the stage display lists the next page before the next slide. Slides you already have open as a single page, and old backups still restore.

### Changed
- **The service plan now syncs between your devices** with cloud sync. Edit the plan on one computer and it appears on the others. The newest edit wins for the whole plan, so if two devices change it at once, the later edit is kept. Songs and slides are not synced, so a song or slide step is matched to one with the same title on the other device; a step with no match stays in the plan marked as not linked, ready to be re-added. A plan from another device is not swapped in while a service is running (it is picked up afterwards), and a plan too large for the cloud (about 240 KB of text) is reported rather than dropped. The plan syncs on its own: a problem with it cannot stop the rest of cloud sync, and the rest of cloud sync cannot touch the plan.
- **Shrink text to fit.** A text box on a slide can now shrink its text until it fits, instead of being cut off at the bottom of the box. The size you set becomes the largest it may be, and it never goes below a fifth of that. It is measured on the real output, so it also follows the box when you resize it. New text boxes and announcements have it on; slides you already have look exactly as before until you turn it on ("Shrink text to fit the box").
- **Undo and redo in the slide editor.** Undo and Redo buttons in the editor's header, and `Ctrl+Z` / `Ctrl+Shift+Z` (`Cmd` on a Mac; `Ctrl+Y` also redoes) step back and forward through your edits, including while a text box or the title has focus. A drag, a run of arrow-key nudges or a burst of typing is one step; adding, deleting or reordering boxes and pages is a step each, and undoing a page change takes you back to that page. The last 100 steps are kept while the editor is open, including after Apply.
- **Slide thumbnails.** The slide library and the schedule now show a small picture of each slide's first page, drawn by the same renderer as the output. They load as you scroll and refresh when you save a slide.
- **Slide pictures are now files, not part of the slide database.** Each picture is saved once in the app's media folder and the slide keeps only its name, so saving, opening and backing up a slide no longer copies every picture. Backups include the picture files and a restore puts them back. Pictures in slides you already have move out to files the next time the app starts, and a backup made before this still restores with its pictures. Pictures nothing uses any more are deleted when a slide is saved or deleted. Downgrading to an older version after this will show empty boxes where pictures were.
- **The service plan is now in backups.** Backups include the plan and restoring one brings it back; a backup made before this has no plan and leaves yours as it is. The plan on screen reloads after a restore.
- **Back retraces Next in the service plan.** Stepping Back into a song, a multi-page slide or a split verse now lands on its last lyric slide, page or part instead of the first.
- **The plan steps through the parts of a long verse.** When "split long verses" is on, Next and Back move through a verse's parts before moving to the next step.

### Security
- **XML reader updated.** Song imports (OpenLyrics, OpenSong, ProPresenter) and module text (OSIS, ThML) now use quick-xml 0.41, which fixes two denial-of-service advisories where a hostile file could use up memory or time. Ampersands, quotes and numeric characters such as `&amp;` and `&#8217;` still read correctly, and a character the file defines but we do not know (such as `&nbsp;`) is skipped instead of dropping the whole passage.
- **Zip reader updated.** Backups, module installs and EasyWorship imports now use zip 9, which fixes the zip advisories for our own code (symlink and permission handling when unpacking an archive). An archive entry whose name is not valid text is skipped.

## [0.2.3] - 2026-11-04

### Added
- **First-run setup.** A new setup screen walks you through downloading the KJV and Strong's before you start, so the app opens ready to use.
- **Translation picker in Live Show.** Switch translations from a bar in Live Show, and show parallel verses on the output.

### Changed
- **Scriptura is now Yarda.** The app, its links and its update channel have moved to the new name and the public repository, yarda-studio/desktop.
- **Live opens when you switch to Presentation.** Moving into Presentation takes you straight to the live view.

## [0.2.2] - 2026-10-28

### Added
- **Strong's on the live output.** Look up a word and press Show on output to put its full definition on the screen, with the word, number and root. Long entries split into pages that follow your theme's font size, and keep their bold, italic and references.
- **Page strips for definitions.** The pages show in the Preview column like verse slides: click to select, double-click to show.

### Changed
- **The lookup no longer covers the console.** In Live Show it docks in the Preview column, and stays private until you show it.

### Fixed
- The dev server no longer hangs on startup on some Macs.

## [0.2.1] - 2026-10-25

### Changed
- **A cleaner presentation top bar.** The Scriptures, Slides, Songs and new Themes tabs now sit together on the left, with Live, Black and Clear grouped in the centre, so the controls you use during a service stay in one place and no longer shift when the window resizes. The Slides tab is no longer hidden in narrower windows.
- **Steadier toolbar icons.** Toolbar buttons and the account button now share one size and their icons line up vertically.
- **Calmer selected rows.** Selected lists and cards use a soft highlight without the accent bar down the left edge.

## [0.2.0] - 2026-10-25 - Scriptura Pro, Teams, Cloud Sync & Shared Library

### Added
- **Scriptura Pro & Team Plans**:
  - Provider-agnostic merchant-of-record billing integration (Dodo Payments) with automated webhook signature verification and idempotent subscription lifecycle handling.
  - Hosted checkout and customer portal gateways with server-verified ownership checks.
  - Pro entitlements: 500 Ask Scripture searches per day, multi-device cloud sync, automatic backups, and hosted outputs.
  - Team entitlements: shared organization workspaces, role-based access control (Owner, Admin, Member, Viewer), pooled or per-seat search quotas, and shared library collaboration.
- **Organizations & Team Management**:
  - Organization switcher and settings panel integrated directly into the Account view.
  - Member directory with role management, member removal, and ownership transfer.
  - Single-use email-bound invites and revocable shareable invite links with seat limit enforcement.
  - Audit logging tracking all member role changes, invitations, and ownership transfers.
- **Cloud Sync (Local-First)**:
  - Background SQLite change tracking via migration triggers on bookmarks, notes, reading position, search history, presentation themes, service order items, and preferences.
  - Last-write-wins synchronization loop with exponential backoff and storage quota enforcement.
  - First-time second device prompt offering intelligent merge vs cloud restore.
  - Encrypted zip database backups to Supabase cloud storage with list and one-click restore.
- **Team Shared Library**:
  - Real-time synchronized library for service plans, songs, slide decks, themes, and study notes.
  - Optimistic concurrency control with interactive conflict resolution dialog ("Reload / Keep mine").
  - 50 MB client-capped media upload to organization storage buckets.
  - Fail-safe offline caching ensuring presentation continuity even when internet is lost during service.
- **Hosted Outputs & Remote Relay RFC**:
  - Comprehensive architectural design document (`docs/hosted-outputs-design.md`) specifying an end-to-end encrypted (E2EE) WebSocket relay for cross-network phone remotes and web outputs.

## [0.1.41] - 2026-10-25

### Added
- **A guided first-run tour.** The first time you open Scriptura you choose how you'll use it, Personal study or Presentation, and can take a hands-on tour of that mode. It is not a slideshow: you type real references, search real words, open verse tools and Strong's entries, then in Presentation build a schedule, send a verse live, black out the screen and ask Scripture a question, and each step ticks off when you actually do it. Choose **Essentials** for the daily basics or the **Full tour** for every feature and shortcut.
- **Replay the tour any time.** Settings → General and Settings → Help each have an Interactive tour row (Essentials or Full tour), and the Settings sidebar has a "Replay the tour" shortcut.
- **Video mixer output (OBS, vMix and others).** Outputs → "Video mixer" can serve the output as a web page on your network. Add the link to OBS as a Browser Source (or to vMix, Wirecast or any web input) to put scripture, songs, slides and the countdown on your stream or into your mix; the page updates live, plays video backgrounds, and a second link gives the stage display for a tablet or TV. A third, transparent link shows only the text so you can key it over video, and the chroma-key Lower Third theme still works for mixers that prefer it. The links are secret and separate from the phone remote's, can be reset, and the page is off until you turn it on. The output is a browser page rather than a native NDI stream; mixers that take NDI can still receive it through OBS's NDI plugin or NDI Tools' screen capture.
- **Import songs from EasyWorship, ProPresenter and OpenSong.** In the Songs tab, Import songs now has a "From another program" section. Choose files or a whole folder and review the songs before importing; sections (Verse, Chorus, Bridge…), authors, copyright and CCLI numbers come across, and a chorus used several times becomes one section with the right playing order. Supported: EasyWorship 6 and 7 (the `Songs.db` library, or a `.ewsx` export), ProPresenter 4, 5 and 6 (`.pro4`, `.pro5`, `.pro6`), ProPresenter 7 `.pro` files on a best-effort basis (the words come across, but not the group names), and OpenSong song files or its whole Songs folder. EasyWorship 2009 and older libraries are not supported. Text and OpenLyrics import keep working as before, and ProPresenter or OpenSong XML dropped into the old file picker is recognised too.
- **Phone remote.** A new Remote button in the presentation top bar turns on a small control page you open on a phone on the same Wi-Fi: scan the QR code and you get big Back and Next buttons, Black, Standby and Clear, a live view of what is on screen, and the countdown timer's start, pause and reset. Next and Back step whichever tab is open: lyric slides in Songs, scheduled slides in Slides, and verses (including the parts of a long split verse) in the Live Show. It is off until you turn it on, only works with the secret link shown in the app, can be reset at any time to sign out every phone, and the phone can only press those buttons. The connection is not encrypted, so use a network you trust.
- **Countdown timer.** A new Timer button in the presentation top bar opens a countdown you can set to run for a length of time or until a time of day (for example 10:00), with a message above it such as "Service starts in". Start, pause, resume or reset it, and choose whether it takes over the output screen. It covers scripture, songs and slides, and uses the active theme's background and font. BLACK and the standby screen still override it, and the live preview thumbnails show it too.
- **Stage display.** Outputs → "Stage display on…" opens a second window for the worship team on a display you choose. It shows the time of day, any running countdown (red in the last minute), what is on the output now in large text, and what comes next: the next lyric slide, the next scheduled slide, or the next verse. It only reads what the output is showing, so nothing on it changes the service.
- **Slides.** The Slides tab now works like the Songs tab: Schedule, Preview and Live across the top and a slide library below. Create an **announcement** (a heading and a message, with size, alignment and colour) or a **free-form slide** where you place text boxes and pictures anywhere by dragging, resize them from the corner, nudge them with the arrow keys and reorder them front to back. Each slide can use the active theme's backdrop (including a video), black, or a solid colour. Double-click a slide in the library to schedule it, double-click it in the schedule to send it live, and use Page Down / Page Up to step through the schedule. BLACK, CLEAR and the standby screen work on slides too.
- **Motion video backgrounds.** A theme can now play a looping, muted video behind the text on the live output, song slides and the theme previews. Pick an MP4, M4V, MOV or WebM in the Theme Designer under Background → Motion video; the file is copied into Scriptura's own media folder, so moving or deleting the original doesn't break the theme. The "Darken" slider now applies to video as well as pictures.

### Changed
- **More room in the top bar.** The "Scriptura" name is gone from the Study and Presentation top bars, leaving the space to the controls.

## [0.1.39] - 2026-10-24

### Changed
- **Ask Scripture is more accurate and faster.** Searches now use Claude Sonnet 5.5, and every result is checked against the real King James text before it is shown, so the Match and Related labels reflect an actual check. Loosely worded descriptions now return their best candidates instead of nothing, and searches typically finish in about 3 to 5 seconds.

## [0.1.38] - 2026-10-24

### Fixed
- **Ask Scripture search:** Searches through your account were failing with "The search service had a problem" because the gateway sent Claude a request it rejected. Searches work again, and the gateway now records the reason when a search fails.

## [0.1.37] - 2026-10-24

### Added
- **Song Editor Improvements:** Smarter lyric paste parsing with automatic section header detection, editor keyboard shortcuts, and live section indicator colours in presentation runner.

### Fixed
- **Ask Scripture Search Gateway:** Added canonical book normalization (e.g. "Psalm" -> "Psalms") and canonical KJV validation fallback so queries return accurate scripture passages consistently.
- **Ask Scripture Modal Layout:** Aligned the Ask Scripture panel with the verse pane and removed the viewport jump behavior.

## [0.1.36] - 2026-10-23

### Added
- **Songs.** A new Songs tab in the Presentation workspace with a song library (title, author and copyright columns, search over lyrics, favourites and collections), a Song Editor (Words and Slides tabs, live slide preview, play order, Apply / OK / Cancel) and importers for plain text, CCLI SongSelect text and OpenLyrics files. Long sections split into evenly sized slides, with a lines-per-slide setting.
- **Song schedule, preview and live.** The Songs tab mirrors the Scriptures screen: Schedule, Preview and Live across the top, the library below. Double-click a song to add it to the schedule; Go Live sends slides to the output window, styled by your presentation theme. BLACK and CLEAR work on songs too. PageDown / PageUp step the live slide.

### Changed
- **Settings** fade and slide in and out, sections fade in as you switch, saved preferences load before the first open, and the feedback email uses the real app version.
- The Ask Scripture panel header lines up with the library's reference bar in the Live Show console.

## [0.1.35] - 2026-10-21

### Changed
- **New default look: Ink.** The default accent is now a warm near-black (warm off-white in dark mode), with cream and soft-charcoal surfaces. Indigo and the other accents are still available under Settings, Appearance. Existing installs keep their saved accent.
- **Sign-in and welcome emails** use the same cream and ink palette.

### Added
- **Settings redesigned** as a centred window with a section list on the left (Account, General, Appearance, Study Tools, Presentation, AI Scripture Search, Sync & Backup, Help, About) and one section at a time on the right. The Account section shows sign in or out, your current plan, today's Ask Scripture usage and a license key field (not active yet).
- **Account button and sign-in window**: a Sign in button in the top bar (your initial once signed in) opens a window where you enter your email and the code we send you. It also shows who you're signed in as, with Sign out and Delete account. There is an Account row in Settings too, and the Ask Scripture panel uses the same sign-in form.
- **Ask Scripture Claude Gateway**: Ask Scripture no longer requires a GPU service. Searches run through a Supabase Edge Function gateway backed directly by Anthropic Claude (Haiku 5.5). Users sign in with a 6-digit email code and search without needing to configure or supply any API keys.
- **Strict KJV Database Verification**: Every reference nominated by the AI is cross-checked against the 31,102 verses in the King James Bible (`kjv_verses` in Postgres). Hallucinated books or chapters are discarded, verse numbers are clamped, and passages are checked against real scripture text before reaching the user.
- **Privacy & Account Deletion**: Users can delete their account directly from Settings, cascading the deletion across all user data on the server. Question text is never stored in the database or logged in server telemetry.
- **Token & Cost Tracking**: Atomically tracks token usage per user with daily plan limits and a global spend circuit breaker, with live cost estimation based on active Anthropic model rates.
- **Advanced Connections**: Users can bring their own Anthropic Claude API key stored locally in Rust or connect to an own Modal search server.
- **Thayer's Greek Lexicon**: Full New Testament Greek Thayer definitions bundled offline (all 5,523 Strong's numbers G1–G5624) with hierarchical sense outlines and clickable Scripture references. Select "Thayer" via the pill toggle or set it as default in Settings.
- **Ask Scripture** in the Live Show console: a panel beside the verse list where you describe a passage, topic or feeling in plain words and get matching verses. Click a result to load it into Preview and select it. Sign in with your email (a one-time code, no password) and it searches through the Scriptura gateway, with a daily limit per account. Open it with the **Ask** button or `Mod+Shift+K`. Anyone who runs their own search server on Modal can connect it instead (`services/scripture-search/README.md`). Accounts, usage limits and the gateway live in `supabase/` (see its README).

### Changed
- Ask Scripture checks its own answers: Claude reads the real text of each candidate verse and only passages it judges a match or related are shown, labelled in the panel. If nothing fits it says so instead of guessing, and if the check can't run the results are marked as unchecked. The search service also uses a larger embedding model (Qwen3-Embedding-4B) and matches each verse together with its neighbours, so stories can be found by describing them.
- The Live Show search bar is now a single input with no modes. What you type decides what happens: `jn 3:16` or `v5` jumps to a verse, anything else searches the text, `/john` forces a text search for a word that is also a book name, and starting with `?` asks Ask Scripture. The icon and the tag at the right edge show what the bar decided. `Mod+K` and `Mod+L` both just focus the bar.

## [0.1.34] - 2026-10-18

### Fixed
- Version 0.1.33 never shipped: its build stopped on an unused variable in the Live Show console. Everything listed under 0.1.33 is in this release.

## [0.1.33] - 2026-10-18

### Added
- The Module Manager library opens instantly: a bundled catalog is shown straight away, the last downloaded catalog is cached between launches, and the live repositories refresh in parallel in the background.
- Select a range of scriptures in the library with Shift-click or Shift + arrow keys, then add the whole range to the schedule. `Mod+Q` now adds the previewed verse or selected range to the schedule, and the service queue drawer moved to `Mod+Shift+Q`.
- The Strong's sheet keeps the full lexicon entry for Abbott-Smith, BDB and LSJ: Greek and Hebrew words, Septuagint notes, and verse citations you can click, laid out as an indented outline of senses.

### Fixed
- Some Strong's lexicon entries were cut off or came out empty (for example G2149 and G4396) because one unclosed `[` in the source swallowed the rest of the entry.
- Lexicon entries from STEPBible no longer begin with a stray `: `, and TFLSJ sense numbers (`2)`, `II)`) are no longer left inside a dangling bold tag. Mismatched bold, italic and citation tags in the source are repaired.

## [0.1.32] - 2026-10-18

### Added
- The Live Show console now has an EasyWorship-style **Schedule | Preview | Live** layout: three columns across the top, with the verse library full-width below. Preview and Live each end in an output strip with a thumbnail of the real output screen, "Slide n of N" and previous/next arrows. Double-click a slide or a Schedule item to send it live, and the Live column's slides and arrows change the part on screen. This replaces the old Live display card, Main Output panel and "Next in queue" bar. Header buttons go icon-only below 1100 px so everything still fits the 900 px minimum width.

### Fixed
- The light/dark fade stuttered. It now cross-fades a snapshot of the old screen into the new one instead of repainting every frosted-glass layer each frame. Browsers without support for it, and people who ask their OS for reduced motion, switch instantly.
- In the new Live Show layout the columns touched each other and the headers were cramped. The columns now have a proper gutter between them, the Preview title no longer truncates, and the Preview and Live thumbnails are the same size.

## [0.1.31] - 2026-10-11

### Added
- Redesigned Theme Designer: a three-pane layout with a theme library, a canvas with undo/redo and zoom, and a collapsible inspector. It has configurable grids with optional snap-to-grid.
- Themes now control the live output's text: font size, line height and letter spacing come from the theme, so the text options in Settings only affect reading text. Existing themes were seeded from your current settings, so the live output looks the same after upgrading.
- Themes can have a picture background and a verse-box fill (what makes a lower-third bar).
- Two new built-in themes next to Midnight: **Lower Third** (chroma-key green with a bottom bar) and **Dusk Landscape** (a picture background). Built-in themes can't be deleted or edited in place, so duplicate one to make your own. The "New theme" menu also offers Plain background, Lower third and Picture background starting points.
- Switching between light and dark mode now fades instead of snapping. It is skipped when your OS asks for reduced motion.

### Fixed
- A fresh install showed "SWORD module error: data dir not found" for StrongsGreek instead of a Bible. The library counted lexicons as a readable Bible. Only a Bible can now be the reading module, and a first launch with no Bible installs the KJV automatically and opens it.
- The presentation top bar ran off the edge of the window at the 900 px minimum width, hiding Help, light/dark and Settings. It now drops its lowest-priority items as the window narrows.
- Dragging past the edge of the window, or a sheet sliding in, could scroll the whole page a few pixels and show a white stripe along the bottom. The page frame no longer scrolls.

## [0.1.30] - 2026-10-07

### Added
- Accent colour presets in Settings → Appearance: indigo (default), blue, teal, green, gold, orange and rose, each with light and dark shades. The choice is saved with your other preferences.
- Double-click a verse or split part in the Live Show verse list to send it to the live output. Strong's lookup on a word moved to Option/Alt-click, or a single click on the number tag that appears above the word on hover.
- Grammatical markers such as the Greek article (G3588) and the Hebrew direct-object marker (H853) no longer appear as Strong's tags. A phrase like "his hand" now offers only its real word.
- `docs/SHORTCUTS.md`: every keyboard shortcut and gesture in the app, with when each is active.

### Fixed
- The Abbott-Smith and Full LSJ tabs showed the article instead of the real word for a phrase like "the Spirit". Whether a number is a grammatical marker is now judged from the bundled Strong's entry for every lexicon.

## [0.1.29] - 2026-10-04

### Added
- The Live Show verse list now scrolls to the verse you select, whether you typed a reference, picked a word-search result, used the arrow keys or chose a queue item. It eases into place instead of jumping, and unfolding a split verse brings its parts into view.

### Fixed
- Text looked cramped with Strong's on. Line height now grows while Strong's is shown, and the dashed underlines sit lower and are softer.
- A Live Show panel could start collapsed if its saved size came from a window that hadn't been laid out yet. Panel sizes are now kept within their limits.

## [0.1.28] - 2026-10-04

### Added
- Light/dark mode toggle in the presentation top bar, next to Settings. It uses the same saved theme setting as Settings.

### Fixed
- Word search returned nothing for words with an apostrophe, such as "king's". Searches now split words the way the index does, and symbols like `-` or `:` in a search can no longer break it. Hyphenated words now match too.
- Split verses lost their Strong's tagging in the Live Show verse list and Preview. Each part now keeps the Strong's numbers, italics and headings of the words it covers.

## [0.1.27] - 2026-10-04

### Added
- Live Show reference bar: one button cycles between verse jump and word search. Word search shows highlighted matches as you type. `Ctrl+L` and `Ctrl+K` focus the two modes.
- A separate Strong's button turns Strong's concordance on or off. It uses the same saved setting as Settings.
- Resizable panels in the Live Show console: the Main Output and Queue column, the Main Output preview, the verse panel and the Preview column. The Ctrl+Q queue drawer can also be resized. Sizes are remembered, and double-clicking a divider resets it.
- Split verses show as one folded row with a `1/N` chip. Click it to unfold the parts. They fold again when you move to another verse.
- Presentation-mode shortcuts that only worked in the reading view: `Ctrl+P` / `Ctrl+N` (chapter), `Ctrl+Up` / `Ctrl+Down` (verse), `Ctrl +/-` and `Ctrl+Alt +/-` (font size), and `Alt+H` (history).

### Changed
- The Main Output panel now shows the real output screen, scaled down, instead of a rough thumbnail. Wrapping, text shrinking and verse parts match the live feed.

### Fixed
- Presentation-mode shortcuts did nothing while a text field had focus, and ignored Cmd on Mac. Ctrl and Cmd shortcuts now work from inside inputs.
- Verse splits in the console disagreed with the output screen. They were measured in physical monitor pixels, so on Retina displays long verses looked like they fit. The console now uses the output window's real size.

## [0.1.26] - 2026-10-04

### Added
- Presentation workspace v2: a top bar (tabs, LIVE / BLACK / CLEAR, Outputs, Themes, Settings) replaces the sidebar.
- Rebuilt Live Show console with a live display preview, service queue and verse list.
- Verse-part splitting, Strong's lookup and quick reference jump in the Live Show console. Console shortcuts restored.
- "Calm Editorial Precision" visual design: flat surfaces, frosted-glass chrome, consistent corner radii, quieter toolbar icons and firmer glass drawers.

### Fixed
- Psalm headings (canonical section titles) now render in bold when "Show Strong's numbers" is on. Every word of a heading carries a Strong's number, and that rendering path skipped the bold styling.

### Changed
- App version now matches the release. Manifests had stayed at 0.1.21 since v0.1.21.

## [0.1.25] - 2026-09-13

### Added
- Canonical section headings, such as Psalm superscriptions, are parsed from OSIS `<title>` and shown in bold.

### Fixed
- A missing space between a Psalm heading and the first line of the verse.

## [0.1.24] - 2026-09-13

### Fixed
- The split popup no longer disappears in the operator console on multi-monitor setups. Splits are now measured against the monitor the presentation is actually on, not always the first monitor.

## [0.1.23] - 2026-09-13

### Fixed
- Long verses such as Esther 8:9 are split into as many parts as they need. Parts are no longer capped at two lines, and the last part is no longer squeezed with the overflow.

## [0.1.22] - 2026-09-13

### Fixed
- Verse splitting only produced parts "a" and "b" for long verses.

## [0.1.21] - 2026-09-13

### Changed
- Verse splitting measures the text in a hidden element sized like the real presentation box, replacing the character-count estimate. It adapts to screen size, font and margins.

## [0.1.20] - 2026-09-13

### Fixed
- The split threshold was too high, so long verses such as John 3:16 were not split.

## [0.1.19] - 2026-09-13

### Added
- Clickable part chips on the operator console, with the active part highlighted.

## [0.1.18] - 2026-09-13

### Fixed
- Restored the three-line target for verse splitting.

## [0.1.17] - 2026-09-06

### Added
- Verse splitting that adapts to the presentation view.
- Ctrl+Up / Ctrl+Down verse navigation.

## [0.1.16] - 2026-08-30

### Added
- Book-scoped search: filter by Old Testament, New Testament or specific books.

## [0.1.15] - 2026-08-30

### Changed
- Presentation sync improvements between the operator console and the output window.

## [0.1.14] - 2026-08-30

### Added
- Verse splitting for long verses.
- Configurable scroll padding.
- Alignment grid.

### Fixed
- Reference label placement.

Earlier releases are not itemized here. See the commit history for details.
