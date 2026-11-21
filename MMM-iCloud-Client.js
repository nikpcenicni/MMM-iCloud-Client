/* global Module, Log */

/* MagicMirror²
 * Module: MMM-iCloud-Client
 *
 * By Nikholas Pcenicni https://github.com/nikpcenicni/MMM-iCloud-Client
 * MIT Licensed.
 */

Module.register("MMM-iCloud-Client", {
	defaults: {
		username: "",
		appPassword: "",
		updateInterval: 60 * 60 * 1000,
		groups: [],
		calendars: [],
	},

	start: function () {
		Log.info(`Starting module: ${this.name}`);
		this.sendSocketNotification("CONFIG", this.config);
	},
});
