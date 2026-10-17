/* MagicMirror²
 * Module: MMM-iCloud-Client
 *
 * By Jonathan Vogt https://github.com/bitte-ein-bit
 * MIT Licensed.
 */
"use strict";
const NodeHelper = require("node_helper");
const { createDAVClient } = require("tsdav");
const { birthdayContact, buildCalendar } = require("./lib/birthdays");

const ICLOUD_CARDDAV_URL = "https://contacts.icloud.com";
const DEFAULT_UPDATE_INTERVAL = 60 * 60 * 1000;
const MIN_UPDATE_INTERVAL = 5 * 60 * 1000;

module.exports = NodeHelper.create({
	start: function () {
		console.log(`Starting helper: ${this.name}`);
		this.config = null;
		// null until the first sync succeeds, so the feed can tell "not ready" from "no birthdays".
		this.contacts = null;
		this.syncing = false;
		this.lastError = null;
		this.expressApp.get(
			[`/${this.name}/birthdays.ics`, `/${this.name}/birthdays`],
			(_req, res) => this.serveCalendar(res),
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
		this.config = config;
		if (!config.username || !config.appPassword) {
			this.lastError = "username or appPassword is missing from the MMM-iCloud-Client config";
			console.error(`${this.name}: ${this.lastError}`);
			return;
		}
		console.log(`${this.name}: syncing iCloud contacts for ${config.username}`);

		this.sync();
		this.timer = setInterval(
			() => this.sync(),
			Math.max(Number(config.updateInterval) || DEFAULT_UPDATE_INTERVAL, MIN_UPDATE_INTERVAL),
		);
	},

	sync: async function () {
		if (this.syncing) return;
		this.syncing = true;
		const startedAt = Date.now();
		try {
			const client = await createDAVClient({
				serverUrl: ICLOUD_CARDDAV_URL,
				credentials: {
					username: this.config.username,
					password: this.config.appPassword,
				},
				authMethod: "Basic",
				defaultAccountType: "carddav",
			});
			const addressBooks = await client.fetchAddressBooks();

			const contactsById = new Map();
			for (const addressBook of addressBooks) {
				const vcards = await client.fetchVCards({ addressBook });
				for (const vcard of vcards) {
					if (typeof vcard.data !== "string") continue;
					const contact = birthdayContact(vcard.data, vcard.url);
					if (contact) contactsById.set(contact.id, contact);
				}
			}

			this.contacts = [...contactsById.values()];
			this.lastError = null;
			console.log(
				`${this.name}: synced ${this.contacts.length} birthdays from ${addressBooks.length} address book(s) in ${Math.round((Date.now() - startedAt) / 1000)}s`,
			);
		} catch (err) {
			// Keep serving the last successful sync.
			this.lastError = `iCloud sync failed: ${err.message || err}`;
			console.error(`${this.name}: ${this.lastError}`);
		} finally {
			this.syncing = false;
		}
	},

	serveCalendar: function (res) {
		if (this.contacts === null) {
			// The calendar module retries 5xx responses with a short backoff (15s, 30s, 60s ...).
			let reason = "Waiting for credentials: add username and appPassword to the MMM-iCloud-Client config";
			if (this.syncing) reason = "iCloud contact sync in progress";
			else if (this.lastError) reason = this.lastError;
			res.set("Retry-After", "15");
			res.status(503).type("text/plain").send(reason);
			return;
		}
		res.set("Content-Type", "text/calendar; charset=utf-8");
		res.send(buildCalendar(this.contacts));
	},
});
