"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseVCard, parseDate, filterByGroups } = require("../lib/contacts");

function vcard(...lines) {
	return ["BEGIN:VCARD", "VERSION:3.0", ...lines, "END:VCARD"].join("\r\n");
}

test("parses common date formats", () => {
	assert.deepEqual(parseDate({ value: "1990-05-04" }), { year: 1990, month: 5, day: 4 });
	assert.deepEqual(parseDate({ value: "19900504" }), { year: 1990, month: 5, day: 4 });
	assert.deepEqual(parseDate({ value: "1990-05-04T00:00:00Z" }), { year: 1990, month: 5, day: 4 });
	assert.deepEqual(parseDate({ value: "--0504" }), { year: null, month: 5, day: 4 });
	assert.deepEqual(parseDate({ value: "--05-04" }), { year: null, month: 5, day: 4 });
	assert.equal(parseDate({ value: "not a date" }), null);
	assert.equal(parseDate({ value: "1990-13-04" }), null);
});

test("treats Apple's 1604 placeholder as no year", () => {
	const entry = { value: "1604-05-04", meta: { "x-apple-omit-year": ["1604"] } };
	assert.deepEqual(parseDate(entry), { year: null, month: 5, day: 4 });
});

test("extracts a contact from an iCloud vCard", () => {
	const contact = parseVCard(
		vcard("PRODID:-//Apple Inc.//iOS 18//EN", "N:Doe;Jane;Q;;", "FN:Jane Doe", "BDAY:1990-05-04", "UID:abc-123"),
		"/fallback.vcf",
	);
	assert.deepEqual(contact, {
		kind: "contact",
		id: "abc-123",
		name: "Jane Doe",
		birthday: { year: 1990, month: 5, day: 4 },
		dates: [],
	});
});

test("builds the name from N when FN is missing and falls back to the URL id", () => {
	const contact = parseVCard(vcard("N:Doe;Jane;Q;;", "BDAY:--0504"), "/x.vcf");
	assert.equal(contact.name, "Jane Q Doe");
	assert.equal(contact.id, "/x.vcf");
});

test("skips contacts without any date", () => {
	assert.equal(parseVCard(vcard("FN:No Dates"), "/x.vcf"), null);
});

test("reads anniversaries and custom labelled dates", () => {
	const contact = parseVCard(
		vcard(
			"FN:Jane Doe",
			"item1.X-ABDATE;type=pref:2010-06-12",
			"item1.X-ABLABEL:_$!<Anniversary>!$_",
			"item2.X-ABDATE:--0901",
			"item2.X-ABLABEL:Gotcha Day",
			"item3.X-ABDATE:2001-01-01",
		),
		"/x.vcf",
	);
	assert.equal(contact.birthday, null);
	assert.deepEqual(contact.dates, [
		{ label: "Anniversary", date: { year: 2010, month: 6, day: 12 } },
		{ label: "Gotcha Day", date: { year: null, month: 9, day: 1 } },
		{ label: "Anniversary", date: { year: 2001, month: 1, day: 1 } },
	]);
});

test("reads the vCard 4 ANNIVERSARY property", () => {
	const contact = parseVCard(vcard("FN:Jane Doe", "ANNIVERSARY:20100612"), "/x.vcf");
	assert.deepEqual(contact.dates, [{ label: "Anniversary", date: { year: 2010, month: 6, day: 12 } }]);
});

test("parses iCloud contact groups", () => {
	const group = parseVCard(
		vcard(
			"FN:Family",
			"UID:group-1",
			"X-ADDRESSBOOKSERVER-KIND:group",
			"X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:abc",
			"X-ADDRESSBOOKSERVER-MEMBER:urn:uuid:def",
		),
		"/g.vcf",
	);
	assert.deepEqual(group, { kind: "group", id: "group-1", name: "Family", members: ["abc", "def"] });
});

test("filters contacts by group name, case-insensitively", () => {
	const contacts = [{ id: "abc" }, { id: "def" }, { id: "xyz" }];
	const groups = [
		{ name: "Family", members: ["abc"] },
		{ name: "Friends", members: ["def"] },
	];
	assert.deepEqual(filterByGroups(contacts, groups, []), { contacts, missing: [] });
	assert.deepEqual(filterByGroups(contacts, groups, ["family", "Friends", "Work"]), {
		contacts: [{ id: "abc" }, { id: "def" }],
		missing: ["Work"],
	});
});
