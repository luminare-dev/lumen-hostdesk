<!-- header:begin: brand-repos 0.1.0, variant studio, files in docs/brand/; the project-page sync drops this block -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/brand/readme-header-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/brand/readme-header-light.svg">
  <img alt="Lumen hostdesk" src="docs/brand/readme-header-light.svg">
</picture>

<!-- byline:studio -->
*a [Luminare Development](https://luminare.tech/open-source/lumen-hostdesk/) open-source project*
<!-- /byline:studio -->
<!-- byline:personal
*by ItsPaulAT · [project page](https://luminare.tech/open-source/lumen-hostdesk/)*
/byline:personal -->

<!-- header:end -->

# lumen-hostdesk

A mobile companion app for KeyHelp server admins: server status, clients, domains, e-mail
accounts, databases and local alerts, over the KeyHelp REST API of your own server. Built with
Expo for Android, iOS and the web, in the Lumen look.

Not affiliated with or endorsed by Keyweb AG. KeyHelp is named only to describe what the app
works with; KeyHelp is a registered trademark of Keyweb AG.

[![ci](https://github.com/luminare-dev/lumen-hostdesk/actions/workflows/ci.yml/badge.svg)](https://github.com/luminare-dev/lumen-hostdesk/actions/workflows/ci.yml)
[![licence](https://img.shields.io/github/license/luminare-dev/lumen-hostdesk)](LICENSE)

<!-- screenshots:begin -->
| Dark | Light |
|---|---|
| ![Server status, dark](docs/screenshots/dashboard-dark.png) | ![Server status, light](docs/screenshots/dashboard-light.png) |
| ![Domains with certificate state, dark](docs/screenshots/domains-dark.png) | ![Domains with certificate state, light](docs/screenshots/domains-light.png) |
| ![Client detail, dark](docs/screenshots/client-dark.png) | ![Client detail, light](docs/screenshots/client-light.png) |
| ![Alerts, dark](docs/screenshots/alerts-dark.png) | ![Alerts, light](docs/screenshots/alerts-light.png) |
| ![Confirmation before a password reset, dark](docs/screenshots/confirm-dark.png) | ![Confirmation before a password reset, light](docs/screenshots/confirm-light.png) |
| ![Settings, dark](docs/screenshots/settings-dark.png) | ![Settings, light](docs/screenshots/settings-light.png) |

Screenshots from CI (the `screenshots` artifact of the `ci` workflow): the web build at phone
size against the mock API, with invented data.
<!-- screenshots:end -->

## Features

- **Connect** your KeyHelp server with its address and an API key (KeyHelp API v2,
  `X-API-Key`). The key is checked before it is saved and is kept only on the device, in the
  system keychain/keystore. Several servers; https only; certificate, key, IP-restriction and
  reachability problems are explained in plain words.
- **Status**: load, disk, memory, swap, inodes, service ports online/offline, updates, mail
  queue, versions.
- **Accounts** with search: clients, domains (with certificate expiry), certificates, e-mail
  accounts (with quota), databases, FTP users, scheduled tasks and backup runs.
- **Actions**: create and edit clients, disable and enable clients and domains, create domains,
  e-mail accounts and databases, reset mailbox passwords. Disruptive actions ask first; passwords
  and names the server generates are shown once and never stored.
- **Deletes and reboot with typed confirmation**: delete clients (the dialog counts the domains,
  mailboxes and databases that go with them), domains, mailboxes and databases, or reboot the
  server; the button stays disabled until the exact name, address or host name is typed.
- **DNS editor** per main domain: list, add, edit and delete A, AAAA, CNAME, MX, TXT, SRV, CAA and
  NS records with checks per type and TTL, edit the SOA, reset to the KeyHelp defaults. NS and
  SOA changes come with a warning.
- **Read-only mode** per server, with a global default: every write action is hidden, a badge
  shows the mode, and the API client refuses writes on its own. Turning it off asks for the
  device's biometrics or code where one is set up.
- **Alerts**: expiring or expired certificates, disk, inodes, memory, offline services, full
  mailboxes and failed backups, with your own thresholds. A background check on Android and iOS
  notifies you of new problems; no server of ours is involved ([limits](docs/alerts.md)).
- **Lumen look** in dark and light, from the shared Lumen design tokens: pick a preset or import a
  token file from any Lumen theme.
- English and German.

The endpoints used, and the ones not used, are listed in [docs/api.md](docs/api.md).

## Security

- The API key is stored with `expo-secure-store` (iOS Keychain, Android Keystore), readable after
  the first unlock so the background check works. It is never written to app storage or logs.
- On the **web** the key lives only in the browser tab's session storage and is gone when the tab
  is closed; the app says so. KeyHelp normally does not send CORS headers, so the web build is
  mainly a preview and the test target.
- Only `https://` addresses are accepted, redirects are refused, and certificate errors are not
  skipped.
- Read-only mode blocks writes in the app, not on the server: for a key that must never change
  anything, rely on the panel's own key permissions as well.
- Create a dedicated API key in KeyHelp (*Configuration → API*) and restrict it to the IP
  addresses you connect from. Treat it like an admin password: with the key and network access,
  the server can be changed.

## Development

Requirements: Node.js 22 (`.nvmrc`), Python 3 for the repository checks.

```bash
npm ci
npm run web          # Expo dev server in the browser
npm run check        # type check, Jest unit tests, web build
npx playwright install chromium
npm run e2e          # Playwright against the web build and the mock API
SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
python3 -m unittest discover -s tests -v   # repository checks
```

- `src/api/`: the typed API client, errors and address handling.
- `src/mock/`: the in-memory mock of the API and its invented fixtures (tests only).
- `src/alerts/`: alert rules, the check of all servers, the background task.
- `src/theme/lumen/`: the shared Lumen token core, a locked copy of
  [lumen-hydrodactyl-theme](https://github.com/luminare-dev/lumen-hydrodactyl-theme)'s
  (`shared.lock`, checked by `scripts/check_shared.py` in CI).
- No real server and no real key are used anywhere in the tests.

Native builds use EAS; what is needed for them is in [docs/builds.md](docs/builds.md).

## Licence

[MIT](LICENSE). The licence covers the code only: the project name, logo, header images
and `docs/brand/` are not licensed (see [NOTICE](NOTICE)).

<!-- byline:studio -->
*a [Luminare Development](https://luminare.tech/open-source/lumen-hostdesk/) open-source project*
<!-- /byline:studio -->
<!-- byline:personal
*by ItsPaulAT · [project page](https://luminare.tech/open-source/lumen-hostdesk/)*
/byline:personal -->
