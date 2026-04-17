/** Luminance 0–1 (sRGB) */
function relativeLuminance(r: number, g: number, b: number): number {
	const [rs, gs, bs] = [r, g, b].map((c) => {
		const x = c / 255;
		return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function averageFilteredRgb(data: Uint8ClampedArray, stride = 4): { r: number; g: number; b: number } | null {
	let r = 0;
	let g = 0;
	let b = 0;
	let n = 0;
	for (let i = 0; i < data.length; i += stride) {
		const a = data[i + 3];
		if (a < 12) continue;
		const rr = data[i];
		const gg = data[i + 1];
		const bb = data[i + 2];
		const lum = relativeLuminance(rr, gg, bb);
		/* Skip near-white (poster border) and near-black */
		if (lum < 0.06 || lum > 0.94) continue;
		r += rr;
		g += gg;
		b += bb;
		n++;
	}
	if (n < 8) {
		/* Fallback: average everything with alpha */
		r = g = b = n = 0;
		for (let i = 0; i < data.length; i += stride) {
			if (data[i + 3] < 8) continue;
			r += data[i];
			g += data[i + 1];
			b += data[i + 2];
			n++;
		}
		if (!n) return null;
	}
	return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.decoding = "async";
		img.onload = (): void => resolve(img);
		img.onerror = (): void => reject(new Error("image load failed"));
		img.src = src;
	});
}

/** Sample center region of poster (avoids white mat / edge). */
function samplePosterRegion(img: HTMLImageElement): { r: number; g: number; b: number } | null {
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;
	if (w < 4 || h < 4) return null;
	const canvas = document.createElement("canvas");
	const sx = Math.floor(w * 0.18);
	const sy = Math.floor(h * 0.12);
	const sw = Math.max(8, Math.floor(w * 0.64));
	const sh = Math.max(8, Math.floor(h * 0.76));
	canvas.width = Math.min(64, sw);
	canvas.height = Math.min(64, sh);
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
	return averageFilteredRgb(data);
}

/**
 * Middle horizontal band, excluding bottom ~30% (dark overlay / fade) and top ~8%.
 */
function sampleBannerMiddleRegion(img: HTMLImageElement): { r: number; g: number; b: number } | null {
	const w = img.naturalWidth || img.width;
	const h = img.naturalHeight || img.height;
	if (w < 4 || h < 4) return null;
	const canvas = document.createElement("canvas");
	const y0 = Math.floor(h * 0.1);
	const y1 = Math.floor(h * 0.62);
	const sh = Math.max(8, y1 - y0);
	const sw = w;
	canvas.width = Math.min(72, sw);
	canvas.height = Math.min(48, sh);
	const ctx = canvas.getContext("2d");
	if (!ctx) return null;
	ctx.drawImage(img, 0, y0, sw, sh, 0, 0, canvas.width, canvas.height);
	const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
	return averageFilteredRgb(data);
}

export type MediaHeroPalette = { r: number; g: number; b: number };

/**
 * Dominant-ish color for page background + banner fade.
 * Prefers **poster** (stable, avoids banner bottom overlay). Falls back to **banner** middle band.
 */
export async function sampleMediaHeroPalette(
	backdropSrc: string | null,
	posterSrc: string | null,
): Promise<MediaHeroPalette | null> {
	if (posterSrc) {
		try {
			const img = await loadImage(posterSrc);
			const c = samplePosterRegion(img);
			if (c) return c;
		} catch {
			/* fall through to banner */
		}
	}
	if (backdropSrc) {
		try {
			const img = await loadImage(backdropSrc);
			const c = sampleBannerMiddleRegion(img);
			if (c) return c;
		} catch {
			return null;
		}
	}
	return null;
}

/** @deprecated use sampleMediaHeroPalette */
export async function sampleBannerBackgroundTint(imageSrc: string): Promise<string | null> {
	const p = await sampleMediaHeroPalette(imageSrc, null);
	if (!p) return null;
	const mix = 0.42;
	const br = Math.round(20 + (1 - mix) * p.r * 0.85);
	const bg = Math.round(22 + (1 - mix) * p.g * 0.85);
	const bb = Math.round(28 + (1 - mix) * p.b * 0.82);
	return `rgb(${br}, ${bg}, ${bb})`;
}
