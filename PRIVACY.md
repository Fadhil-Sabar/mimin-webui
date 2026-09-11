# Privacy and Data Handling

Mimin WebUI is self-hosted software. The operator of each deployment controls its data and is responsible for publishing a privacy notice appropriate to its users and jurisdiction. This document describes the software's default data flows; it is not a privacy policy for every deployment.

## Data stored by Mimin

Depending on use, Mimin stores account and session records, projects, conversations, messages, tool-call records, uploaded files, extracted text and OCR results, citations, model preferences, project skills, and encrypted provider credentials in PostgreSQL and the configured storage path.

Provider API keys saved through the UI are encrypted at rest. The encryption secret is controlled by the deployment operator. Losing or rotating it without a migration makes existing encrypted keys unreadable.

## Data sent to third parties

Content may leave the Mimin server when a user or operator enables an external service:

- chat messages, conversation context, project instructions, skills, and attachment excerpts may be sent to the selected AI model provider
- search queries may be sent to Tavily, SearXNG, DuckDuckGo, or another configured search service
- extracted project passages may be sent to the configured embedding provider when semantic indexing is enabled
- browser-tool requests are executed in the user's browser extension after the applicable permission or conversation consent

Each external service applies its own terms and privacy practices. Operators should disclose which services are configured.

## Browser extension

The extension is disabled by default. Permissions and consent limit which pages or tabs can be described or controlled. Mimin does not intentionally read saved passwords, cookies, browsing history, internal browser pages, or private-network pages. Page snapshots and tool results can become part of a conversation and therefore may be stored or sent to the selected model provider.

## Retention and deletion

Data remains until a user or operator deletes it or the underlying database/storage is removed. Deleting a project file removes access to the stored original, but historical citation snapshots may remain in existing messages. Database backups and infrastructure snapshots may retain deleted data until their own retention period expires.

## Telemetry and logs

Mimin WebUI does not include product analytics by default. Application, reverse-proxy, container, database, model-provider, and infrastructure logs may still contain metadata such as timestamps, route names, errors, IP addresses, or request identifiers. Operators must configure log access and retention.

## Operator checklist

Before offering a deployment to other people:

1. publish operator identity and contact details
2. document configured model, search, embedding, and storage providers
3. define retention, backup, deletion, and incident-response practices
4. obtain any consent required by applicable law
5. restrict administrative access and protect all secrets
