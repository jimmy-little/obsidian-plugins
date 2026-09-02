import Foundation

struct OmniFocusHealth: Codable {
	let ok: Bool
	let status: String
	let installed: Bool
	let running: Bool
	let automationOk: Bool
	let version: String?
	let error: String?
	let message: String?
}

struct OmniFocusProject: Codable {
	let id: String
	let name: String
	let status: String
	let folder: String?
	let sequential: Bool
}

struct OmniFocusTask: Codable {
	let id: String
	let name: String
	let completed: Bool
	let dropped: Bool
	let flagged: Bool
	let due: String?
	let deferDate: String?
	let note: String
	let projectId: String?
	let projectName: String?
	let inInbox: Bool
	let tags: [String]
	let modified: String?

	enum CodingKeys: String, CodingKey {
		case id, name, completed, dropped, flagged, due
		case deferDate = "defer"
		case note, projectId, projectName, inInbox, tags, modified
	}
}

struct OmniFocusEnvelope<T: Codable>: Codable {
	let ok: Bool
	let error: String?
	let message: String?
	let id: String?
	let projectId: String?
	let inInbox: Bool?
	let projects: [OmniFocusProject]?
	let tasks: [OmniFocusTask]?
	let data: T?
}

private struct EmptyData: Codable {}

final class OmniFocusBridge: @unchecked Sendable {
	private var cheapHealthCache: (at: Date, value: OmniFocusHealth)?
	/// OmniFocus evaluateJavascript is single-flight; concurrent osascripts starve and hit timeouts.
	private let automationLock = NSLock()

	func health(probeAutomation: Bool = true) -> OmniFocusHealth {
		if !probeAutomation, let cached = cheapHealthCache, Date().timeIntervalSince(cached.at) < 15 {
			return cached.value
		}
		let result: OmniFocusHealth
		if probeAutomation {
			do {
				result = decodeHealth(try runOmniJS(Self.healthScript, timeout: 20))
			} catch {
				let fallback = decodeHealth(runJxaHealth())
				result = OmniFocusHealth(
					ok: false,
					status: fallback.running ? "automation_failed" : fallback.status,
					installed: fallback.installed,
					running: fallback.running,
					automationOk: false,
					version: fallback.version,
					error: "automation_failed",
					message: error.localizedDescription
				)
			}
		} else {
			result = decodeHealth(runJxaHealth())
		}
		if !probeAutomation {
			cheapHealthCache = (Date(), result)
		}
		return result
	}

	func projects() throws -> [OmniFocusProject] {
		let data = try runOmniJS(Self.listProjectsScript, timeout: 90)
		let env = try decodeEnvelope(EmptyData.self, from: data)
		try throwIfFailed(env.ok, env.error, env.message)
		return env.projects ?? []
	}

