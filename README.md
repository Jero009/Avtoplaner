# Autoplaner

Autoplaner is a personal calendar for Android and the web. It combines local
events, Google Calendar data, and school information from eAsistent in one
offline-capable application.

The application is planned with React, TypeScript, Vite, Capacitor, SQLite,
and a PWA build. Data is stored locally; there is no Autoplaner backend.

## Status

The repository currently contains the initial SQLite schema and project
scaffold. eAsistent and Google integrations are not enabled yet. The technical
spikes in [`docs/spikes.md`](docs/spikes.md) must be completed before those
integrations are implemented.

Pre-development prerequisites and their status are tracked in
[`docs/pre-development.md`](docs/pre-development.md).

## eAsistent implementation reference

The selected reference repository is
[`chocoearly44/JEA`](https://github.com/chocoearly44/JEA).

It was selected because it is an eAsistent API client with an **MIT license**
and a Java/Android focus, which is the closest match for Autoplaner’s primary
Android platform. It is a research reference for understanding authentication
and data retrieval only. Autoplaner does **not** copy JEA source code, bundle
JEA, or depend on its Maven artifact.

The following alternatives were reviewed:

- [`jakobkordez/easistent_client`](https://github.com/jakobkordez/easistent_client):
  MIT licensed, but Flutter-specific.
- [`umalavasic/eAUrnik`](https://github.com/umalavasic/eAUrnik):
  MIT licensed, but exposes timetable scraping through a separate Python
  server and does not cover the required Android integration.

The eAsistent integration will be implemented independently in
`src/integrations/easistent/`, using the project’s existing sync and SQLite
boundaries. It must fail gracefully and retain cached data when the unofficial
service changes or is unavailable.

## License and attribution

Original Autoplaner source code is licensed under the MIT License; see
[`LICENSE`](LICENSE).

The selected JEA repository is separately licensed under the MIT License.
Its copyright and permission notice are preserved in
[`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md). If code from JEA is ever
copied into this repository, the complete notice must remain with the copied
code and the change must be recorded there.

“eAsistent” is a trademark of eŠola d.o.o. Autoplaner is an independent
personal project and is not affiliated with or endorsed by eŠola d.o.o.
Access to eAsistent must comply with its terms and applicable law.

## Development

See [`requirements.md`](requirements.md) for the full product requirements and
roadmap. Database migrations are in `src/db/migrations/` and are applied in
numeric order. Timestamps are stored as UTC ISO-8601 strings.
