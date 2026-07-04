import type { StatusCategory } from "../types";
import { statusCategoryClass } from "../parser/statusNormalizer";

export type TokenField = "timestamp" | "status" | "subject" | "message" | "comment";

export function tokenClassForField(field: TokenField, statusCategory?: StatusCategory): string {
	switch (field) {
		case "timestamp":
			return "trace-token-timestamp";
		case "status":
			return statusCategory ? `trace-token-status ${statusCategoryClass(statusCategory)}` : "trace-token-status";
		case "subject":
			return "trace-token-subject";
		case "message":
		case "comment":
			return "trace-token-comment";
		default:
			return "trace-token-neutral";
	}
}

export function cellClassForField(field: TokenField, statusCategory?: StatusCategory): string {
	switch (field) {
		case "timestamp":
			return "trace-cell-timestamp";
		case "status":
			return statusCategory
				? `trace-cell-status trace-cell-status-${statusCategory}`
				: "trace-cell-status";
		case "subject":
			return "trace-cell-subject";
		case "message":
			return "trace-cell-message";
		default:
			return "trace-cell-neutral";
	}
}
