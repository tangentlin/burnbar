# Security Policy

## Supported versions

Burnbar ships as a single rolling release — only the latest published version
is supported. There's no LTS branch; please update before reporting.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a security vulnerability.

Instead, use GitHub's private reporting: go to the
[Security tab](https://github.com/tangentlin/burnbar/security) →
**Report a vulnerability**. This opens a private advisory visible only to you
and the maintainer, and lets us coordinate a fix before any public disclosure.

Please include:

- A description of the issue and its potential impact
- Steps to reproduce (or a PoC, if applicable)
- The Burnbar version and macOS version you tested on

## Scope

Burnbar is a local menu bar app: it shells out to a bundled `ccusage` CLI to
read local agent-CLI logs, stores numbers-only usage history under the app's
`userData` directory, and checks GitHub for signed update releases every 4
hours. It makes no other network calls and transmits no usage data off-device.
Reports involving any of that surface — the update mechanism, the archive's
file handling, or the ccusage subprocess invocation — are in scope.
