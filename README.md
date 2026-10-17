# MMM-iCloud-Client

This an extension for the [MagicMirror²](https://github.com/MichMich/MagicMirror). It provides a iCloud client which will show upcomming birthdays using the iCloud addressbook.

Future versions will also provides an addressbook for [MMM-FRITZ-Box-Callmonitor](https://github.com/paviro/MMM-FRITZ-Box-Callmonitor).

## Installation

1. Navigate into your MagicMirror's `modules` folder.
2. Clone repository with `git clone https://github.com/bitte-ein-bit/MMM-iCloud-Client`.
3. Navigate into MMM-iCloud-Client.
4. Execute `npm install` to install the dependencies.

## Usage

The entry in the `module array` in your `config.js` can look like the following.

Create an app-specific password from your Apple Account's **Sign-In and Security → App-Specific Passwords** page. Use that password here, not your regular Apple Account password.

```js
{
 module: 'MMM-iCloud-Client',
 config: {
  username: "appleID",
  appPassword: "xxxx-xxxx-xxxx-xxxx",
 }
},
```

To use the birthday calendar add the following to your calendar module config.

```js
{
 symbol: 'birthday-cake',
 url: 'http://localhost:8080/MMM-iCloud-Client/birthdays',
}
```

The module serves this birthday calendar feed locally at `/MMM-iCloud-Client/birthdays`. If your calendar client runs on another device, replace `localhost:8080` with the MagicMirror host and port. The app-specific password is only used by the module to read iCloud Contacts; do not put it in the calendar URL.

This module requires Node.js 18 or newer.

Phone numbers are normalized by removing punctuation and converting a leading `00` to `+`. No country prefix is added, so local-number formats in the contact and caller data must match.

## Install as an MMPM custom package

Register this GitHub repository with MMPM, then install the registered package:

```sh
mmpm custom-pkg add \
    -t "MMM-iCloud-Client" \
    -a "Jonathan Vogt" \
    -r "https://github.com/bitte-ein-bit/MMM-iCloud-Client" \
    -d "iCloud contacts, phone lookup, and birthday calendar for MagicMirror"
mmpm add MMM-iCloud-Client
```

The custom-package entry is stored in your local MMPM database. It does not publish the module to a shared MMPM catalog.

## Dependencies

- [ical-generator](https://www.npmjs.com/package/ical-generator) (installed by `npm install`)
- [tsdav](https://www.npmjs.com/package/tsdav) (installed by `npm install`)
- [vcard-parser](https://www.npmjs.com/package/vcard-parser) (installed by `npm install`)
- [@seald-io/nedb](https://www.npmjs.com/package/@seald-io/nedb) (installed by `npm install`)
