/* MagicMirror²
 * Module: MMM-iCloud-Client
 *
 * By Nikholas Pcenicni https://github.com/nikpcenicni/MMM-iCloud-Client
 * MIT Licensed.
 */
"use strict";
const NodeHelper = require("node_helper");
const { createDAVClient } = require("tsdav");
const { parseVCard, filterByGroups } = require("./lib/contacts");
const {
	buildBirthdayCalendar,
	buildAnniversaryCalendar,
	mergeCalendarObjects,
	slugify,
} = require("./lib/ical");

const ICLOUD_CARDDAV_URL = "https://contacts.icloud.com";
const ICLOUD_CALDAV_URL = "https://caldav.icloud.com";
const DEFAULT_UPDATE_INTERVAL = 60 * 60 * 1000;
const MIN_UPDATE_INTERVAL = 5 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
// Calendar events are fetched from this many days ago to this many days ahead.
// Recurring events that overlap the window are returned with their full recurrence rule.
const CALENDAR_DAYS_BEHIND = 31;
const CALENDAR_DAYS_AHEAD = 366;

function calendarName(calendar) {
	return typeof calendar.displayName === "string" && calendar.displayName.trim()
		? calendar.displayName.trim()
		: decodeURIComponent(calendar.url.replace(/\/+$/, "").split("/").pop());
}

