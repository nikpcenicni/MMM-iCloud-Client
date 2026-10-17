# MMM-iCloud-Client

A [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module that signs in to iCloud with your Apple ID and an app-specific password, reads your iCloud Contacts and serves their birthdays as an iCalendar (`.ics`) feed for the default `calendar` module.

The module has no on-screen output. It syncs contacts in the background and serves the feed at `/MMM-iCloud-Client/birthdays.ics`. The first sync starts as soon as MagicMirror starts.

## Installation

```sh
cd ~/MagicMirror/modules
git clone https://github.com/bitte-ein-bit/MMM-iCloud-Client
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
  },
},
```

| Option           | Default             | Description                                       |
| ---------------- | ------------------- | ------------------------------------------------- |
| `username`       | `""`                | Apple ID email address.                           |
| `appPassword`    | `""`                | App-specific password.                            |
| `updateInterval` | `3600000` (1 hour)  | How often to re-sync contacts, in milliseconds. Minimum 5 minutes. |

3. Add the feed to the `calendar` module:

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
    ],
  },
},
```

If MagicMirror runs on a different port, change `8080` to match. The app-specific password never appears in the feed or its URL. The older `/MMM-iCloud-Client/birthdays` path still works.

To open the feed from another device (a browser or calendar app on your network), MagicMirror must accept connections from it: set `address: "0.0.0.0"` and add the device to `ipWhitelist` (or set `ipWhitelist: []`) in `config.js`. With the defaults, only the mirror itself can load the URL.

## The calendar feed

- One all-day event per contact for this year and next year, so the next 12 months are always covered.
- When the birth year is known, the event title includes the age the person turns, for example `Jane Doe (37)`. Birthdays saved without a year show just the name.
- Birthdays on 29 February fall on 28 February in non-leap years.
- If a sync fails, the module keeps serving the last successful result and logs the error.
- Until the first sync finishes, the URL responds with `503 Service Unavailable`. The calendar module retries automatically after about 15 seconds, so birthdays appear shortly after startup.

## Troubleshooting

Check the MagicMirror log (for example `pm2 logs MagicMirror`):

- `synced N birthdays from M address book(s) in Ns`: everything works.
- `Cannot GET /MMM-iCloud-Client/birthdays.ics`: the module's helper did not load. Run `npm install` in the module folder and restart MagicMirror.
- `This device is not allowed to access your mirror`, or the connection is refused: you are opening the URL from another device. See the `address` and `ipWhitelist` note above.
- `iCloud contacts not synced yet`: no sync has succeeded. Look for an error line in the log.
- `iCloud sync failed: Invalid credentials … 401`: the Apple ID or app-specific password is wrong.
- `set both username and appPassword`: one of the options is missing from `config.js`.

## Development

```sh
npm test
```

## Dependencies

- [tsdav](https://www.npmjs.com/package/tsdav): CardDAV client
- [vcard-parser](https://www.npmjs.com/package/vcard-parser): vCard parsing
