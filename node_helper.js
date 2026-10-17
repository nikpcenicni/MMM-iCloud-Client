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
const MIN_UPDATE_INTERVAL = 5 * 60 * 1000;
// How long a calendar request waits for the first sync before serving what it has.
const FIRST_SYNC_WAIT = 30 * 1000;

module.exports = NodeHelper.create({
	start: function () {
		console.log(`Starting helper: ${this.name}`);
		this.config = null;
		this.contacts = [];
		this.syncing = false;
		this.firstSync = new Promise((resolve) => {
			this.resolveFirstSync = resolve;
		});
		this.expressApp.get(`/${this.name}/birthdays`, (_req, res) => {
			this.serveCalendar(res);
		});
	},

	stop: function () {
		clearInterval(this.timer);
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification !== "CONFIG" || this.config) return;
		this.config = payload;

		if (!payload.username || !payload.appPassword) {
			console.error(`${this.name}: set both username and appPassword in config.js.`);
			this.resolveFirstSync();
			return;
		}

		this.sync();
		this.timer = setInterval(
			() => this.sync(),
			Math.max(Number(payload.updateInterval) || 0, MIN_UPDATE_INTERVAL),
		);
	},

	sync: async function () {
		if (this.syncing) return;
		this.syncing = true;
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
			console.log(
				`${this.name}: synced ${this.contacts.length} birthdays from ${addressBooks.length} address book(s)`,
			);
		} catch (err) {
			// Keep serving the last successful sync.
			console.error(`${this.name}: iCloud sync failed: ${err.message || err}`);
		} finally {
			this.syncing = false;
			this.resolveFirstSync();
		}
	},

	serveCalendar: async function (res) {
		await Promise.race([
			this.firstSync,
			new Promise((resolve) => setTimeout(resolve, FIRST_SYNC_WAIT)),
		]);
		res.set("Content-Type", "text/calendar; charset=utf-8");
		res.send(buildCalendar(this.contacts));
	},
});
