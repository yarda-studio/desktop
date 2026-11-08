# To do

Work that is planned but not started. Newest decisions first.

## Windows code signing

**Status:** not started. Mac signing is wired and waits for the Apple secrets; the setup is written up in [APPLE_SIGNING_SETUP.md](APPLE_SIGNING_SETUP.md) and the release steps in [RELEASING.md](RELEASING.md). Windows builds are unsigned, so SmartScreen warns on download.

Certificate authorities now put new code-signing keys on hardware, so a plain `.pfx` is no longer an option. Choose between Microsoft's cloud signing service (cheapest, signs from CI) and a certificate authority's cloud signing, then add a signing step to `build.yml` for the Windows job. Check current price and whether your country and entity type qualify before choosing.

## Dependency advisories (zip 4 inside the updater)

**Status:** known and ignored in `.cargo/audit.toml` (2026-11-07). The Dependency audit job passes only because of that list; any new advisory still fails it. The quick-xml advisories and our own zip dependency were fixed on 2026-11-07 (quick-xml 0.41, zip 9).

| Crate | Advisories | Why it is not fixed yet | Real exposure |
|---|---|---|---|
| `zip` 4.6.1 (only via `tauri-plugin-updater`) | RUSTSEC-2026-0367, -0368, -0369, -0429 (up to critical) | The updater plugin still depends on zip 4; 2.12.0 does too, and 2.14.1 does not build with our current setup | None we can see: every one is in `ZipArchive::extract`, which our code never calls, and the updater only unpacks updates signed with our key |

Re-check on each Dependabot update of `tauri-plugin-updater` (`cargo tree -i zip@4.6.1`); when zip 4 is gone, delete the four IDs from `.cargo/audit.toml` and this section.

### zip 9 migration notes (done)
- `ZipFile::name()` now returns a `Result` (it fails on a name that is not valid text). The backup restore skips such an entry, the EasyWorship reader treats it as not `main.db`, and the module installer logs the raw name.

### quick-xml: how entities are read (for anyone touching an XML parser)
- quick-xml 0.37+ reports `&amp;`, `&quot;` and `&#8217;` as separate `Event::GeneralRef` events, not inside `Event::Text`. A parser that reads only `Text` **loses them with no error**, and one that trims each `Text` also loses the spaces beside them.
- All five parsers (`markup/osis.rs`, `markup/thml.rs`, `songs/import.rs`, `songs/foreign/opensong.rs`, `songs/foreign/propresenter.rs`) go through `markup/xml_text.rs`: `TextRun` joins the text and references between two tags, and `reference()` / `text()` decode one event. Each parser has a test with `&amp;`, `&#8217;` and quotes.
- An unknown entity (such as `&nbsp;`) or an invalid character reference is dropped and the text around it is kept. Before the upgrade, OSIS and ThML dropped the whole text node.
- Attribute values (ProPresenter) use `Attribute::normalized_value`, which also decodes entities.

## Native NDI output

**Status:** parked (decided not to start yet, 2026-10-25). Nothing is built.

**Goal:** send the live output as an NDI stream that vMix, OBS, Wirecast and NDI Studio Monitor can pick up directly, with no browser source in between.

**What exists today instead**
- Web outputs (Outputs → Video mixer): the output, a transparent output and the stage display as web pages for an OBS Browser Source or vMix web input. See `src-tauri/src/remote/output.rs`.
- NDI without new code: OBS Browser Source plus the DistroAV (NDI) plugin, or NDI Tools' screen capture pointed at the output window.

### Approach (recommended)

Capture the output window with each operating system's capture API and send the frames through the NDI runtime, which is loaded when needed.

| Approach | Verdict |
|---|---|
| Webview snapshot APIs (macOS `takeSnapshot`, WebView2 `CapturePreview`) | Rejected: too slow for smooth video, and video/WebGL can come out black |
| **OS window capture** (Windows Graphics Capture, macOS ScreenCaptureKit, Linux PipeWire) | **Chosen:** exact pixels, including video backgrounds and the countdown |
| Embedded offscreen browser (CEF) | Rejected: 150 MB or more, and a second renderer to maintain |
| Redraw slides natively in Rust | Rejected: duplicates all rendering and drifts from the screen |

### Pieces and estimates

| Piece | Estimate |
|---|---|
| NDI wrapper on `libloading` (initialise, create sender, send frame, destroy) plus a test sender | 3–4 days |
| Windows capture | 5–8 days |
| macOS capture, including the Screen Recording permission prompt | 4–6 days |
| Settings UI, status, "NDI runtime missing" help, NDI link in the UI | 2 days |
| Testing in NDI Studio Monitor, OBS and vMix on real hardware, including long runs | 3–5 days |
| **Total, Windows and macOS** | **about 4–6 weeks** |

A Windows-only first version is roughly 1.5–2 weeks. Linux is extra.

### NDI licensing and bindings
- The NDI SDK is free to use in free or commercial apps (https://docs.ndi.video/docs/sdk/software-distribution). Required: a link to ndi.video wherever NDI is selected in the app, on the website and in the docs. Do not put "NDI" in the product name without following NDI's brand guidelines.
- The runtime can be bundled (the terms must be covered by our EULA and the bundled version kept current), or users can install NDI Tools and we link them to the download. Recommended: rely on the user's install.
- No Rust crate does everything we need:
  - `grafton-ndi` can send video but links at build time, so the app would not start without NDI installed.
  - `ndi-sdk` loads at run time but does not send yet.
  - Write our own small wrapper on `libloading`.

### Known limits
- The output window must stay rendered (not minimised), and the NDI frame size is that window's size.
- No transparency over NDI: window capture is opaque. Keying stays with the transparent web output or the chroma-key Lower Third theme.
- 30 fps is realistic; 60 fps depends on the machine.
- No audio is sent.
- We would own three capture APIs and NDI runtime updates.

### Decisions needed before starting
1. Which platforms first? Suggested: Windows, then macOS.
2. Rely on the user's NDI runtime, or bundle it? Suggested: rely on the user's install.
3. Is an opaque NDI feed enough, given the transparent web output exists?

### Suggested first step
A 2-day Windows-only prototype: capture the output window with Windows Graphics Capture and send it with the `libloading` wrapper, behind a setting. Check it in NDI Studio Monitor and vMix before committing to the full plan.