module.exports = NodeHelper.create({
	start: function () {
		console.log(`Starting helper: ${this.name}`);
		this.config = null;
		// null until the first sync succeeds, so the feeds can tell "not ready" from "empty".
		this.contacts = null;
		// Map of slug -> { name, ics }; null until the first calendar sync succeeds.
		this.calendars = null;
		this.syncing = false;
		this.contactsError = null;
		this.calendarsError = null;

		// Feeds are plain text or iCalendar; stop browsers from guessing another type.
		this.expressApp.use(`/${this.name}`, (_req, res, next) => {
			res.set("X-Content-Type-Options", "nosniff");
			next();
		});
		this.expressApp.get([`/${this.name}/birthdays.ics`, `/${this.name}/birthdays`], (_req, res) =>
			this.serveContactFeed(res, buildBirthdayCalendar),
		);
		this.expressApp.get(`/${this.name}/anniversaries.ics`, (_req, res) =>
			this.serveContactFeed(res, buildAnniversaryCalendar),
		);
		this.expressApp.get(`/${this.name}/calendars/:file`, (req, res) =>
			this.serveCalendar(req.params.file, res),
		);

		// MagicMirror 2.38+ lets helpers read their config on the server, so the
		// first sync starts at boot instead of waiting for a browser to connect.
		if (typeof this.getServerModuleConfig === "function") {
			const serverConfig = this.getServerModuleConfig();
			if (serverConfig.username || serverConfig.appPassword) {
				this.configure(serverConfig);
			} else {
				console.log(`${this.name}: no credentials in server config yet, waiting for the browser to send them`);
			}
		}
	},

	stop: function () {
		clearInterval(this.timer);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "CONFIG" && !this.config) this.configure(payload);
	},

	configure: function (config) {
		this.config = {
			...config,
			groups: Array.isArray(config.groups) ? config.groups : [],
			calendars: Array.isArray(config.calendars) ? config.calendars : [],
		};
		if (!config.username || !config.appPassword) {
			this.contactsError = "username or appPassword is missing from the MMM-iCloud-Client config";
			this.calendarsError = this.contactsError;
			console.error(`${this.name}: ${this.contactsError}`);
			return;
		}
		console.log(`${this.name}: syncing iCloud data for ${config.username}`);

		this.sync();
		this.timer = setInterval(
			() => this.sync(),
			Math.max(Number(config.updateInterval) || DEFAULT_UPDATE_INTERVAL, MIN_UPDATE_INTERVAL),
		);
	},

	createClient: function (serverUrl, accountType) {
		return createDAVClient({
			serverUrl,
			credentials: {
				username: this.config.username,
				password: this.config.appPassword,
			},
			authMethod: "Basic",
			defaultAccountType: accountType,
		});
	},

	sync: async function () {
		if (this.syncing) return;
		this.syncing = true;
		try {
			await this.syncContacts();
			if (this.config.calendars.length > 0) await this.syncCalendars();
		} finally {
			this.syncing = false;
		}
	},

	syncContacts: async function () {
		const startedAt = Date.now();
		try {
			const client = await this.createClient(ICLOUD_CARDDAV_URL, "carddav");
			const addressBooks = await client.fetchAddressBooks();

			const contactsById = new Map();
			const groups = [];
			for (const addressBook of addressBooks) {
				const vcards = await client.fetchVCards({ addressBook });
				for (const vcard of vcards) {
					if (typeof vcard.data !== "string") continue;
					const parsed = parseVCard(vcard.data, vcard.url);
					if (!parsed) continue;
					if (parsed.kind === "group") groups.push(parsed);
					else contactsById.set(parsed.id, parsed);
				}
			}

			const { contacts, missing } = filterByGroups([...contactsById.values()], groups, this.config.groups);
			if (missing.length > 0) {
				const available = groups.map((group) => group.name).join(", ") || "none";
				console.warn(
					`${this.name}: contact group(s) not found in iCloud: ${missing.join(", ")}. Available groups: ${available}`,
				);
			}

			this.contacts = contacts;
			this.contactsError = null;
			const birthdays = contacts.filter((contact) => contact.birthday).length;
			const otherDates = contacts.reduce((sum, contact) => sum + contact.dates.length, 0);
			console.log(
				`${this.name}: synced ${birthdays} birthdays and ${otherDates} anniversaries/dates from ${addressBooks.length} address book(s) in ${Math.round((Date.now() - startedAt) / 1000)}s`,
			);
		} catch (err) {
			// Keep serving the last successful sync.
			this.contactsError = `iCloud contact sync failed: ${err.message || err}`;
			console.error(`${this.name}: ${this.contactsError}`);
		}
	},

	syncCalendars: async function () {
		const startedAt = Date.now();
		try {
			const client = await this.createClient(ICLOUD_CALDAV_URL, "caldav");
			const all = (await client.fetchCalendars()).filter(
				(calendar) => !calendar.components || calendar.components.includes("VEVENT"),
			);

			const wanted = new Set(this.config.calendars.map((name) => String(name).toLowerCase()));
			const selected = all.filter((calendar) => wanted.has(calendarName(calendar).toLowerCase()));
			const selectedNames = new Set(selected.map((calendar) => calendarName(calendar).toLowerCase()));
			const missing = this.config.calendars.filter((name) => !selectedNames.has(String(name).toLowerCase()));
			if (missing.length > 0) {
				const available = all.map(calendarName).join(", ") || "none";
				console.warn(`${this.name}: calendar(s) not found in iCloud: ${missing.join(", ")}. Available calendars: ${available}`);
			}

			const now = Date.now();
			const timeRange = {
				start: new Date(now - CALENDAR_DAYS_BEHIND * DAY).toISOString(),
				end: new Date(now + CALENDAR_DAYS_AHEAD * DAY).toISOString(),
			};
			const calendars = new Map();
			let events = 0;
			for (const calendar of selected) {
				const name = calendarName(calendar);
				let slug = slugify(name);
				for (let n = 2; calendars.has(slug); n++) slug = `${slugify(name)}-${n}`;

				const objects = await client.fetchCalendarObjects({ calendar, timeRange });
				const data = objects.map((object) => object.data).filter((text) => typeof text === "string");
				events += data.length;
				calendars.set(slug, { name, ics: mergeCalendarObjects(data, name) });
			}

			this.calendars = calendars;
			this.calendarsError = null;
			const urls = [...calendars.keys()].map((slug) => `/${this.name}/calendars/${slug}.ics`);
			console.log(
				`${this.name}: synced ${events} calendar object(s) from ${selected.length} calendar(s) in ${Math.round((Date.now() - startedAt) / 1000)}s${urls.length ? `: ${urls.join(", ")}` : ""}`,
			);
		} catch (err) {
			this.calendarsError = `iCloud calendar sync failed: ${err.message || err}`;
			console.error(`${this.name}: ${this.calendarsError}`);
		}
	},

	// The calendar module retries 5xx responses with a short backoff (15s, 30s, 60s ...).
	notReady: function (res, error, what) {
		let reason = "Waiting for credentials: add username and appPassword to the MMM-iCloud-Client config";
		if (this.syncing) reason = `iCloud ${what} sync in progress`;
		else if (error) reason = error;
		res.set("Retry-After", "15");
		res.status(503).type("text/plain").send(reason);
	},

	serveContactFeed: function (res, build) {
		if (this.contacts === null) {
			this.notReady(res, this.contactsError, "contact");
			return;
		}
		res.set("Content-Type", "text/calendar; charset=utf-8");
		res.send(build(this.contacts));
	},

	serveCalendar: function (file, res) {
		const slug = String(file).replace(/\.ics$/i, "");
		if (this.config && this.config.calendars.length === 0) {
			res.status(404).type("text/plain").send("No calendars configured: add calendar names to the calendars option");
			return;
		}
		if (this.calendars === null) {
			this.notReady(res, this.calendarsError, "calendar");
			return;
		}
		const calendar = this.calendars.get(slug);
		if (!calendar) {
			const available = [...this.calendars.keys()].map((name) => `${name}.ics`).join(", ") || "none";
			res.status(404).type("text/plain").send(`Unknown calendar "${slug}". Available: ${available}`);
			return;
		}
		res.set("Content-Type", "text/calendar; charset=utf-8");
		res.send(calendar.ics);
	},
});
