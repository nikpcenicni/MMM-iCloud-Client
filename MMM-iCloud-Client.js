/* global Module, Log */

/* MagicMirror²
 * Module: MMM-iCloud-Client
 *
 * By Jonathan Vogt https://github.com/bitte-ein-bit
 * MIT Licensed.
 */

Module.register("MMM-iCloud-Client", {
	defaults: {
		username: "",
		appPassword: "",
		updateInterval: 60 * 60 * 1000,
	},

	start: function () {
		Log.info(`Starting module: ${this.name}`);
		this.sendSocketNotification("CONFIG", this.config);
	},
});
