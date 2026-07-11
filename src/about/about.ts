// Static credits page — the only dynamic value is the app version, passed via
// the query string so this window needs no preload/IPC surface. `#version`
// is static markup and about-window.ts always supplies the query param, so
// both are guaranteed present.
const version = new URLSearchParams(location.search).get("version");
document.getElementById("version")!.textContent = `Version ${version}`;
