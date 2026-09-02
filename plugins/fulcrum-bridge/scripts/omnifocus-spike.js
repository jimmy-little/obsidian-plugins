#!/usr/bin/osascript -l JavaScript
/**
 * OmniFocus OmniJS spike (macOS).
 *
 * Confirms: app installed, running, JXA Application(), evaluateJavascript (Pro).
 * Does not mutate the database unless SPIKE_WRITE=1.
 *
 *   osascript -l JavaScript plugins/fulcrum-bridge/scripts/omnifocus-spike.js
 *   SPIKE_WRITE=1 osascript -l JavaScript plugins/fulcrum-bridge/scripts/omnifocus-spike.js
 */
ObjC.import("stdlib");

function jxaHealth() {
	var result = {
		ok: false,
		installed: false,
		running: false,
		version: null,
		automationOk: false,
		writeOk: null,
		error: null,
		message: null,
	};
	try {
		var of = Application("OmniFocus");
		result.installed = true;
		result.running = !!of.running();
		if (!result.running) {
			result.error = "not_running";
			result.message = "OmniFocus is installed but not running. Open it, then retry.";
			return result;
		}
		try {
			result.version = String(of.version());
		} catch (e) {
			result.version = null;
		}
		var probe =
			'(function(){return JSON.stringify({ok:true,automation:true,name:app.name});})()';
		var raw = of.evaluateJavascript(probe);
		var parsed = JSON.parse(String(raw));
		result.automationOk = parsed && parsed.ok === true;
		if (!result.automationOk) {
			result.error = "automation_failed";
			result.message =
				"evaluateJavascript failed. Enable Automation for this process and OmniFocus Pro.";
			return result;
		}

		var writeEnv = $.getenv("SPIKE_WRITE");
		if (writeEnv && String(writeEnv) === "1") {
			var writeScript =
				'(function(){' +
				"var t=new Task('Fulcrum spike '+Date.now(), inbox.ending);" +
				"var id=t.id.primaryKey;" +
				"t.markComplete();" +
				"document.save();" +
				"return JSON.stringify({ok:true,id:id,completed:t.completed});" +
				"})()";
			var writeRaw = of.evaluateJavascript(writeScript);
			var writeParsed = JSON.parse(String(writeRaw));
			result.writeOk = writeParsed && writeParsed.ok === true;
			result.message = result.writeOk
				? "Created and completed inbox task " + writeParsed.id
				: "Write probe failed";
			if (!result.writeOk) result.error = "write_failed";
		}

		result.ok = result.installed && result.running && result.automationOk;
		if (result.ok && !result.message) {
			result.message = "OmniJS evaluateJavascript is available.";
		}
		return result;
	} catch (e) {
		var msg = String(e);
		if (/can.?t be found|(-2700)|Application can't be found/i.test(msg)) {
			result.error = "not_installed";
			result.message = "OmniFocus is not installed (Application can't be found).";
		} else {
			result.error = "jxa_error";
			result.message = msg;
		}
		return result;
	}
}

JSON.stringify(jxaHealth(), null, 2);
