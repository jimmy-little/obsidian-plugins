export interface SkillInputSpec {
	key: string;
	label: string;
	type?: "text" | "textarea" | "select" | "date" | "boolean";
	default?: string | boolean;
	required?: boolean;
	options?: string[];
}

export interface SkillMeta {
	slug: string;
	name: string;
	label: string;
	description: string;
	domain?: string;
	status?: string;
	requires_env?: string[];
	inputs?: SkillInputSpec[];
	path: string;
}

export interface SkillsIndex {
	error?: string;
	generatedAt: string | null;
	count: number;
	skills: SkillMeta[];
}

export interface LoadedSkill extends SkillMeta {
	body: string;
	skillMdPath: string;
}

export type SkillInputValues = Record<string, string | boolean>;
