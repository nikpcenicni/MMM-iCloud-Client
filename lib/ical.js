"use strict";
const crypto = require("node:crypto");

const DAY = 24 * 60 * 60 * 1000;

function pad(number, width = 2) {
	return String(number).padStart(width, "0");
}

function formatDate(date) {
	return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function formatTimestamp(date) {
	return `${formatDate(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

// Feb 29 falls on Feb 28 in non-leap years.
function occurrence(date, year) {
	const result = new Date(Date.UTC(year, date.month - 1, date.day));
	if (result.getUTCMonth() !== date.month - 1) result.setUTCDate(0);
	return result;
}

function escapeText(value) {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r\n|\r|\n/g, "\\n");
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

function header(name, product) {
	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		`PRODID:-//MMM-iCloud-Client//${product}//EN`,
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		`X-WR-CALNAME:${escapeText(name)}`,
	];
}

function finish(lines) {
	lines.push("END:VCALENDAR");
	return `${lines.map(fold).join("\r\n")}\r\n`;
}

function eventUid(key, year) {
	const hash = crypto.createHash("sha1").update(String(key)).digest("hex");
	return `${hash.slice(0, 16)}-${year}@mmm-icloud-client`;
}

/*
 * Builds a feed with an all-day event for each yearly date, this year and next year.
 * Each item is { key, date: { year, month, day }, title }; when the year is known the
 * number of years is added to the title, for example "Jane Doe (37)".
 */
function buildYearlyCalendar(items, name, now = new Date()) {
	const thisYear = now.getFullYear();
	const stamp = formatTimestamp(now);
	const lines = header(name, name);

	const sorted = [...items].sort((a, b) => a.title.localeCompare(b.title));
	for (const item of sorted) {
		for (const year of [thisYear, thisYear + 1]) {
			const start = occurrence(item.date, year);
			const end = new Date(start.getTime() + DAY);
			const years = item.date.year ? year - item.date.year : 0;
			const summary = years > 0 ? `${item.title} (${years})` : item.title;
			lines.push(
				"BEGIN:VEVENT",
				`UID:${eventUid(item.key, year)}`,
				`DTSTAMP:${stamp}`,
				`DTSTART;VALUE=DATE:${formatDate(start)}`,
				`DTEND;VALUE=DATE:${formatDate(end)}`,
				`SUMMARY:${escapeText(summary)}`,
				"TRANSP:TRANSPARENT",
				"END:VEVENT",
			);
		}
	}
	return finish(lines);
}

function buildBirthdayCalendar(contacts, now) {
	const items = contacts
		.filter((contact) => contact.birthday)
		.map((contact) => ({ key: contact.id, date: contact.birthday, title: contact.name }));
	return buildYearlyCalendar(items, "Birthdays", now);
}

function buildAnniversaryCalendar(contacts, now) {
	const items = contacts.flatMap((contact) =>
		contact.dates.map((entry, index) => ({
			key: `${contact.id}#${index}#${entry.label}`,
			date: entry.date,
			title: `${contact.name} – ${entry.label}`,
		})),
	);
	return buildYearlyCalendar(items, "Anniversaries", now);
}

// Splits an iCalendar object into its top-level components (VEVENT, VTIMEZONE, ...), keeping
// their lines exactly as received. Folded continuation lines start with a space, so they never
// look like BEGIN/END lines.
function components(icsText) {
	const result = [];
	let depth = 0;
	let current = null;
	for (const line of String(icsText).split(/\r?\n/)) {
		if (line === "") continue;
		const begin = /^BEGIN:([A-Z0-9-]+)$/i.exec(line);
		const end = /^END:([A-Z0-9-]+)$/i.exec(line);
		if (begin) {
			depth++;
			if (depth === 2) current = { type: begin[1].toUpperCase(), lines: [] };
		}
		if (current) current.lines.push(line);
		if (end) {
			if (depth === 2 && current) {
				result.push(current);
				current = null;
			}
			depth--;
		}
	}
	return result;
}

// Combines the calendar objects of one CalDAV calendar into a single feed. Time zone
// definitions shared by several objects are included once.
function mergeCalendarObjects(objects, name) {
	const lines = header(name, "Calendar").map(fold);
	const timezones = new Set();
	for (const object of objects) {
		for (const component of components(object)) {
			if (component.type === "VTIMEZONE") {
				const tzid = component.lines.find((line) => /^TZID[:;]/i.test(line)) || "";
				if (timezones.has(tzid)) continue;
				timezones.add(tzid);
			} else if (component.type !== "VEVENT") {
				continue;
			}
			lines.push(...component.lines);
		}
	}
	lines.push("END:VCALENDAR");
	// Received lines are already folded, so they are joined as they are.
	return `${lines.join("\r\n")}\r\n`;
}

function slugify(name) {
	return (
		String(name)
			.normalize("NFKD")
			.replace(/[̀-ͯ]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "calendar"
	);
}

module.exports = {
	buildBirthdayCalendar,
	buildAnniversaryCalendar,
	mergeCalendarObjects,
	slugify,
	fold,
};
