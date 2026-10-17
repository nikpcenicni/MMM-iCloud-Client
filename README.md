# MMM-iCloud-Client

A [MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module that signs in to iCloud with your Apple ID and an app-specific password, reads your iCloud Contacts and serves their birthdays as an iCalendar (`.ics`) feed for the default `calendar` module.

The module has no on-screen output. It syncs contacts in the background and serves the feed at `/MMM-iCloud-Client/birthdays`.

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
        url: "http://localhost:8080/MMM-iCloud-Client/birthdays",
      },
    ],
  },
},
```

If MagicMirror runs on a different port, change `8080` to match. Any other calendar app on your network can subscribe to the same URL with the MagicMirror host's address. The app-specific password never appears in the feed or its URL.

## The calendar feed

- One all-day event per contact for this year and next year, so the next 12 months are always covered.
- When the birth year is known, the event title includes the age the person turns, for example `Jane Doe (37)`. Birthdays saved without a year show just the name.
- Birthdays on 29 February fall on 28 February in non-leap years.
- If a sync fails, the module keeps serving the last successful result and logs the error. After a restart, the first request waits up to 30 seconds for the initial sync.

## Troubleshooting

Check the MagicMirror log (for example `pm2 logs MagicMirror`):

- `synced N birthdays from M address book(s)`: everything works.
- `iCloud sync failed: Invalid credentials … 401`: the Apple ID or app-specific password is wrong.
- `set both username and appPassword`: one of the options is missing from `config.js`.

## Development

```sh
npm test
```

## Dependencies

- [tsdav](https://www.npmjs.com/package/tsdav): CardDAV client
- [vcard-parser](https://www.npmjs.com/package/vcard-parser): vCard parsing
