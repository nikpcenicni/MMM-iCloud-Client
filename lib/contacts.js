"use strict";
const vCard = require("vcard-parser");

// Apple Contacts stores dates entered without a year as 1604-MM-DD.
const APPLE_NO_YEAR = 1604;

// vcard-parser lowercases the properties it knows and keeps the case of the rest (X-ABDATE ...).
function entries(card, field) {
	const key = Object.keys(card).find((name) => name.toLowerCase() === field.toLowerCase());
	return key ? card[key] : [];
}

function firstEntry(card, field) {
	return entries(card, field)[0];
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
function parseDate(entry) {
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

// Apple wraps its built-in labels as _$!<Anniversary>!$_; custom labels are plain text.
function cleanLabel(value) {
	const label = unescapeText(value || "");
	const builtIn = /^_\$!<(.*)>!\$_$/.exec(label);
	return builtIn ? builtIn[1] : label;
}

// Anniversaries and other labelled dates (iCloud's X-ABDATE, vCard 4 ANNIVERSARY).
function otherDates(card) {
	const labels = new Map();
	for (const entry of entries(card, "x-ablabel")) {
		if (entry.namespace) labels.set(entry.namespace.toLowerCase(), cleanLabel(entry.value));
	}

	const dates = [];
	for (const entry of entries(card, "anniversary")) {
		const date = parseDate(entry);
		if (date) dates.push({ label: "Anniversary", date });
	}
	for (const entry of entries(card, "x-abdate")) {
		const date = parseDate(entry);
		if (!date) continue;
		const label = (entry.namespace && labels.get(entry.namespace.toLowerCase())) || "Anniversary";
		dates.push({ label, date });
	}
	return dates;
}

function memberUid(value) {
	return String(value).replace(/^urn:uuid:/i, "");
}

/*
 * Parses one iCloud vCard. Returns
 *   { kind: "group", id, name, members: [uid, ...] } for a contact group,
 *   { kind: "contact", id, name, birthday, dates } for a contact with at least one date,
 *   null for anything else.
 */
function parseVCard(vcardText, fallbackId) {
	let card;
	try {
		card = vCard.parse(vcardText);
	} catch (err) {
		return null;
	}
	const uid = firstEntry(card, "uid");
	const id = uid ? String(uid.value) : fallbackId;
	const kind = firstEntry(card, "x-addressbookserver-kind");

	if (kind && String(kind.value).toLowerCase() === "group") {
		return {
			kind: "group",
			id,
			name: displayName(card),
			members: entries(card, "x-addressbookserver-member").map((entry) => memberUid(entry.value)),
		};
	}

	const birthday = parseDate(firstEntry(card, "bday"));
	const dates = otherDates(card);
	if (!birthday && dates.length === 0) return null;
	return { kind: "contact", id, name: displayName(card) || "Unknown", birthday, dates };
}

/*
 * Keeps contacts that belong to at least one of the named groups (case-insensitive).
 * With no group names, every contact is kept. Returns { contacts, missing }, where
 * missing lists the requested group names that do not exist in iCloud.
 */
function filterByGroups(contacts, groups, groupNames) {
	if (!groupNames || groupNames.length === 0) return { contacts, missing: [] };

	const wanted = new Set(groupNames.map((name) => String(name).toLowerCase()));
	const found = groups.filter((group) => wanted.has(group.name.toLowerCase()));
	const members = new Set(found.flatMap((group) => group.members));
	const foundNames = new Set(found.map((group) => group.name.toLowerCase()));
	return {
		contacts: contacts.filter((contact) => members.has(contact.id)),
		missing: groupNames.filter((name) => !foundNames.has(String(name).toLowerCase())),
	};
}

module.exports = { parseVCard, parseDate, filterByGroups };