	func tasks(projectId: String?, projectIds: [String]?, inbox: Bool?, completed: String?) throws -> [OmniFocusTask] {
		var args: [String: Any] = [:]
		var ids: [String] = []
		if let projectIds {
			ids.append(contentsOf: projectIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
		}
		if let projectId {
			let trimmed = projectId.trimmingCharacters(in: .whitespacesAndNewlines)
			if !trimmed.isEmpty { ids.append(trimmed) }
		}
		// Dedupe while preserving order.
		var seen = Set<String>()
		ids = ids.filter { seen.insert($0).inserted }
		if ids.count == 1 {
			args["projectId"] = ids[0]
		} else if ids.count > 1 {
			args["projectIds"] = ids
		}
		if let inbox { args["inbox"] = inbox }
		if let completed { args["completed"] = completed }
		let data = try runOmniJS(Self.listTasksScript, args: args, timeout: 120)
		let env = try decodeEnvelope(EmptyData.self, from: data)
		try throwIfFailed(env.ok, env.error, env.message)
		return env.tasks ?? []
	}

	func createTask(body: [String: Any]) throws -> String {
		let data = try runOmniJS(Self.createTaskScript, args: body, timeout: 60)
		let env = try decodeEnvelope(EmptyData.self, from: data)
		try throwIfFailed(env.ok, env.error, env.message)
		guard let id = env.id, !id.isEmpty else {
			throw nsError("OmniFocus create task returned no id")
		}
		if let requested = body["projectId"] as? String, !requested.isEmpty {
			if env.inInbox == true || env.projectId != requested {
				throw nsError("OmniFocus did not place the task in the linked project")
			}
		}
		return id
	}

	func updateTask(id: String, body: [String: Any]) throws {
		var args = body
		args["id"] = id
		let data = try runOmniJS(Self.updateTaskScript, args: args, timeout: 60)
		let env = try decodeEnvelope(EmptyData.self, from: data)
		try throwIfFailed(env.ok, env.error, env.message)
	}

	func createProject(name: String) throws -> String {
		let data = try runOmniJS(Self.createProjectScript, args: ["name": name], timeout: 60)
		let env = try decodeEnvelope(EmptyData.self, from: data)
		try throwIfFailed(env.ok, env.error, env.message)
		guard let id = env.id, !id.isEmpty else {
			throw nsError("OmniFocus create project returned no id")
		}
		return id
	}

	func synchronize() throws {
		let data = try runOsascript(Self.jxaSyncScript, timeout: 120, useLock: true)
		let env = try decodeEnvelope(EmptyData.self, from: data)
		try throwIfFailed(env.ok, env.error, env.message)
	}

	private func decodeHealth(_ data: Data) -> OmniFocusHealth {
		if let health = try? JSONDecoder().decode(OmniFocusHealth.self, from: data) {
			return health
		}
		if let env = try? decodeEnvelope(EmptyData.self, from: data) {
			let installed = env.error != "not_installed"
			let running = env.error != "not_running" && installed && env.error != "not_installed"
			return OmniFocusHealth(
				ok: env.ok,
				status: env.error ?? (env.ok ? "ok" : "error"),
				installed: installed,
				running: running,
				automationOk: env.ok,
				version: nil,
				error: env.error,
				message: env.message
			)
		}
		return OmniFocusHealth(
			ok: false,
			status: "error",
			installed: false,
			running: false,
			automationOk: false,
			version: nil,
			error: "decode_failed",
			message: String(data: data, encoding: .utf8)
		)
	}

	private func decodeEnvelope<T: Codable>(_ type: T.Type, from data: Data) throws -> OmniFocusEnvelope<T> {
		do {
			return try JSONDecoder().decode(OmniFocusEnvelope<T>.self, from: data)
		} catch {
			throw nsError(String(data: data, encoding: .utf8) ?? String(describing: error))
		}
	}

	private func throwIfFailed(_ ok: Bool, _ error: String?, _ message: String?) throws {
		if ok { return }
		throw nsError(message ?? error ?? "OmniFocus command failed")
	}

	private func nsError(_ message: String) -> NSError {
		NSError(domain: "FulcrumOmniFocus", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
	}

	private func runJxaHealth() -> Data {
		// Cheap running/installed check must not wait behind OmniJS evaluateJavascript.
		(try? runOsascript(Self.jxaHealthScript, timeout: 6, useLock: false))
			?? Data(#"{"ok":false,"status":"not_installed","installed":false,"running":false,"automationOk":false,"error":"not_installed","message":"osascript failed"}"#.utf8)
	}

	private func runOmniJS(_ omniSource: String, args: [String: Any]? = nil, timeout: TimeInterval = 30) throws -> Data {
		var source = omniSource
		if let args {
			let argsData = try JSONSerialization.data(withJSONObject: args, options: [])
			let argsJson = String(data: argsData, encoding: .utf8) ?? "{}"
			source = source.replacingOccurrences(of: "__ARGS__", with: argsJson)
		} else {
			source = source.replacingOccurrences(of: "__ARGS__", with: "{}")
		}
		let b64 = Data(source.utf8).base64EncodedString()
		let wrapper = """
		(function () {
		  ObjC.import('Foundation');
		  function decodeScript(b64) {
		    var data = $.NSData.alloc.initWithBase64EncodedStringOptions(b64, 0);
		    return $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js;
		  }
		  try {
		    var of = Application("OmniFocus");
		  } catch (e) {
		    return JSON.stringify({ok:false,error:"not_installed",message:String(e)});
		  }
		  try {
		    if (!of.running()) {
		      return JSON.stringify({ok:false,error:"not_running",message:"OmniFocus is not running"});
		    }
		  } catch (e) {
		    return JSON.stringify({ok:false,error:"not_installed",message:String(e)});
		  }
		  var script = decodeScript("\(b64)");
		  return of.evaluateJavascript(script);
		})()
		"""
		return try runOsascript(wrapper, timeout: timeout, useLock: true)
	}

	private func runOsascript(_ source: String, timeout: TimeInterval, useLock: Bool = true) throws -> Data {
		if useLock {
			automationLock.lock()
		}
		defer {
			if useLock { automationLock.unlock() }
		}

		let process = Process()
		process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
		process.arguments = ["-l", "JavaScript", "-e", source]
		let stdout = Pipe()
		let stderr = Pipe()
		process.standardOutput = stdout
		process.standardError = stderr
		try process.run()

		let deadline = Date().addingTimeInterval(timeout)
		while process.isRunning && Date() < deadline {
			Thread.sleep(forTimeInterval: 0.05)
		}
		if process.isRunning {
			process.terminate()
			Thread.sleep(forTimeInterval: 0.2)
			if process.isRunning {
				kill(process.processIdentifier, SIGKILL)
			}
			throw nsError("OmniFocus osascript timed out after \(Int(timeout))s")
		}
		process.waitUntilExit()
		let out = stdout.fileHandleForReading.readDataToEndOfFile()
		let err = stderr.fileHandleForReading.readDataToEndOfFile()
		if process.terminationStatus != 0 {
			let errText = String(data: err, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
			let outText = String(data: out, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
			let combined = [errText, outText].filter { !$0.isEmpty }.joined(separator: "\n")
			if combined.range(of: "can't be found", options: .caseInsensitive) != nil
				|| combined.contains("-2700") {
				return Data(#"{"ok":false,"status":"not_installed","installed":false,"running":false,"automationOk":false,"error":"not_installed","message":"OmniFocus is not installed"}"#.utf8)
			}
			throw nsError(combined.isEmpty ? "osascript exit \(process.terminationStatus)" : combined)
		}
		return out
	}

	private static let jxaHealthScript = """
	(function () {
	  try {
	    var of = Application("OmniFocus");
	    var running = false;
	    try { running = !!of.running(); } catch (e) { running = false; }
	    var version = null;
	    try { version = String(of.version()); } catch (e) {}
	    return JSON.stringify({
	      ok: false,
	      status: running ? "running" : "not_running",
	      installed: true,
	      running: running,
	      automationOk: false,
	      version: version,
	      error: running ? null : "not_running",
	      message: running ? "OmniFocus is running (automation not probed)" : "OmniFocus is not running"
	    });
	  } catch (e) {
	    return JSON.stringify({
	      ok: false,
	      status: "not_installed",
	      installed: false,
	      running: false,
	      automationOk: false,
	      error: "not_installed",
	      message: String(e)
	    });
	  }
	})()
	"""

	private static let healthScript = """
	(function () {
	  try {
	    return JSON.stringify({
	      ok: true,
	      status: "ok",
	      installed: true,
	      running: true,
	      automationOk: true,
	      version: String(app.userVersion),
	      error: null,
	      message: "OmniJS evaluateJavascript is available"
	    });
	  } catch (e) {
	    return JSON.stringify({
	      ok: false,
	      status: "automation_failed",
	      installed: true,
	      running: true,
	      automationOk: false,
	      error: "automation_failed",
	      message: String(e)
	    });
	  }
	})()
	"""

	private static let listProjectsScript = """
	(function () {
	  function statusName(p) {
	    try {
	      if (p.status === Project.Status.Done) return "done";
	      if (p.status === Project.Status.Dropped) return "dropped";
	      if (p.status === Project.Status.OnHold) return "on-hold";
	      return "active";
	    } catch (e) {
	      return "active";
	    }
	  }
	  var projects = [];
	  flattenedProjects.forEach(function (p) {
	    if (p.status === Project.Status.Dropped) return;
	    projects.push({
	      id: p.id.primaryKey,
	      name: p.name,
	      status: statusName(p),
	      folder: p.parentFolder ? p.parentFolder.name : null,
	      sequential: !!p.sequential
	    });
	  });
	  return JSON.stringify({ok: true, projects: projects});
	})()
	"""

	private static let listTasksScript = """
	(function () {
	  try {
	    var args = __ARGS__;
	    function pad(n) { return n < 10 ? "0" + n : String(n); }
	    function day(d) {
	      if (!d) return null;
	      try {
	        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
	      } catch (e) { return null; }
	    }
	    function iso(d) {
	      if (!d) return null;
	      try { return d.toISOString(); } catch (e) { return null; }
	    }
	    function findProject(pid) {
	      var p = null;
	      try { p = Project.byIdentifier(pid); } catch (e) { p = null; }
	      if (p) return p;
	      flattenedProjects.forEach(function (x) {
	        if (x.id.primaryKey === pid) p = x;
	      });
	      return p;
	    }
	    function pushTasks(project, source) {
	      try {
	        project.flattenedTasks.forEach(function (t) { source.push(t); });
	      } catch (e) {
	        try { project.tasks.forEach(function (t) { source.push(t); }); } catch (e2) {}
	      }
	    }
	    var wanted = null;
	    if (args.projectIds && args.projectIds.length) {
	      wanted = {};
	      args.projectIds.forEach(function (id) { wanted[String(id)] = true; });
	    } else if (args.projectId) {
	      wanted = {};
	      wanted[String(args.projectId)] = true;
	    }
	    var source = [];
	    if (wanted) {
	      Object.keys(wanted).forEach(function (pid) {
	        var project = findProject(pid);
	        if (project) pushTasks(project, source);
	      });
	    } else {
	      flattenedTasks.forEach(function (t) { source.push(t); });
	    }
	    var out = [];
	    source.forEach(function (t) {
	      try {
	        if (t.project) return;
	        var dropped = false;
	        try { dropped = t.taskStatus === Task.Status.Dropped; } catch (e) {}
	        if (dropped) return;
	        var completed = !!t.completed;
	        if (args.completed === "false" && completed) return;
	        if (args.completed === "true" && !completed) return;
	        var inInbox = !!t.inInbox;
	        if (args.inbox === true && !inInbox) return;
	        var projectId = t.containingProject ? t.containingProject.id.primaryKey : null;
	        if (wanted && (!projectId || !wanted[projectId])) return;
	        var tags = [];
	        try {
	          t.tags.forEach(function (tag) { tags.push(tag.name); });
	        } catch (e) {}
	        out.push({
	          id: t.id.primaryKey,
	          name: t.name,
	          completed: completed,
	          dropped: dropped,
	          flagged: !!t.flagged,
	          due: day(t.dueDate),
	          defer: day(t.deferDate),
	          note: t.note ? String(t.note) : "",
	          projectId: projectId,
	          projectName: t.containingProject ? t.containingProject.name : null,
	          inInbox: inInbox,
	          tags: tags,
	          modified: iso(t.modified)
	        });
	      } catch (e) {}
	    });
	    return JSON.stringify({ok: true, tasks: out});
	  } catch (e) {
	    return JSON.stringify({ok:false,error:"list_failed",message:String(e)});
	  }
	})()
	"""

	private static let createTaskScript = """
	(function () {
	  try {
	    var args = __ARGS__;
	    var name = String(args.name || "").trim();
	    if (!name) return JSON.stringify({ok:false,error:"missing_name",message:"name is required"});
	    function parseDay(s) {
	      var p = String(s).substring(0, 10).split("-");
	      if (p.length < 3) return null;
	      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 17, 0, 0);
	    }
	    function findProject(pid) {
	      var p = null;
	      try { p = Project.byIdentifier(pid); } catch (e) { p = null; }
	      if (p) return p;
	      flattenedProjects.forEach(function (x) {
	        if (x.id.primaryKey === pid) p = x;
	      });
	      return p;
	    }
	    function insertLoc(project) {
	      try { return project.ending; } catch (e) {}
	      try { return project.beginning; } catch (e) {}
	      try { return project.task.ending; } catch (e) {}
	      return project;
	    }
	    var pid = args.projectId ? String(args.projectId) : "";
	    var project = pid ? findProject(pid) : null;
	    if (pid && !project) return JSON.stringify({ok:false,error:"project_not_found",message:"OmniFocus project not found: " + pid});
	    var task;
	    if (project) {
	      try {
	        task = new Task(name, project);
	      } catch (e0) {
	        try {
	          task = new Task(name, insertLoc(project));
	        } catch (e) {
	          task = new Task(name, inbox.ending);
	        }
	      }
	      var containing = task.containingProject ? task.containingProject.id.primaryKey : null;
	      if (containing !== pid) {
	        try { moveTasks([task], insertLoc(project)); } catch (e) {
	          try { moveTasks([task], project); } catch (e2) {}
	        }
	      }
	    } else {
	      task = new Task(name, inbox.ending);
	    }
	    if (args.note) task.note = String(args.note);
	    if (args.flagged === true) task.flagged = true;
	    if (args.due) task.dueDate = parseDay(args.due);
	    if (args.defer) task.deferDate = parseDay(args.defer);
	    if (args.tags && args.tags.length) {
	      args.tags.forEach(function (tagName) {
	        var tag = null;
	        flattenedTags.forEach(function (t) { if (t.name === String(tagName)) tag = t; });
	        if (!tag) tag = new Tag(String(tagName));
	        task.addTag(tag);
	      });
	    }
	    try { document.save(); } catch (e) {}
	    var containing = task.containingProject ? task.containingProject.id.primaryKey : null;
	    return JSON.stringify({
	      ok: true,
	      id: task.id.primaryKey,
	      projectId: containing,
	      inInbox: !!task.inInbox
	    });
	  } catch (e) {
	    return JSON.stringify({ok:false,error:"create_failed",message:String(e)});
	  }
	})()
	"""

	private static let updateTaskScript = """
	(function () {
	  var args = __ARGS__;
	  var task = Task.byIdentifier(String(args.id || ""));
	  if (!task) return JSON.stringify({ok:false,error:"not_found",message:"OmniFocus task not found"});
	  function parseDay(s) {
	    if (s === null) return null;
	    var p = String(s).substring(0, 10).split("-");
	    if (p.length < 3) return null;
	    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 17, 0, 0);
	  }
	  if (args.name != null) task.name = String(args.name);
	  if (args.note != null) task.note = String(args.note);
	  if (args.flagged === true || args.flagged === false) task.flagged = !!args.flagged;
	  if (args.due !== undefined) task.dueDate = args.due ? parseDay(args.due) : null;
	  if (args.defer !== undefined) task.deferDate = args.defer ? parseDay(args.defer) : null;
	  if (args.completed === true) task.markComplete();
	  if (args.completed === false) task.markIncomplete();
	  if (args.projectId !== undefined) {
	    if (args.projectId) {
	      var project = Project.byIdentifier(String(args.projectId));
	      if (!project) return JSON.stringify({ok:false,error:"project_not_found",message:"OmniFocus project not found"});
	      moveTasks([task], project);
	    } else {
	      moveTasks([task], inbox.ending);
	    }
	  }
	  try { document.save(); } catch (e) {}
	  return JSON.stringify({ok: true, id: task.id.primaryKey});
	})()
	"""

	private static let createProjectScript = """
	(function () {
	  var args = __ARGS__;
	  var name = String(args.name || "").trim();
	  if (!name) return JSON.stringify({ok:false,error:"missing_name",message:"name is required"});
	  var project = new Project(name);
	  try { document.save(); } catch (e) {}
	  return JSON.stringify({ok: true, id: project.id.primaryKey});
	})()
	"""

	private static let jxaSyncScript = """
	(function () {
	  try {
	    var of = Application("OmniFocus");
	    if (!of.running()) {
	      return JSON.stringify({ok:false,error:"not_running",message:"OmniFocus is not running"});
	    }
	    of.synchronize();
	    return JSON.stringify({ok: true});
	  } catch (e) {
	    return JSON.stringify({ok:false,error:"sync_failed",message:String(e)});
	  }
	})()
	"""
}
