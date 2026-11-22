# MMM-iCloud-Client

A [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module that signs in to iCloud with your Apple ID and an app-specific password and serves your iCloud data as iCalendar (`.ics`) feeds for the default `calendar` module:

- **Birthdays** from iCloud Contacts
- **Anniversaries and other dates** from iCloud Contacts (for example "Anniversary" or a custom "Gotcha Day")
- **Private iCloud calendars**, without having to make them public in iCloud

The module has no on-screen output. It syncs in the background and the first sync starts as soon as MagicMirror starts.

| Feed                | URL                                               |
| ------------------- | ------------------------------------------------- |
| Birthdays           | `/MMM-iCloud-Client/birthdays.ics`                |
| Anniversaries       | `/MMM-iCloud-Client/anniversaries.ics`            |
| Each chosen calendar | `/MMM-iCloud-Client/calendars/<calendar-name>.ics` |

## Installation

```sh
cd ~/MagicMirror/modules
git clone https://github.com/nikpcenicni/MMM-iCloud-Client
cd MMM-iCloud-Client
npm install
```

Requires Node.js 18 or newer.

## Configuration

1. Create an app-specific password at [account.apple.com](https://account.apple.com) under **Sign-In and Security → App-Specific Passwords**. Your regular Apple Account password will not work.
2. Add the module to `config/config.js`:

```js
{
  module: "MMM-iCloud-Client",
  config: {
    username: "you@icloud.com",       // your Apple ID email
    appPassword: "xxxx-xxxx-xxxx-xxxx",
    groups: ["Family"],               // optional: only contacts in these groups
    calendars: ["Home", "Kids"],      // optional: private calendars to serve
    feedToken: "a-long-random-string", // optional: require ?token=… on every feed
  },
},
```

| Option           | Default             | Description |
| ---------------- | ------------------- | ----------- |
| `username`       | `""`                | Apple ID email address. |
| `appPassword`    | `""`                | App-specific password. |
| `updateInterval` | `3600000` (1 hour)  | How often to re-sync, in milliseconds. Minimum 5 minutes. |
| `groups`         | `[]`                | Names of iCloud contact groups. When set, the birthday and anniversary feeds only include contacts in at least one of these groups. Empty means all contacts. |
| `calendars`      | `[]`                | Names of iCloud calendars to serve, as shown in the Calendar app. Empty means no calendars are fetched. |
| `feedToken`      | `""`                | When set, every feed requires this token, as `?token=…` in the URL or an `Authorization: Bearer …` header. Requests without it get `401 Unauthorized`. Empty means no token is needed. |

Group and calendar names are not case-sensitive. If a name doesn't match, the log lists the names that exist (see [Troubleshooting](#troubleshooting)).

3. Add the feeds to the `calendar` module:

```js
{
  module: "calendar",
  position: "top_left",
  config: {
    calendars: [
      {
        symbol: "birthday-cake",
        url: "http://localhost:8080/MMM-iCloud-Client/birthdays.ics",
      },
      {
        symbol: "heart",
        url: "http://localhost:8080/MMM-iCloud-Client/anniversaries.ics",
      },
      {
        symbol: "house",
        url: "http://localhost:8080/MMM-iCloud-Client/calendars/home.ics",
      },
    ],
  },
},
```

If MagicMirror runs on a different port, change `8080` to match. If you set `feedToken`, add it to each URL, for example `http://localhost:8080/MMM-iCloud-Client/birthdays.ics?token=a-long-random-string`. The app-specific password never appears in any feed or URL. The older `/MMM-iCloud-Client/birthdays` path still works.

## Security

- **Who can read the feeds.** With MagicMirror's default `address` and `ipWhitelist`, only the mirror itself can load the feeds. To open them from another device (a browser or calendar app on your network), set `address: "0.0.0.0"` and add the device to `ipWhitelist` (or set `ipWhitelist: []`) in `config.js`. Anyone who can then reach the mirror can read your birthdays, anniversaries and private calendars, so also set `feedToken` to a long random string (for example the output of `openssl rand -hex 24`).
- **Your app-specific password reaches the browser.** MagicMirror sends each module's config, including `appPassword` and `feedToken`, to the mirror page. Any device that can load the mirror page can read them. Keep `ipWhitelist` tight, and use MagicMirror's secret handling if your version has it.
- **Limited access.** An app-specific password can read your contacts, calendars and mail, but can't change your Apple ID. If it leaks, revoke it at [account.apple.com](https://account.apple.com) and create a new one.

## The feeds

### Birthdays and anniversaries

- One all-day event per date for this year and next year, so the next 12 months are always covered.
- When the year is known, the title includes the number of years, for example `Jane Doe (37)` or `Jane Doe – Anniversary (10)`. Dates saved without a year show just the name (and label).
- The anniversary feed contains every extra date saved on a contact (**add date** in Contacts), with its label: `Anniversary`, `Other` or your own custom label.
- Dates on 29 February fall on 28 February in non-leap years.

### Calendars

- Each calendar listed in `calendars` gets its own feed. The URL uses the calendar name in lowercase, with spaces and punctuation replaced by `-`. For example, `Kids' Activities` becomes `/MMM-iCloud-Client/calendars/kids-activities.ics`. The log prints the exact URLs after every sync.
- The feed contains the events from the last month to a year ahead. Recurring events include their full recurrence rule, so the `calendar` module shows every occurrence.
- Only event calendars are supported. iCloud Reminders are not available through the app-specific password interface.

### When a sync fails

- The module keeps serving the last successful result and logs the error.
- Until the first sync finishes, the feeds respond with `503 Service Unavailable`. The calendar module retries automatically after about 15 seconds, so events appear shortly after startup.

## Troubleshooting

Check the MagicMirror log (for example `pm2 logs MagicMirror`):

- `synced N birthdays and M anniversaries/dates from … address book(s)`: contacts work.
- `synced N calendar object(s) from M calendar(s) … : /MMM-iCloud-Client/calendars/….ics`: calendars work. Use the URLs printed here.
- `contact group(s) not found in iCloud: … Available groups: …`: a name in `groups` doesn't match. Copy one of the listed names.
- `calendar(s) not found in iCloud: … Available calendars: …`: a name in `calendars` doesn't match. Copy one of the listed names.
- `Unknown calendar "…"` when opening a calendar URL: the URL doesn't match a synced calendar. The response lists the available ones.
- `Missing or wrong feed token` (`401`): `feedToken` is set and the URL doesn't include it, or includes a different value. Add `?token=…` to the URL.
- `Cannot GET /MMM-iCloud-Client/birthdays.ics`: the module's helper did not load. Run `npm install` in the module folder and restart MagicMirror.
- `This device is not allowed to access your mirror`, or the connection is refused: you are opening the URL from another device. See [Security](#security).
- `iCloud contact sync failed: Invalid credentials … 401` (or `calendar sync failed`): the Apple ID or app-specific password is wrong.
- `username or appPassword is missing`: one of the options is missing from `config.js`.

## Development

```sh
npm test
```

## Dependencies

- [tsdav](https://www.npmjs.com/package/tsdav): CardDAV and CalDAV client
- [vcard-parser](https://www.npmjs.com/package/vcard-parser): vCard parsing

## License

MIT. Originally created by Jonathan Vogt. See [LICENSE](LICENSE).
