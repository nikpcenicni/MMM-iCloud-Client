"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
	buildBirthdayCalendar,
	buildAnniversaryCalendar,
	mergeCalendarObjects,
	slugify,
} = require("../lib/ical");

function contact(id, name, birthday, dates = []) {
	return { kind: "contact", id, name, birthday, dates };
}

test("builds all-day birthday events for this year and next with ages", () => {
	const ics = buildBirthdayCalendar(
		[
			contact("1", "Jane Doe", { year: 1990, month: 5, day: 4 }),
			contact("2", "Smith, John", { year: null, month: 12, day: 31 }),
			contact("3", "No Birthday", null, [{ label: "Anniversary", date: { year: 2010, month: 1, day: 1 } }]),
		],
		new Date("2026-10-17T12:00:00Z"),
	);
	assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
	assert.match(ics, /X-WR-CALNAME:Birthdays\r\n/);
	assert.match(ics, /END:VCALENDAR\r\n$/);
	assert.equal(ics.match(/BEGIN:VEVENT/g).length, 4);
	assert.match(ics, /DTSTART;VALUE=DATE:20270504\r\nDTEND;VALUE=DATE:20270505\r\nSUMMARY:Jane Doe \(37\)/);
	assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\nSUMMARY:Smith\\, John\r\n/);
	assert.ok(!/\n(?!\r)/.test(ics.replace(/\r\n/g, "")), "uses CRLF line endings only");
});

test("builds anniversary events with labels and years", () => {
	const ics = buildAnniversaryCalendar(
		[
			contact("1", "Jane Doe", { year: 1990, month: 5, day: 4 }, [
				{ label: "Anniversary", date: { year: 2016, month: 6, day: 12 } },
				{ label: "Gotcha Day", date: { year: null, month: 9, day: 1 } },
			]),
		],
		new Date("2026-10-17T12:00:00Z"),
	);
	assert.match(ics, /X-WR-CALNAME:Anniversaries\r\n/);
	assert.equal(ics.match(/BEGIN:VEVENT/g).length, 4);
	assert.match(ics, /SUMMARY:Jane Doe – Anniversary \(10\)\r\n/);
	assert.match(ics, /DTSTART;VALUE=DATE:20270901\r\nDTEND;VALUE=DATE:20270902\r\nSUMMARY:Jane Doe – Gotcha Day\r\n/);
	assert.doesNotMatch(ics, /20270504/);
});

test("escapes every kind of line break so names cannot add properties", () => {
	const ics = buildBirthdayCalendar(
		[contact("1", "Eve\rURL:http://x\nA\r\nB", { year: null, month: 1, day: 1 })],
		new Date("2026-06-01T00:00:00Z"),
	);
	assert.match(ics, /SUMMARY:Eve\\nURL:http:\/\/x\\nA\\nB\r\n/);
	assert.doesNotMatch(ics, /\r(?!\n)/);
	const merged = mergeCalendarObjects([], "Home\rX-EVIL:1");
	assert.match(merged, /X-WR-CALNAME:Home\\nX-EVIL:1\r\n/);
});

test("moves Feb 29 to Feb 28 in non-leap years", () => {
	const ics = buildBirthdayCalendar(
		[contact("1", "Leap", { year: 2000, month: 2, day: 29 })],
		new Date("2027-01-01T12:00:00Z"),
	);
	assert.match(ics, /DTSTART;VALUE=DATE:20270228/);
	assert.match(ics, /DTSTART;VALUE=DATE:20280229/);
});

test("folds long lines at 75 octets", () => {
	const ics = buildBirthdayCalendar(
		[contact("1", "Ä".repeat(60), { year: null, month: 1, day: 1 })],
		new Date("2026-06-01T00:00:00Z"),
	);
	for (const line of ics.split("\r\n")) {
		assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
	}
	assert.match(ics, /SUMMARY:Ä+\r\n Ä+/);
});

const TIMEZONE = [
	"BEGIN:VTIMEZONE",
	"TZID:Europe/Berlin",
	"BEGIN:STANDARD",
	"DTSTART:19701025T030000",
	"TZOFFSETFROM:+0200",
	"TZOFFSETTO:+0100",
	"END:STANDARD",
	"END:VTIMEZONE",
];

function calendarObject(...components) {
	return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apple Inc.//iCloud//EN", ...components.flat(), "END:VCALENDAR"].join(
		"\r\n",
	);
}

test("merges CalDAV objects into one feed with shared time zones once", () => {
	const ics = mergeCalendarObjects(
		[
			calendarObject(TIMEZONE, [
				"BEGIN:VEVENT",
				"UID:one",
				"DTSTART;TZID=Europe/Berlin:20261020T090000",
				"SUMMARY:A very long event title that is folded",
				"  across two lines",
				"BEGIN:VALARM",
				"TRIGGER:-PT15M",
				"END:VALARM",
				"END:VEVENT",
			]),
			calendarObject(TIMEZONE, ["BEGIN:VEVENT", "UID:two", "RRULE:FREQ=WEEKLY", "END:VEVENT"]),
			calendarObject(["BEGIN:VTODO", "UID:todo", "END:VTODO"]),
		],
		"Family",
	);
	assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
	assert.match(ics, /X-WR-CALNAME:Family\r\n/);
	assert.match(ics, /END:VEVENT\r\nEND:VCALENDAR\r\n$/);
	assert.equal(ics.match(/BEGIN:VCALENDAR/g).length, 1);
	assert.equal(ics.match(/BEGIN:VTIMEZONE/g).length, 1);
	assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
	assert.match(ics, /folded\r\n  across two lines\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT/);
	assert.doesNotMatch(ics, /VTODO/);
});

test("turns calendar names into URL slugs", () => {
	assert.equal(slugify("Family"), "family");
	assert.equal(slugify("Kids' Activities & Sport"), "kids-activities-sport");
	assert.equal(slugify("Café Öffnungszeiten"), "cafe-offnungszeiten");
	assert.equal(slugify("🎉"), "calendar");
});
