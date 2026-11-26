# Alerts

The app has no server side. Alerts come from a check that runs on the phone: it reads `/server`,
`/certificates`, `/emails` and the backup operations of the last seven days from every saved
server and compares them with the thresholds in *Settings*.

| Alert | Default | Severity |
|---|---|---|
| Certificate expires within N days | 14 days | warning, critical under 3 days |
| Certificate expired | always | critical |
| Disk or inodes used | 85 % | warning, critical from 95 % |
| Memory used | 90 % | warning, critical from 95 % |
| Service port offline (`ports` of `/server`) | on | critical |
| Mailbox full (only mailboxes with a limit) | 90 % | warning, critical at 100 % |
| Latest backup of a client and repository failed | on | warning |

A notification is sent once per problem: the ids of the previous check are kept, and only new
ones notify. A problem that goes away and comes back notifies again.

## Background checks

On Android and iOS the check runs as a background task (`expo-background-task`, which uses
WorkManager on Android and BGTaskScheduler on iOS), asked for every 60 minutes. The key is read
from the keychain/keystore with "after first unlock" access, so the check works while the phone is
locked.

Limits:

- **iOS decides when a background task runs.** It learns from how often the app is used; runs
  can be hours apart, may not happen at all in Low Power Mode, and stop after the app is
  force-quit from the app switcher until it is opened again. The setting is a request, not a
  schedule.
- **Android** runs the task at the earliest after the interval (minimum 15 minutes); Doze and
  manufacturer battery savers can delay it further. Some vendors stop background work for apps
  that are not opened for a while.
- Background tasks do not run in Expo Go; a development or release build is needed.
- The web version has no background checks and no notifications; the *Alerts* tab checks by
  hand and whenever it is opened.

For alerts that must arrive within minutes, a push relay next to the panel (a small service that
polls the API and sends pushes) would be needed; it is not part of this app.
