/* MagicMirror²
 * Module: MMM-iCloud-Client
 *
 * By Jonathan Vogt https://github.com/bitte-ein-bit
 * MIT Licensed.
 */
"use strict";
const NodeHelper = require("node_helper");
const { createDAVClient } = require("tsdav");
const vCard = require("vcard-parser");
const ical = require("ical-generator");
const Datastore = require("@seald-io/nedb");

function firstVCardValue(card, field) {
	const entry = card[field] && card[field][0];
	return entry ? entry.value : undefined;
}

function contactFromVCard(vcard) {
	const card = vCard.parse(vcard.data);
	const name = firstVCardValue(card, "n");
	const birthdayValue = firstVCardValue(card, "bday");
	const phones = (card.tel || []).map(function (phone) {
		return {
			field: Array.isArray(phone.value) ? phone.value.join("") : phone.value,
			label: phone.meta && phone.meta.type ? phone.meta.type.join(", ") : "",
		};
	});
	const contact = {
		contactId: firstVCardValue(card, "uid") || vcard.url,
		firstName: name && name[1],
		middleName: name && name[2],
		lastName: name && name[0],
		nickName: firstVCardValue(card, "nickname"),
		phones: phones,
	};

	if (birthdayValue !== undefined) {
		const birthday = Array.isArray(birthdayValue)
			? birthdayValue.join("")
			: String(birthdayValue);
		contact.birthday = /^\d{8}$/.test(birthday)
			? `${birthday.slice(0, 4)}-${birthday.slice(4, 6)}-${birthday.slice(6, 8)}`
			: birthday;
	}

	return contact;
}

var phonenumberDB = new Datastore({ timestampData: true });
phonenumberDB.ensureIndex(
	{ fieldName: "createdAt", expireAfterSeconds: 3600 },
	function (err) {},
);
phonenumberDB.ensureIndex(
	{ fieldName: "unique", unique: true },
	function (err) {},
);

var birthdayDB = new Datastore({ timestampData: true });
birthdayDB.ensureIndex(
	{ fieldName: "createdAt", expireAfterSeconds: 3600 },
	function (err) {},
);
birthdayDB.ensureIndex({ fieldName: "unique", unique: true }, function (err) {
	console.log(err);
});

var contactDB = new Datastore({
	filename: `${__dirname}/contacts.db`,
	autoload: true,
	timestampData: true,
});
contactDB.ensureIndex(
	{ fieldName: "createdAt", expireAfterSeconds: 3600 },
	function (err) {},
);

