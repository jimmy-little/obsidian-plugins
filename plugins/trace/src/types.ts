export type StatusCategory = "success" | "error" | "warning" | "info" | "neutral";

export type LogFormat = "table" | "csv" | "log";

export interface LogEntry {
	timestamp: Date | null;
	status: string | null;
	statusCategory: StatusCategory;
	subject: string | null;
	message: string | null;
	raw: string;
	lineNumber: number;
}

export interface ColumnMapping {
	timestamp?: string;
	status?: string;
	subject?: string;
	message?: string;
}

export interface TraceSettings {
	columnAliases: {
		timestamp: string;
		status: string;
		subject: string;
		message: string;
	};
	csvDelimiter: "," | "|" | "\t";
	customStatusMappings: Record<string, StatusCategory>;
	tokenColors: {
		timestamp: string;
		success: string;
		error: string;
		warning: string;
		info: string;
		neutral: string;
		subject: string;
		comment: string;
	};
	defaultQueryLimit: number;
}

export interface ParseOptions {
	format: LogFormat;
	columnMapping?: ColumnMapping;
	csvDelimiter?: string;
	customStatusMappings?: Record<string, StatusCategory>;
}

export interface ParsedLog {
	entries: LogEntry[];
	format: LogFormat;
}
