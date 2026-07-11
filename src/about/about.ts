// Static credits page — the only dynamic value is the app version, passed via
// the query string so this window needs no preload/IPC surface.
const version = new URLSearchParams(location.search).get("version");
const versionEl = document.getElementById("version");
if (versionEl) {
  versionEl.textContent = version ? `Version ${version}` : "";
}