module.exports = NodeHelper.create({
	// Subclass start method.
	start: function () {
		this.started = false;
		console.log(`Starting helper: ${this.name}`);
		this.expressApp.get(`/${this.name}/birthdays`, this.serverBirthdays);
		this.loadDB();
	},

	loadDB: function () {
		console.log("loading Database");
		contactDB.find(
			{ birthday: { $exists: true } },
			function (err, docs) {
				docs.forEach(
					function (contact) {
						this.extractBirthday(contact);
					}.bind(this),
				);
			}.bind(this),
		);
	},
	extractBirthday: function (contact) {
		if (contact.birthday.length === 10) {
			var today = new Date();
			today.setHours(0, 0, 0, 0);
			var birthday = Date.parse(contact.birthday);
			if (birthday == NaN) {
				console.log(
					`${contact.firstName} ${contact.lastName} has invalid birthday: ${contact.birthday}`,
				);
			} else {
				birthday = new Date(contact.birthday);
				birthday.setHours(0, 0, 0, 0);
				var nextbirthday = new Date(contact.birthday);
				nextbirthday.setHours(0, 0, 0, 0);
				nextbirthday.setFullYear(today.getFullYear());
				if (today > nextbirthday) {
					nextbirthday.setFullYear(today.getFullYear() + 1);
					if (birthday.getFullYear() === 1604) {
						// Only Day is entered
						birthday.setFullYear(today.getFullYear() + 1);
					}
				}
				if (birthday.getFullYear() === 1604) {
					// Only Day is entered
					birthday.setFullYear(today.getFullYear());
				}
				var diff = nextbirthday.getTime() - today.getTime();
				var days = Math.floor(diff / (1000 * 60 * 60 * 24));
				var age = nextbirthday.getFullYear() - birthday.getFullYear();
				var unique = `birthday-${contact.contactId}`;
				var info = {
					unique: unique,
					diffdays: days,
					age: age,
					nextbirthday: nextbirthday,
					birthday: birthday,
					firstName: contact.firstName,
					middleName: contact.middleName,
					lastName: contact.lastName,
				};
				birthdayDB.update({ unique: unique }, info, { upsert: true });
				//console.log("added bday for: " + contact.firstName + ' ' + contact.lastName + ' ' + contact.birthday);
			}
		} else {
			console.log(
				`${contact.firstName} ${contact.lastName} has invalid birthday: ${contact.birthday}`,
			);
		}
	},

	extractPhoneNumber: function (contact) {
		contact.phones.forEach(
			function (number) {
				var sanenumber = this.sanatizePhoneNumber(number.field);
				//console.log(sanenumber + " added for " + contact.firstName);
				var info = {
					unique: sanenumber,
					number: sanenumber,
					label: number.label,
					firstName: contact.firstName,
					middleName: contact.middleName,
					lastName: contact.lastName,
					nickName: contact.nickName,
				};
				phonenumberDB.update({ unique: sanenumber }, info, { upsert: true });
			}.bind(this),
		);
	},

	serverBirthdays: function (req, res) {
		var cal = ical({ domain: "localhost", name: "birthdays" });
		birthdayDB
			.find({})
			.sort({ diffdays: 1 })
			.exec(function (err, docs) {
				docs.forEach(function (contact) {
					var name = "";
					var birthday = "";
					if (contact.firstName !== undefined) {
						name = contact.firstName;
					}
					if (contact.middleName !== undefined) {
						name += ` ${contact.middleName}`;
					}
					if (contact.lastName !== undefined) {
						name += ` ${contact.lastName}`;
					}
					name = name.trim();
					if (contact.age > 0) {
						birthday = ` (${contact.age})`;
					}
					var end = new Date(contact.nextbirthday);
					end.setHours(23, 59, 59, 0);
					cal.createEvent({
						start: contact.nextbirthday,
						end: end,
						//allDay: true,
						//floating: true,
						summary: name + birthday,
					});
					//console.log(contact.firstName + " " + contact.lastName + " has birthday in " + contact.diffdays + " days and turns " + contact.age);
				});
				console.log("Serving iCal");
				cal.serve(res);
			});
	},

	loadiCloud: async function () {
		if (!this.config.username || !this.config.appPassword) {
			console.error(
				"iCloud sync requires both username and appPassword in the module config.",
			);
			return;
		}

		console.log("syncing iCloud contacts via CardDAV");
		contactDB.find(
			{ phones: { $exists: true } },
			function (err, docs) {
				docs.forEach(
					function (contact) {
						this.extractPhoneNumber(contact);
					}.bind(this),
				);
			}.bind(this),
		);
		try {
			const client = await createDAVClient({
				serverUrl: "https://contacts.icloud.com",
				credentials: {
					username: this.config.username,
					password: this.config.appPassword,
				},
				authMethod: "Basic",
				defaultAccountType: "carddav",
			});
			const addressBooks = await client.fetchAddressBooks();
			const vCardsByAddressBook = await Promise.all(
				addressBooks.map(function (addressBook) {
					return client.fetchVCards({ addressBook: addressBook });
				}),
			);
			const contacts = vCardsByAddressBook
				.flat()
				.filter(function (vcard) {
					return typeof vcard.data === "string";
				})
				.map(contactFromVCard);

			for (const contact of contacts) {
				await new Promise(function (resolve, reject) {
					contactDB.update(
						{ contactId: contact.contactId },
						contact,
						{ upsert: true },
						function (err) {
							if (err) return reject(err);
							if (contact.birthday) this.extractBirthday(contact);
							if (contact.phones.length) this.extractPhoneNumber(contact);
							resolve();
						}.bind(this),
					);
				}.bind(this));
			}

			contactDB.persistence.compactDatafile();
			contactDB.count({}, function (err, count) {
				if (err) return console.error("Failed to count synced contacts:", err);
				console.log(`Loaded ${count} Contacts`);
			});
		} catch (err) {
			console.error("iCloud CardDAV contact sync failed:", err.message || err);
		}
	},

	sanatizePhoneNumber: function (number) {
		return number
			.replace(/[^+0-9]+/gi, "")
			.replace(/^00/, "+");
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "CONFIG") {
			this.config = payload;
			if (!this.started) {
				console.log(`Received config for ${this.name}`);
				this.started = true;
				this.loadiCloud();
				this.intervalID = setInterval(
					function () {
						this.loadiCloud();
					}.bind(this),
					3500000,
				);
			}
		}
		if (notification === "PHONE_LOOKUP") {
			console.log(
				`Requested Lookup for ${this.sanatizePhoneNumber(payload.number)}`,
			);
			phonenumberDB
				.find({ number: this.sanatizePhoneNumber(payload.number) })
				.limit(1)
				.exec(
					function (err, docs) {
						console.log(docs);
						var name = "Unknown Caller";
						var label = "";
						var resolved = false;
						docs.forEach(function (contact) {
							name = "";
							resolved = true;
							label = contact.label;
							if (contact.firstName !== undefined) {
								name = contact.firstName;
							}
							if (contact.middleName !== undefined) {
								name += ` ${contact.middleName}`;
							}
							if (contact.lastName !== undefined) {
								name += ` ${contact.lastName}`;
							}
							if (contact.nickName !== undefined) {
								name = `${contact.nickName} (${name})`;
							}
						});
						// Always send results
						var info = {
							name: name,
							label: label,
							number: this.sanatizePhoneNumber(payload.number),
							request: payload.number,
							original_sender: payload.sender,
							reason: payload.reason,
							resolved: resolved,
						};
						this.sendSocketNotification("PHONE_LOOKUP_RESULT", info);
					}.bind(this),
				);
		}
	},
});
