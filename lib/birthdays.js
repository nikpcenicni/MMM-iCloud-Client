"use strict";
const crypto = require("node:crypto");
const vCard = require("vcard-parser");

// Apple Contacts stores birthdays entered without a year as 1604-MM-DD.
const APPLE_NO_YEAR = 1604;

function firstEntry(card, field) {
	return card[field] && card[field][0];
}

function unescapeText(value) {
	return String(value)
		.replace(/\\n/gi, " ")
		.replace(/\\([,;\\])/g, "$1")
		.trim();
}

function displayName(card) {
	const fn = firstEntry(card, "fn");
	if (fn && unescapeText(fn.value)) return unescapeText(fn.value);

	const n = firstEntry(card, "n");
	if (!n) return "";
	const [last, given, middle] = Array.isArray(n.value) ? n.value : [n.value];
	return [given, middle, last].filter(Boolean).map(unescapeText).join(" ");
}

// Accepts 1990-05-04, 19900504, 1990-05-04T00:00:00Z, --0504 and --05-04.
function parseBirthday(entry) {
	if (!entry) return null;
	const raw = Array.isArray(entry.value) ? entry.value.join("") : String(entry.value);
	const match = /^(\d{4}|--)-?(\d{2})-?(\d{2})/.exec(raw.trim());
	if (!match) return null;

	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;

	let year = match[1] === "--" ? null : Number(match[1]);
	const omitYear = entry.meta && entry.meta["x-apple-omit-year"];
	if (year === APPLE_NO_YEAR || (omitYear && String(omitYear[0]) === String(year))) {
		year = null;
	}
	return { year, month, day };
}

// Returns { id, name, birthday } for a vCard with a usable birthday, otherwise null.
function birthdayContact(vcardText, fallbackId) {
	let card;
	try {
		card = vCard.parse(vcardText);
	} catch (err) {
		return null;
	}
	const birthday = parseBirthday(firstEntry(card, "bday"));
	if (!birthday) return null;

	const uid = firstEntry(card, "uid");
	return {
		id: uid ? String(uid.value) : fallbackId,
		name: displayName(card) || "Unknown",
		birthday,
	};
}

function pad(number, width = 2) {
	return String(number).padStart(width, "0");
}

function formatDate(date) {
	return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function formatTimestamp(date) {
	return `${formatDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

// Feb 29 birthdays fall on Feb 28 in non-leap years.
function occurrence(birthday, year) {
	const date = new Date(Date.UTC(year, birthday.month - 1, birthday.day));
	if (date.getUTCMonth() !== birthday.month - 1) date.setUTCDate(0);
	return date;
}

function escapeText(value) {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

// RFC 5545 3.1: lines longer than 75 octets are folded with CRLF + space.
function fold(line) {
	const parts = [];
	let current = "";
	let size = 0;
	for (const char of line) {
		const bytes = Buffer.byteLength(char);
		const limit = parts.length === 0 ? 75 : 74;
		if (size + bytes > limit) {
			parts.push(current);
			current = "";
			size = 0;
		}
		current += char;
		size += bytes;
	}
	parts.push(current);
	return parts.join("\r\n ");
}

function eventUid(contactId, year) {
	const hash = crypto.createHash("sha1").update(String(contactId)).digest("hex");
	return `${hash.slice(0, 16)}-${year}@mmm-icloud-client`;
}

// Builds an iCalendar feed with an all-day event for each birthday this year and next year.
function buildCalendar(contacts, now = new Date()) {
	const thisYear = now.getFullYear();
	const stamp = formatTimestamp(now);
	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//MMM-iCloud-Client//Birthdays//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"X-WR-CALNAME:Birthdays",
	];

	const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
	for (const contact of sorted) {
		for (const year of [thisYear, thisYear + 1]) {
			const start = occurrence(contact.birthday, year);
			const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
			const age = contact.birthday.year ? year - contact.birthday.year : 0;
			const summary = age > 0 ? `${contact.name} (${age})` : contact.name;
			lines.push(
				"BEGIN:VEVENT",
				`UID:${eventUid(contact.id, year)}`,
				`DTSTAMP:${stamp}`,
				`DTSTART;VALUE=DATE:${formatDate(start)}`,
				`DTEND;VALUE=DATE:${formatDate(end)}`,
				`SUMMARY:${escapeText(summary)}`,
				"TRANSP:TRANSPARENT",
				"END:VEVENT",
			);
		}
	}

	lines.push("END:VCALENDAR");
	return `${lines.map(fold).join("\r\n")}\r\n`;
}

module.exports = { birthdayContact, buildCalendar, parseBirthday };
