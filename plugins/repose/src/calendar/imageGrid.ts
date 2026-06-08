/** Day-One style image grid slot layout (from Quill). */

export function getImageGridSlots(urls: (string | null)[]): (string | null)[] {
	if (urls.length === 0) return [];
	if (urls.length === 1) return [urls[0]!];
	if (urls.length === 2) return [urls[0]!, urls[1]!];
	if (urls.length === 3) return [urls[0]!, urls[1]!, urls[2]!, null];
	return [urls[0]!, urls[1]!, urls[2]!, urls[3]!];
}

export function imageGridLayoutClass(count: number): string {
	if (count <= 1) return "repose-image-grid-full";
	if (count === 2) return "repose-image-grid-split2";
	return "repose-image-grid-4";
}
