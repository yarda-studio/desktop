# Apple signing setup (do this once, when you are ready)

Nothing here is needed to develop or test the app. It is only needed to ship a Mac build that opens without the "unidentified developer" warning. The release workflow (`.github/workflows/build.yml`) is already wired for it and waits for the secrets below. For how a release works once this is done, see [RELEASING.md](RELEASING.md).

**Time and cost:** about $99 a year, plus Apple's approval time (usually a day or two for an individual, longer for an organisation). The steps after approval take about 30 minutes.

**Rules**
- Only you do these steps. Never paste a certificate, a password or an app-specific password into a chat, an issue or a commit.
- The secrets go into GitHub's secret store and nowhere else.

## Checklist

- [ ] 1. Enrol in the Apple Developer Program
- [ ] 2. Create a Developer ID Application certificate
- [ ] 3. Export it as a `.p12` file
- [ ] 4. Create an app-specific password
- [ ] 5. Find your Team ID
- [ ] 6. Add the six secrets to GitHub
- [ ] 7. Test with a draft build
- [ ] 8. Test the update path

## 1. Enrol

1. Go to https://developer.apple.com/programs/enroll/ and sign in with the Apple ID you want to own the app's signing.
2. Choose **Individual** (your name appears on the "verified developer" prompt) or **Organization** (the company name appears; Apple asks for a D-U-N-S number, which is free but takes days to get).
3. Pay the yearly fee and wait for the approval email.

Pick the one you want users to see. Changing it later means a new certificate and a new Team ID.

## 2. Create the certificate

You need a **Developer ID Application** certificate (not "Apple Development" or "Mac App Store"). Only the account holder can create it.

Easiest way, with Xcode installed:
1. Xcode → Settings → Accounts → select your team → **Manage Certificates**.
2. Click **+** and choose **Developer ID Application**.

Without Xcode:
1. Keychain Access → Certificate Assistant → **Request a Certificate from a Certificate Authority**. Enter your email, choose **Saved to disk**, and save the `.certSigningRequest` file.
2. At https://developer.apple.com/account/resources/certificates/add choose **Developer ID Application**, upload that file, and download the `.cer`.
3. Double-click the `.cer` to install it in your login keychain. It must be on the same Mac that made the request.

## 3. Export the `.p12`

1. Keychain Access → **login** keychain → **My Certificates**.
2. Find **Developer ID Application: Your Name (TEAMID)**. Expand it: a private key must sit underneath. If there is no key, this is the wrong Mac.
3. Right-click the certificate → **Export** → format **Personal Information Exchange (.p12)**. Choose a strong password and remember it: this is `APPLE_CERTIFICATE_PASSWORD`.
4. Put the file somewhere outside the repo, for example `~/Desktop/yarda-cert.p12`.

Get the exact certificate name (this is `APPLE_SIGNING_IDENTITY`):

```bash
security find-identity -v -p codesigning
```

Copy the part in quotes that starts with `Developer ID Application:`.

## 4. App-specific password

Notarization signs in with your Apple ID but needs a password made just for it.

1. Go to https://account.apple.com → **Sign-In and Security** → **App-Specific Passwords**.
2. Create one named `yarda-notarization` and copy it once. This is `APPLE_PASSWORD`.

## 5. Team ID

At https://developer.apple.com/account → **Membership details**, copy the 10-character **Team ID**. This is `APPLE_TEAM_ID`. It is also the part in brackets in the certificate name.

## 6. Add the secrets

Add these as **repository secrets** on `yarda-studio/yarda` (Settings → Secrets and variables → Actions → New repository secret). If you use the `gh` command line tool, these commands read the values from a file or prompt for them, so they never appear on screen:

| Secret | Value | How |
|---|---|---|
| `APPLE_CERTIFICATE` | the `.p12` as base64 | `base64 -i ~/Desktop/yarda-cert.p12 \| gh secret set APPLE_CERTIFICATE --repo yarda-studio/yarda` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` password | `gh secret set APPLE_CERTIFICATE_PASSWORD --repo yarda-studio/yarda` (it prompts) |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Your Name (TEAMID)` | `gh secret set APPLE_SIGNING_IDENTITY --repo yarda-studio/yarda` (it prompts) |
| `APPLE_ID` | your Apple ID email | `gh secret set APPLE_ID --repo yarda-studio/yarda` (it prompts) |
| `APPLE_PASSWORD` | the app-specific password | `gh secret set APPLE_PASSWORD --repo yarda-studio/yarda` (it prompts) |
| `APPLE_TEAM_ID` | the Team ID | `gh secret set APPLE_TEAM_ID --repo yarda-studio/yarda` (it prompts) |

Then delete the `.p12` from your Desktop, or keep one copy in a password manager. Losing it is not a disaster (you can make a new certificate) but you must not leave it lying around.

The workflow turns signing on only when `APPLE_CERTIFICATE` is set. Until then it builds an ad-hoc signed app and prints a warning.

## 7. Test with a draft build

A manual run of the Build workflow creates a **draft** release. Drafts are invisible to the in-app updater, which only reads the latest published release. A pushed `v*` tag, by contrast, publishes straight away.

1. GitHub → Actions → **Build** → **Run workflow** (on the branch you want to test).
2. Wait for the Mac job. The step **Verify macOS signature and notarization** must be green. It checks the signature, Gatekeeper, the notarization ticket and that the app holds both Apple Silicon and Intel code.
3. Open the draft release on `yarda-studio/desktop`, download the `.dmg`, and open it on a Mac that has never run the app. You should see no "unidentified developer" warning.
4. Delete the draft.

If the verify step fails, read its log first. The usual causes are a wrong `APPLE_SIGNING_IDENTITY` (it must match the certificate name exactly), a `.p12` exported without its private key, or an app-specific password typed wrongly.

If the signed app behaves differently from the unsigned one (a blocked microphone, a helper that will not start), the first suspect is hardened runtime, which is on with no entitlements. Add an entitlements file for just what is blocked.

## 8. Test the update path

Once a signed version is published, install it, publish the next version, and check the app offers and installs it. Do this once before relying on it.

## Cost and renewal

- The membership renews yearly. If it lapses, existing signed apps keep working, but you cannot notarize new builds.
- The certificate lasts five years. Add a reminder for a month before it ends: when it expires, repeat steps 2–3 and replace the two certificate secrets.
