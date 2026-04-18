# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Instead, email the maintainer directly at **rvander17@gmail.com** with:

- A short description of the issue.
- Steps to reproduce, or a proof of concept.
- The commit SHA or release tag you observed the issue against.
- Any relevant logs or screenshots (please redact anything sensitive before sending).

You should expect an acknowledgement within 7 days. If the issue is confirmed, a fix will be prioritized and a coordinated disclosure window will be agreed on before any public writeup.

## Scope

VoreVault is a small, self-hosted project. There is no bug bounty, paid triage, or SLA. Security reports are appreciated and handled in good faith, but this is a hobby project and response times reflect that.

In-scope:

- The application code in this repository.
- The default Docker Compose deployment.
- The authentication flow (Discord OAuth, session handling).
- Upload and file-serving paths (path traversal, MIME confusion, content-type smuggling, etc.).

Out of scope:

- Vulnerabilities in third-party dependencies — please report those upstream. We track and update them via Dependabot.
- Issues that require an attacker to already have a valid Discord session with the required guild role (the trust model assumes guild members are trusted).
- Denial of service that requires a non-trivial volume of traffic to trigger.
- Configuration mistakes in self-hosted deployments that aren't caused by the code in this repo (e.g. misconfigured reverse proxies, exposed `.env` files).

## Supported versions

Only the `main` branch and the most recent tagged release are supported. Older versions will not receive security backports.
