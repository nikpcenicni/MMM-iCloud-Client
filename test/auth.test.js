"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { tokenAllowed } = require("../lib/auth");

test("allows every request when no token is configured", () => {
	assert.equal(tokenAllowed("", { query: {}, headers: {} }), true);
	assert.equal(tokenAllowed(undefined, { query: {}, headers: {} }), true);
});

test("accepts the token from the query string or a bearer header", () => {
	assert.equal(tokenAllowed("s3cret", { query: { token: "s3cret" }, headers: {} }), true);
	assert.equal(tokenAllowed("s3cret", { query: {}, headers: { authorization: "Bearer s3cret" } }), true);
	assert.equal(tokenAllowed("s3cret", { query: {}, headers: { authorization: "bearer  s3cret " } }), true);
});

test("rejects missing, wrong or malformed tokens", () => {
	assert.equal(tokenAllowed("s3cret", { query: {}, headers: {} }), false);
	assert.equal(tokenAllowed("s3cret", { query: { token: "wrong" }, headers: {} }), false);
	assert.equal(tokenAllowed("s3cret", { query: { token: "s3cre" }, headers: {} }), false);
	assert.equal(tokenAllowed("s3cret", { query: { token: ["s3cret"] }, headers: {} }), false);
	assert.equal(tokenAllowed("s3cret", { query: {}, headers: { authorization: "Basic s3cret" } }), false);
});
