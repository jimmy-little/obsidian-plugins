import { homedir } from "os";
import { join } from "path";

export function expandHome(raw: string): string {
	const path = (raw ?? "").trim();
	if (path === "~") return homedir();
	if (path.startsWith("~/")) return join(homedir(), path.slice(2));
	return path;
}
