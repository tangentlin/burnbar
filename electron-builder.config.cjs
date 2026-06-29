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
//
// With none set, the .dmg/.zip are produced unsigned — fine for local dev,
// but Gatekeeper will block them on a second Mac.

const hasSigningCreds = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const hasNotaryCreds = Boolean(
  process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID,
);

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
  mac: {
    category: "public.app-category.productivity",
    icon: "build/icons/icon.png",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    // undefined → electron-builder auto-discovers the Developer ID identity
    // (or uses CSC_LINK); null → signing is explicitly skipped.
    identity: hasSigningCreds ? undefined : null,
    notarize: hasNotaryCreds,
    extendInfo: { LSUIElement: true },
    target: [
      { target: "dmg", arch: ["x64", "arm64"] },
      { target: "zip", arch: ["x64", "arm64"] },
    ],
  },
  dmg: {
    contents: [
      { x: 410, y: 150, type: "link", path: "/Applications" },
      { x: 130, y: 150, type: "file" },
    ],
  },
};
