"use strict";
const crypto = require("node:crypto");

function digest(value) {
	return crypto.createHash("sha256").update(String(value)).digest();
}

// Reads the token from ?token=… or an "Authorization: Bearer …" header.
function requestToken(req) {
	const query = req.query && req.query.token;
	if (typeof query === "string" && query) return query;
	const header = req.headers && req.headers.authorization;
	const bearer = typeof header === "string" && /^Bearer\s+(.+)$/i.exec(header.trim());
	return bearer ? bearer[1].trim() : "";
}

// True when no token is configured, or the request carries the configured token.
// Compares hashes in constant time so neither the token nor its length leaks through timing.
function tokenAllowed(expected, req) {
	if (!expected) return true;
	const given = requestToken(req);
	return given !== "" && crypto.timingSafeEqual(digest(given), digest(expected));
}

module.exports = { tokenAllowed };
