import { BACKWARD, DIRECTORY, type FileType, SETTING } from '@/models';

type FileCategory =
	| 'folder'
	| 'code'
	| 'config'
	| 'document'
	| 'media'
	| 'archive'
	| 'executable'
	| 'dim';

const EXT_MAP: Record<string, FileCategory> = {
	// Code
	ts: 'code',
	tsx: 'code',
	js: 'code',
	jsx: 'code',
	rs: 'code',
	py: 'code',
	css: 'code',
	html: 'code',
	htm: 'code',
	vue: 'code',
	svelte: 'code',
	go: 'code',
	java: 'code',
	c: 'code',
	cpp: 'code',
	h: 'code',
	hpp: 'code',
	rb: 'code',
	php: 'code',
	swift: 'code',
	kt: 'code',
	scala: 'code',
	lua: 'code',
	zig: 'code',
	// Config
	json: 'config',
	toml: 'config',
	yaml: 'config',
	yml: 'config',
	env: 'config',
	conf: 'config',
	ini: 'config',
	xml: 'config',
	lock: 'config',
	editorconfig: 'config',
	// Document
	md: 'document',
	txt: 'document',
	pdf: 'document',
	doc: 'document',
	docx: 'document',
	rtf: 'document',
	csv: 'document',
	log: 'document',
	// Media
	png: 'media',
	jpg: 'media',
	jpeg: 'media',
	gif: 'media',
	svg: 'media',
	webp: 'media',
	ico: 'media',
	mp4: 'media',
	mp3: 'media',
	wav: 'media',
	webm: 'media',
	ogg: 'media',
	avi: 'media',
	mkv: 'media',
	flac: 'media',
	// Archive
	zip: 'archive',
	tar: 'archive',
	gz: 'archive',
	'7z': 'archive',
	rar: 'archive',
	bz2: 'archive',
	xz: 'archive',
	deb: 'archive',
	rpm: 'archive',
	// Executable
	sh: 'executable',
	bash: 'executable',
	zsh: 'executable',
	exe: 'executable',
	bin: 'executable',
	appimage: 'executable',
};

const DIM_NAMES = new Set([
	'.git',
	'.gitignore',
	'.gitmodules',
	'node_modules',
	'target',
	'.DS_Store',
	'__pycache__',
	'.cache',
	'.vscode',
	'.idea',
]);

/** Hue shift in degrees from the base text-main color */
const HUE_SHIFTS: Record<FileCategory, number> = {
	folder: 0,
	code: -60,
	config: -120,
	document: 0, // desaturated
	media: 120,
	archive: 180,
	executable: -90,
	dim: 0,
};

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	h = ((h % 360) + 360) % 360;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}
	return [
		Math.round((r + m) * 255),
		Math.round((g + m) * 255),
		Math.round((b + m) * 255),
	];
}

function getCategory(name: string, fileType: FileType): FileCategory {
	if (fileType === DIRECTORY || fileType === BACKWARD || fileType === SETTING)
		return 'folder';
	if (DIM_NAMES.has(name)) return 'dim';
	// Check dotfiles (e.g. .bashrc, .zshrc) — treat as config
	if (name.startsWith('.') && !name.includes('.', 1)) return 'config';
	const ext = name.includes('.')
		? (name.split('.').pop()?.toLowerCase() ?? '')
		: '';
	// Makefile, Dockerfile, etc.
	if (!ext) {
		const lower = name.toLowerCase();
		if (lower === 'makefile' || lower === 'dockerfile' || lower === 'justfile')
			return 'config';
		return 'folder'; // fallback — use base color
	}
	return EXT_MAP[ext] ?? 'folder';
}

/** Read --text-main RGB triplet from CSS custom properties */
function getBaseRgb(): [number, number, number] {
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue('--text-main')
		.trim();
	const parts = raw.split(/\s+/).map(Number);
	return [parts[0], parts[1], parts[2]];
}

let cachedTheme = '';
let cachedColors: Map<FileCategory, string> = new Map();

function buildColorMap(): Map<FileCategory, string> {
	const [r, g, b] = getBaseRgb();
	const [h, s, l] = rgbToHsl(r, g, b);
	const map = new Map<FileCategory, string>();

	// For achromatic themes (like APOLLO), inject some saturation
	const effectiveS = s < 0.1 ? 0.35 : s;

	for (const cat of Object.keys(HUE_SHIFTS) as FileCategory[]) {
		if (cat === 'dim') {
			map.set(cat, `rgba(${r}, ${g}, ${b}, 0.4)`);
			continue;
		}
		if (cat === 'document') {
			// Desaturated version of base
			const [dr, dg, db] = hslToRgb(
				h,
				effectiveS * 0.2,
				Math.min(l + 0.1, 0.9),
			);
			map.set(cat, `rgb(${dr}, ${dg}, ${db})`);
			continue;
		}
		if (cat === 'folder') {
			map.set(cat, `rgb(${r}, ${g}, ${b})`);
			continue;
		}
		const newH = h + HUE_SHIFTS[cat];
		const [nr, ng, nb] = hslToRgb(newH, effectiveS, l);
		map.set(cat, `rgb(${nr}, ${ng}, ${nb})`);
	}
	return map;
}

/** Get the theme-derived color for a file based on its name and type. */
export function getFileColor(name: string, fileType: FileType): string {
	// Check if theme changed (cheap check via CSS var)
	const currentTheme =
		document.documentElement.getAttribute('data-theme') ?? '';
	if (currentTheme !== cachedTheme) {
		cachedTheme = currentTheme;
		cachedColors = buildColorMap();
	}
	const category = getCategory(name, fileType);
	return cachedColors.get(category) ?? cachedColors.get('folder') ?? '';
}
