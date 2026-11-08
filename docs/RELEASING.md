# Releasing

Pushing a tag that starts with `v` runs `.github/workflows/build.yml`: it syncs the public repo, builds Mac and Windows, and **publishes** the release on `yarda-studio/desktop`, where the in-app updater reads `latest.json`. Check the version in `src-tauri/tauri.conf.json` and the changelog first.

## What a release builds

| Platform | Output | Signed? |
|---|---|---|
| macOS | one universal app (Apple Silicon and Intel), as `.dmg` and updater `.app.tar.gz` | Yes, once the Apple secrets below exist. Without them the build is ad-hoc signed and Gatekeeper warns users: do not ship it. |
| Windows | NSIS `.exe` and `.msi` | **Not yet.** SmartScreen warns on download. |

The updater files (`.sig`, `latest.json`) are signed with `TAURI_SIGNING_PRIVATE_KEY`, which is already set. That is separate from Apple and Windows code signing.

## One-time Mac setup

The step-by-step guide, with a checklist, is [APPLE_SIGNING_SETUP.md](APPLE_SIGNING_SETUP.md). In short: join the Apple Developer Program, create a **Developer ID Application** certificate and export it as a `.p12`, make an app-specific password, find your Team ID, and add these as **repository secrets** on `yarda-studio/yarda`. Never commit them or paste them into a chat.

| Secret | Value |
|---|---|
| `APPLE_CERTIFICATE` | the base64 of the `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password |
| `APPLE_SIGNING_IDENTITY` | the certificate name, e.g. `Developer ID Application: Your Name (TEAMID)` |
| `APPLE_ID` | the Apple ID email |
| `APPLE_PASSWORD` | the app-specific password |
| `APPLE_TEAM_ID` | the Team ID |

The workflow only turns signing on when `APPLE_CERTIFICATE` is set.

## What the build checks

With the Apple secrets set, a step after the build checks the Mac app and fails the job when:
- `codesign --verify` rejects the signature,
- `spctl --assess` says Gatekeeper would refuse it,
- `stapler validate` finds no notarization ticket,
- the app is missing the Apple Silicon or the Intel code.

The release is already published when that step runs, so a red job there means: take the release down and fix it.

## First signed release

Do not go straight to a real version. Run the Build workflow by hand (Actions → Build → Run workflow). A manual run makes a **draft** release, which the updater cannot see, whereas a pushed `v*` tag publishes at once. Check the job is green, download the `.dmg` from the draft on a Mac that has never run the app, and open it: there should be no "unidentified developer" warning. Then delete the draft on `yarda-studio/desktop`. Details are in [APPLE_SIGNING_SETUP.md](APPLE_SIGNING_SETUP.md#7-test-with-a-draft-build).

This draft behaviour is in `build.yml` but has not run yet either.

Also test the update path once: install the previous signed build, publish the new one, and check the app offers and installs it.

## Not done yet

- Windows code signing (needs a certificate or a cloud signing service).
- Hardened runtime is on, with no entitlements. If the signed app misbehaves in a way the unsigned one did not (a blocked microphone, a blocked helper), an entitlements file is the first thing to look at.
