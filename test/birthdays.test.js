"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { birthdayContact, buildCalendar, parseBirthday } = require("../lib/birthdays");

function vcard(...lines) {
	return ["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD"].join("\r\n");
}

test("parses common birthday formats", () => {
	assert.deepEqual(parseBirthday({ value: "1990-05-04" }), { year: 1990, month: 5, day: 4 });
	assert.deepEqual(parseBirthday({ value: "19900504" }), { year: 1990, month: 5, day: 4 });
	assert.deepEqual(parseBirthday({ value: "1990-05-04T00:00:00Z" }), { year: 1990, month: 5, day: 4 });
	assert.deepEqual(parseBirthday({ value: "--0504" }), { year: null, month: 5, day: 4 });
	assert.deepEqual(parseBirthday({ value: "--05-04" }), { year: null, month: 5, day: 4 });
	assert.equal(parseBirthday({ value: "not a date" }), null);
	assert.equal(parseBirthday({ value: "1990-13-04" }), null);
});

test("treats Apple's 1604 placeholder as no year", () => {
	const entry = { value: "1604-05-04", meta: { "x-apple-omit-year": ["1604"] } };
	assert.deepEqual(parseBirthday(entry), { year: null, month: 5, day: 4 });
});

test("extracts contact from an iCloud vCard", () => {
	const contact = birthdayContact(
		vcard(
			"PRODID:-//Apple Inc.//iOS 18//EN",
			"N:Doe;Jane;Q;;",
			"FN:Jane Doe",
			"BDAY:1990-05-04",
			"UID:abc-123",
		),
		"/fallback.vcf",
	);
	assert.deepEqual(contact, {
		id: "abc-123",
		name: "Jane Doe",
		birthday: { year: 1990, month: 5, day: 4 },
	});
});

test("builds the name from N when FN is missing and falls back to the URL id", () => {
	const contact = birthdayContact(vcard("N:Doe;Jane;Q;;", "BDAY:--0504"), "/x.vcf");
	assert.equal(contact.name, "Jane Q Doe");
	assert.equal(contact.id, "/x.vcf");
});

test("skips contacts without a birthday", () => {
	assert.equal(birthdayContact(vcard("FN:No Birthday"), "/x.vcf"), null);
});

test("builds all-day events for this year and next with ages", () => {
	const ics = buildCalendar(
		[
			{ id: "1", name: "Jane Doe", birthday: { year: 1990, month: 5, day: 4 } },
			{ id: "2", name: "Smith, John", birthday: { year: null, month: 12, day: 31 } },
		],
		new Date("2026-10-17T12:00:00Z"),
	);
	assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
	assert.match(ics, /END:VCALENDAR\r\n$/);
	assert.equal(ics.match(/BEGIN:VEVENT/g).length, 4);
	assert.match(ics, /DTSTART;VALUE=DATE:20270504\r\nDTEND;VALUE=DATE:20270505\r\nSUMMARY:Jane Doe \(37\)/);
	assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\nSUMMARY:Smith\\, John\r\n/);
	assert.ok(!/\n(?!\r)/.test(ics.replace(/\r\n/g, "")), "uses CRLF line endings only");
});

test("moves Feb 29 to Feb 28 in non-leap years", () => {
	const ics = buildCalendar(
		[{ id: "1", name: "Leap", birthday: { year: 2000, month: 2, day: 29 } }],
		new Date("2027-01-01T12:00:00Z"),
	);
	assert.match(ics, /DTSTART;VALUE=DATE:20270228/);
	assert.match(ics, /DTSTART;VALUE=DATE:20280229/);
});

test("folds long lines at 75 octets", () => {
	const ics = buildCalendar(
		[{ id: "1", name: "Ä".repeat(60), birthday: { year: null, month: 1, day: 1 } }],
		new Date("2026-06-01T00:00:00Z"),
	);
	for (const line of ics.split("\r\n")) {
		assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
	}
	assert.match(ics, /SUMMARY:Ä+\r\n Ä+/);
});
