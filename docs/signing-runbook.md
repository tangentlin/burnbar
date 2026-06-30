# Burnbar — macOS Signing & Notarization Runbook

Agent-followable guide to producing a signed, notarized, stapled DMG that passes Gatekeeper on any Mac.

## Prerequisites

- macOS Monterey (12) or later on the build machine.
- A paid **Apple Developer Program** account.
- `pnpm` and all project dependencies installed (`pnpm install`).
- Xcode Command Line Tools (`xcode-select --install`).

---

## Phase 1 — Create and export the Developer ID Application certificate

> Skip to Phase 2 if you already have a `.p12` and know your Team ID.

### 1a. Generate a Certificate Signing Request (CSR)

1. Open **Keychain Access** (`/Applications/Utilities/Keychain Access.app`).
2. Menu: **Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority…**
3. Fill in:
   - **User Email Address**: your Apple ID email.
   - **Common Name**: a label, e.g. `Burnbar Developer ID`.
   - **CA Email Address**: leave blank.
   - **Request is**: select **Saved to disk**.
4. Click **Continue** and save the `.certSigningRequest` file somewhere outside the repo (e.g. `~/certs/burnbar.certSigningRequest`).

### 1b. Issue the certificate on developer.apple.com

1. Go to <https://developer.apple.com/account/resources/certificates/list>.
2. Click **+** (Add Certificate).
3. Under **Software**, select **Developer ID Application** → **Continue**.
4. Upload the `.certSigningRequest` file from step 1a → **Continue**.
5. Download the resulting `developerID_application.cer` file.

### 1c. Import the certificate into your login keychain

```bash
# Double-click the .cer file in Finder, or run:
open developerID_application.cer
# Keychain Access opens and asks which keychain — choose "login".
```

Verify it imported:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
# Expected output (one or more lines):
#   1) ABCDEF1234... "Developer ID Application: Your Name (TEAMID)"
```

### 1d. Export the identity as a .p12

1. In **Keychain Access**, open the **login** keychain, filter by **Certificates**.
2. Find the **Developer ID Application: Your Name (TEAMID)** entry.
3. Right-click → **Export "Developer ID Application: …"**.
4. Choose format **Personal Information Exchange (.p12)**.
5. Save to a location **outside the repo** (e.g. `~/certs/DeveloperID-Application.p12`).
6. Set a strong export password. Record it — you need it as `CSC_KEY_PASSWORD`.

---

## Phase 2 — Gather the remaining credentials

### 2a. App-specific password

1. Go to <https://appleid.apple.com> and sign in.
2. Under **Sign-In and Security → App-Specific Passwords**, click **Generate an App-Specific Password**.
3. Label it (e.g. `burnbar-notarytool`) and copy the `xxxx-xxxx-xxxx-xxxx` password.

### 2b. Team ID

1. Go to <https://developer.apple.com/account> → **Membership details**.
2. Copy the **Team ID** (10-character alphanumeric string).

---

## Phase 3 — Set environment variables

```bash
# Point at your .p12 (Option A — recommended)
export CSC_LINK="/path/to/DeveloperID-Application.p12"
export CSC_KEY_PASSWORD="your-p12-export-password"

# If the identity is already in the login keychain, use Option B instead:
# export CSC_NAME="Developer ID Application: Your Name (TEAMID)"

# Notarization
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="YOURTEAMID"
```

See `.env.example` at the repo root for a copy-paste template.

---

## Phase 4 — Build

```bash
pnpm dist:mac
```

This runs `pnpm build` (tsc + esbuild renderer) then `electron-builder --mac`, which:

1. Signs each binary with the Developer ID identity under hardened runtime.
2. Submits the app to Apple's notary service (`notarytool submit --wait`).
3. Staples the notarization ticket to each `.dmg` and `.zip` artifact.

Artifacts land in `release/`:

```
release/
  Burnbar-X.X.X-arm64.dmg      ← arm64 (Apple Silicon)
  Burnbar-X.X.X-arm64-mac.zip  ← arm64 ZIP
```

---

## Phase 5 — Verify

Run all three checks; all must pass before distributing.

### 5a. Code signature

```bash
codesign -dv --verbose=4 "release/mac/Burnbar.app"
# Look for:
#   Authority=Developer ID Application: Your Name (TEAMID)
#   flags=runtime  ← hardened runtime
```

### 5b. Gatekeeper / notarization

```bash
spctl -a -t exec -vvv "release/mac/Burnbar.app"
# Expected:
#   release/mac/Burnbar.app: accepted
#   source=Notarized Developer ID
```

### 5c. Stapling

```bash
xcrun stapler validate "release/Burnbar-X.X.X.dmg"
xcrun stapler validate "release/Burnbar-X.X.X-arm64.dmg"
# Expected:  The validate action worked!
```

### 5d. Quarantine simulation

This tests the exact Gatekeeper path a user would hit when downloading the DMG.

```bash
# Copy the arm64 DMG to /tmp, apply a quarantine xattr, then open it
cp "release/Burnbar-X.X.X-arm64.dmg" /tmp/Burnbar-test.dmg
xattr -w com.apple.quarantine "0083;$(printf '%x' $(date +%s));Safari;00000000-0000-0000-0000-000000000000" /tmp/Burnbar-test.dmg
open /tmp/Burnbar-test.dmg
# Expected: DMG mounts and Burnbar.app opens with no Gatekeeper prompt.
```

---

## Debug builds (local attach with lldb/Instruments)

Use `pnpm dist:mac:debug` instead. This picks `build/entitlements.mac.debug.plist`, which keeps `cs.debugger` and `get-task-allow`. **These entitlements block notarization — never use this script for a release build.**

```bash
export CSC_LINK="..."
export CSC_KEY_PASSWORD="..."
# Do NOT set APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD — notarization is skipped
pnpm dist:mac:debug
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `no identity found` | CSC_LINK path wrong, or cert not imported | `security find-identity -v -p codesigning` to list identities |
| `Error: get-task-allow` rejected by notary | Debug plist used for release build | Use `pnpm dist:mac`, not `pnpm dist:mac:debug` |
| `Error ITMS-4302: Invalid entitlements` | Other forbidden entitlement present | Diff the plist against the Electron-required set in `build/entitlements.mac.plist` |
| Notarization hangs > 15 min | Apple servers backlogged | Wait; `notarytool` retries automatically with `--wait` |
| `spctl` says `rejected` | Stapling not done, or not notarized | Re-run `pnpm dist:mac` with all five env vars set |
| Gatekeeper prompt on quarantined DMG | Notarization ticket missing or staple failed | Check step 5b and 5c; re-notarize if needed |

---

## Secrets discipline

- **Never** commit the `.p12`, any password, or an `.env` file with real values.
- `CSC_LINK` / `CSC_KEY_PASSWORD` / `APPLE_APP_SPECIFIC_PASSWORD` are build-time only — they are not embedded in the app.
- For CI (Phase 2), store them as encrypted secrets in the CI provider.
