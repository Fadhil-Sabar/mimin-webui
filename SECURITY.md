# Security Policy

## Supported versions

Mimin WebUI is currently pre-1.0. Security fixes are applied to the latest commit on the `main` branch. Older commits and private forks are not supported.

## Reporting a vulnerability

Do not disclose vulnerabilities in a public issue, discussion, pull request, or chat log.

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/Fadhil-Sabar/mimin-webui/security/advisories/new>

Include:

- affected commit or version
- reproduction steps or proof of concept
- expected impact
- suggested mitigation, if known
- whether the issue is already public

If private vulnerability reporting is unavailable, open a public issue containing no exploit details and ask the maintainer for a private contact channel.

You should receive an acknowledgement within 7 days. We aim to provide an initial assessment within 14 days, but timing depends on severity and maintainer availability. Please allow a reasonable remediation period before disclosure.

## Deployment responsibilities

Self-hosters are responsible for:

- using unique, high-entropy database, session, encryption, and initial-admin secrets
- terminating TLS at a trusted reverse proxy
- restricting PostgreSQL and storage access
- backing up PostgreSQL and uploaded files
- keeping Node.js, container images, system OCR packages, and dependencies updated
- reviewing outbound provider, search, and fetch origins
- rotating credentials after suspected exposure

See [`docs/deployment.md`](docs/deployment.md) for the production checklist.
