# To do

Work that is planned but not started. Newest decisions first.

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
