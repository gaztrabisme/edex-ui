import { ClipboardAddon } from '@xterm/addon-clipboard';
import { FitAddon } from '@xterm/addon-fit';
import { ImageAddon } from '@xterm/addon-image';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { type ITerminalInitOnlyOptions, Terminal } from '@xterm/xterm';
import { warnLog } from '@/lib/log';
import type { Theme } from '@/lib/themes';
import generateTerminalTheme from '@/lib/themes/terminal';
import type { TerminalProps } from '@/models';

export type Addons = ReturnType<typeof getAddons>;

const OVERRIDE_KEY_MAP = [
	{ key: 'Tab', ctrlKey: true },
	{ key: 'W', ctrlKey: true },
	{ key: 'T', ctrlKey: true },
	{ key: 'f', ctrlKey: true },
];

const INITIAL_DEFAULT_OPTIONS: ITerminalInitOnlyOptions = {
	cols: 80,
	rows: 24,
};

export async function createTerminal(
	terminalContainer: HTMLDivElement,
	theme: Theme,
	initialFontSize: number,
	scrollback?: number,
): Promise<TerminalProps> {
	const term = new Terminal({
		fontSize: initialFontSize,
		scrollback: scrollback ?? 5000,
		...INITIAL_DEFAULT_OPTIONS,
		...generateTerminalTheme(theme),
	});

	const addons = getAddons();
	Object.values(addons).forEach(addon => term.loadAddon(addon));

	term.open(terminalContainer);

	try {
		const webglAddon = new WebglAddon();
		term.loadAddon(webglAddon);
	} catch (e) {
		await warnLog(`WebGL not supported, falling back to canvas. Error: ${e}`);
	}

	try {
		const imageAddon = new ImageAddon({
			enableSizeReports: true,
			pixelLimit: 16777216,
			sixelSupport: true,
			sixelScrolling: true,
			sixelPaletteLimit: 256,
		});
		term.loadAddon(imageAddon);
	} catch (e) {
		await warnLog(`ImageAddon failed to load. Error: ${e}`);
	}

	term.focus();
	addons.fit.fit();

	requestAnimationFrame(() => {
		initAddons(term, addons);
		overrideKeyEvent(term);
	});

	return { term, addons };
}

function getAddons() {
	return {
		fit: new FitAddon(),
		unicode11: new Unicode11Addon(),
		clipboard: new ClipboardAddon(),
		webLink: new WebLinksAddon(),
		search: new SearchAddon(),
	};
}

function initAddons(term: Terminal, _addons: Addons): void {
	term.unicode.activeVersion = '11';
}

function overrideKeyEvent(term: Terminal) {
	term.attachCustomKeyEventHandler(e => {
		if (e.type === 'keydown') {
			const isMac = e.metaKey && !e.ctrlKey && !e.shiftKey;
			const isLinux = e.ctrlKey && e.shiftKey;

			// copy
			if ((isMac || isLinux) && e.code === 'KeyC') {
				e.preventDefault();
				const selection = term.getSelection();
				if (selection) {
					navigator.clipboard.writeText(selection);
				}
				return false;
			}

			// paste
			// https://github.com/xtermjs/xterm.js/issues/2478#issuecomment-2325204572
			if ((isMac || isLinux) && e.code === 'KeyV') {
				return false;
			}

			// command history popup
			if (isLinux && e.code === 'KeyH') {
				return false;
			}

			for (const entry of OVERRIDE_KEY_MAP) {
				if (
					entry.key.toLowerCase() === e.key.toLowerCase() &&
					entry.ctrlKey === e.ctrlKey
				) {
					return false;
				}
			}
		}
		return true;
	});
}
