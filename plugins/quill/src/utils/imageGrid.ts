export function getImageGridSlots(paths: string[]): (string | null)[] {
	if (paths.length === 0) return [];
	if (paths.length === 1) return [paths[0]!];
	if (paths.length === 2) return [paths[0]!, paths[1]!];
	if (paths.length === 3) return [paths[0]!, paths[1]!, paths[2]!, null];
	return [paths[0]!, paths[1]!, paths[2]!, paths[3]!];
}
