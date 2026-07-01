// electron-builder configuration.
//
// Signing and notarization are driven by environment variables so that local
// and CI builds without credentials still succeed (unsigned), while a build
// with credentials present produces a signed + notarized artifact that passes
// Gatekeeper on other Macs.
//
//   Signing       — set CSC_LINK (path or base64 of a Developer ID .p12) plus
//                   CSC_KEY_PASSWORD, or CSC_NAME for an identity already in
//                   the login keychain.
//   Notarization  — set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
//                   (notarytool reads these from the environment).
//   Debug build   — set DEBUG_ENTITLEMENTS=1 (via `pnpm dist:mac:debug`) to use
//                   build/entitlements.mac.debug.plist, which keeps cs.debugger
//                   and get-task-allow so lldb/Instruments can attach locally.
//                   Never use the debug plist for a notarized release build.
//
// With no signing vars set, the .dmg/.zip are produced unsigned — fine for
// local dev, but Gatekeeper will block them on a second Mac.

const hasSigningCreds = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const hasNotaryCreds = Boolean(
  process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID,
);
const entitlementsFile = process.env.DEBUG_ENTITLEMENTS
  ? "build/entitlements.mac.debug.plist"
  : "build/entitlements.mac.plist";

// release.yml only ever runs on `push: tags: v*`, so GITHUB_REF_NAME is the tag
// (e.g. "v0.2.0" or "v0.2.0-rc1"). A hyphen after the version marks a pre-release
// tag — mirrors the release.yml/gh CLI convention this replaces. Falls back to
// "draft" (electron-builder's own default) for a manual/local `--publish` run
// with no tag in the environment.
const releaseTag = process.env.GITHUB_REF_NAME ?? "";
const releaseType = releaseTag.includes("-") ? "prerelease" : "draft";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.tangentlin.burnbar",
  productName: "Burnbar",
  directories: { output: "release" },
  // Ship the compiled app, assets, and runtime deps — but never the source maps.
  // tsc/esbuild still emit `.map` files for local debugging; the `!**/*.map`
  // negation keeps them out of the distributable (smaller artifact, no source
  // structure exposed in shipped builds).
  files: ["dist/**/*", "assets/**/*", "node_modules/**/*", "package.json", "!**/*.map"],
  // ccusage's cli.js chmod's and exec's a platform-specific native binary it
  // resolves relative to its own location. Files inside .asar are not real
  // filesystem paths, so chmod/exec fail with ENOTDIR. Unpack BOTH ccusage
  // (so cli.js loads from disk and its relative resolution lands on the
  // unpacked binary) and @ccusage (the native binary itself) beside the .asar.
  // capture.ts redirects the spawn to this unpacked copy.
  asarUnpack: ["node_modules/ccusage/**", "node_modules/@ccusage/**"],
  mac: {
    category: "public.app-category.productivity",
    icon: "build/icons/icon.png",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    // undefined → electron-builder auto-discovers the Developer ID identity
    // (or uses CSC_LINK); null → signing is explicitly skipped.
    identity: hasSigningCreds ? undefined : null,
    notarize: hasNotaryCreds,
    entitlements: entitlementsFile,
    entitlementsInherit: entitlementsFile,
    extendInfo: { LSUIElement: true },
    // arm64-only: ccusage ships per-arch native binaries, and the release
    // runner only installs the host arch's @ccusage package, so an x64 artifact
    // would ship without its binary. Apple Silicon is the only supported target.
    target: [
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] },
    ],
  },
  dmg: {
    contents: [
      { x: 410, y: 150, type: "link", path: "/Applications" },
      { x: 130, y: 150, type: "file" },
    ],
  },
  // GitHub Releases doubles as electron-updater's feed: publishing here also
  // emits latest-mac.yml (the update manifest) alongside the dmg/zip — see
  // ADR-011 and docs/features/release-distribution.md. owner/repo are explicit
  // because package.json has no `repository` field for electron-builder to
  // infer from.
  publish: {
    provider: "github",
    owner: "tangentlin",
    repo: "burnbar",
    releaseType,
  },
};
