import { type Event, listen } from '@tauri-apps/api/event';
import type { ITerminalDimensions } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';
import { errorLog, traceLog } from '@/lib/log';
import {
	initializeSession,
	resizeSession,
	updateCurrentSession,
	writeToSession,
} from '@/lib/os';
import { getScrollback } from '@/lib/setting';
import { type Addons, createTerminal } from '@/lib/terminal';
import { useTheme } from '@/lib/themes';
import generateTerminalTheme from '@/lib/themes/terminal';
import { cn } from '@/lib/utils';
import type { TerminalProps } from '@/models';
import '@xterm/xterm/css/xterm.css';
import {
	type Accessor,
	createEffect,
	createSignal,
	on,
	onCleanup,
	onMount,
	Show,
} from 'solid-js';
import ContextMenu from '@/components/terminal/context-menu';
import HistoryPopup from '@/components/terminal/history';
import SearchBar from '@/components/terminal/search';

/**
 * GCD of screen width and height, used to detect aspect ratio.
 * - GCD 100 = 32:9 ultrawide (e.g. 5120x1440 -> 5120/100=51.2, but actually 3200x900 etc.)
 * - GCD 256 = 16:9 at certain resolutions (e.g. 3840x2160 -> 3840/256=15, 2160/256=8.4...)
 */
const SCREEN_GCD_ULTRAWIDE = 100;
const SCREEN_GCD_16_9 = 256;

/** Extra columns/rows added to fit-addon dimensions to compensate for aspect ratio quirks (see #302) */
const DEFAULT_EXTRA_COLS = 1;
const DEFAULT_EXTRA_ROWS = 0;
const ULTRAWIDE_EXTRA_COLS = 3;
const ULTRAWIDE_EXTRA_ROWS = 1;
const WIDESCREEN_EXTRA_COLS = 2;

/** Screen width breakpoints for terminal font size selection */
const FONT_SIZE_BREAKPOINT_SM = 1920;
const FONT_SIZE_BREAKPOINT_MD = 2560;
const FONT_SIZE_BREAKPOINT_LG = 3840;
const FONT_SIZE_SM = 12;
const FONT_SIZE_MD = 14;
const FONT_SIZE_LG = 16;
const FONT_SIZE_XL = 20;

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

async function resize(id: string, term: Terminal, addons: Addons) {
	const fitAddon = addons.fit;
	if (!fitAddon.proposeDimensions()) {
		await errorLog('Fail to get propose dimensions');
		return;
	}
	let { cols, rows } = fitAddon.proposeDimensions() as ITerminalDimensions;

	// Apply custom fixes based on screen ratio, see #302
	const d = gcd(screen.width, screen.height);
	let extraCols = DEFAULT_EXTRA_COLS;
	let extraRows = DEFAULT_EXTRA_ROWS;

	if (d === SCREEN_GCD_ULTRAWIDE) {
		extraCols = ULTRAWIDE_EXTRA_COLS;
		extraRows = ULTRAWIDE_EXTRA_ROWS;
	} else if (d === SCREEN_GCD_16_9) {
		extraCols = WIDESCREEN_EXTRA_COLS;
	}

	cols = cols + extraCols;
	rows = rows + extraRows;

	if (term.cols !== cols || term.rows !== rows) {
		term.resize(cols, rows);
		fitAddon.fit();
		await resizeSession(id, term.rows, term.cols);
	}
}

function useScreenWidth(): Accessor<number> {
	const [screenWidth, setScreenWidth] = createSignal(window.innerWidth);

	const handler = () => setScreenWidth(window.innerWidth);
	window.addEventListener('resize', handler);
	onCleanup(() => window.removeEventListener('resize', handler));

	return screenWidth;
}

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 32;

interface SessionProps {
	id: string;
	active: Accessor<string>;
	onActivity?: (id: string) => void;
}

function Session({ id, active, onActivity }: SessionProps) {
	const { theme } = useTheme();

	const controller = new AbortController();

	// fontSize
	const screenWidth = useScreenWidth();
	const baseFontSize = () => {
		if (screenWidth() < FONT_SIZE_BREAKPOINT_SM) {
			return FONT_SIZE_SM;
		} else if (screenWidth() < FONT_SIZE_BREAKPOINT_MD) {
			return FONT_SIZE_MD;
		} else if (screenWidth() < FONT_SIZE_BREAKPOINT_LG) {
			return FONT_SIZE_LG;
		}
		return FONT_SIZE_XL;
	};

	const [fontSizeOffset, setFontSizeOffset] = createSignal(0);
	const fontSize = () =>
		Math.max(
			FONT_SIZE_MIN,
			Math.min(FONT_SIZE_MAX, baseFontSize() + fontSizeOffset()),
		);

	const [showSearch, setShowSearch] = createSignal(false);
	const [showHistory, setShowHistory] = createSignal(false);
	const [contextMenu, setContextMenu] = createSignal<{
		x: number;
		y: number;
	} | null>(null);

	let terminalEl: HTMLDivElement | undefined;
	let terminal: TerminalProps | undefined;

	async function resizeTerminal(id: string) {
		if (terminal) {
			await resize(id, terminal.term, terminal.addons);
		}
	}

	onMount(async () => {
		try {
			await traceLog(`Initialize terminal interface. Id: ${id}`);
			if (!terminalEl) {
				await errorLog(
					'terminalEl is undefined in onMount, this should not happen',
				);
				return;
			}
			const scrollback = await getScrollback();
			terminal = await createTerminal(
				terminalEl,
				theme(),
				fontSize(),
				scrollback,
			);

			await initializeSession(id);

			await resize(id, terminal.term, terminal.addons);

			terminal.term.onData(v => writeToSession(id, v));

			// Copy on select
			const term = terminal.term;
			term.onSelectionChange(() => {
				const sel = term.getSelection();
				if (sel) {
					navigator.clipboard.writeText(sel);
				}
			});

			// Visual bell flash
			term.onBell(() => {
				if (terminalEl) {
					terminalEl.classList.add('bell-flash');
					setTimeout(() => terminalEl?.classList.remove('bell-flash'), 200);
				}
			});

			addEventListener('resize', () => resizeTerminal(id), {
				signal: controller.signal,
			});

			terminal.term.focus();
		} catch (e) {
			await errorLog(e);
		}
	});

	// refocus on tab change
	createEffect(
		on(active, async active => {
			try {
				if (active === id) {
					await resizeTerminal(id);
					terminal?.term.focus();
					await updateCurrentSession(id);
				} else {
					terminal?.term.blur();
				}
			} catch (e) {
				await errorLog(e);
			}
		}),
	);

	// sync terminal theme
	createEffect(
		on(theme, async theme => {
			if (terminal?.term) {
				terminal.term.options = { ...generateTerminalTheme(theme) };
			}
		}),
	);

	// sync terminal font size
	createEffect(
		on(fontSize, async fontSize => {
			if (terminal?.term) {
				terminal.term.options.fontSize = fontSize;
			}
		}),
	);

	const unListen = listen(`data-${id}`, (e: Event<string>) => {
		terminal?.term.write(e.payload);
		if (active() !== id && onActivity) {
			onActivity(id);
		}
	});

	function handleKeyboardShortcuts(e: KeyboardEvent) {
		if (active() !== id) return;

		if (e.ctrlKey && e.key === 'f') {
			e.preventDefault();
			setShowSearch(true);
		}
		if (e.ctrlKey && e.shiftKey && e.key === 'H') {
			e.preventDefault();
			setShowHistory(true);
		}

		// Clear scrollback
		if (e.ctrlKey && e.shiftKey && e.key === 'K') {
			e.preventDefault();
			terminal?.term.clear();
		}

		// Font size zoom
		if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
			e.preventDefault();
			if (fontSize() < FONT_SIZE_MAX) {
				setFontSizeOffset(prev => prev + 1);
				resizeTerminal(id);
			}
		}
		if (e.ctrlKey && e.key === '-') {
			e.preventDefault();
			if (fontSize() > FONT_SIZE_MIN) {
				setFontSizeOffset(prev => prev - 1);
				resizeTerminal(id);
			}
		}
		if (e.ctrlKey && e.key === '0') {
			e.preventDefault();
			setFontSizeOffset(0);
			resizeTerminal(id);
		}
	}

	window.addEventListener('keydown', handleKeyboardShortcuts, {
		signal: controller.signal,
	});

	onCleanup(() => {
		terminal?.term.dispose();
		unListen.then(f => f()).catch(errorLog);
		controller.abort();
	});

	return (
		<div
			class={cn(active() !== id && 'hidden', 'relative size-full p-2')}
			onContextMenu={e => {
				e.preventDefault();
				setContextMenu({ x: e.clientX, y: e.clientY });
			}}
		>
			<Show when={showSearch() && terminal?.addons.search}>
				{addon => (
					<SearchBar
						searchAddon={addon()}
						onClose={() => {
							setShowSearch(false);
							terminal?.term.focus();
						}}
					/>
				)}
			</Show>
			<Show when={showHistory() && terminal}>
				<HistoryPopup
					onSelect={(cmd: string) => {
						writeToSession(id, cmd);
						setShowHistory(false);
						terminal?.term.focus();
					}}
					onClose={() => {
						setShowHistory(false);
						terminal?.term.focus();
					}}
				/>
			</Show>
			<Show when={contextMenu() && terminal ? contextMenu() : null}>
				{pos => (
					<ContextMenu
						x={pos().x}
						y={pos().y}
						terminal={terminal?.term as Terminal}
						sessionId={id}
						onClose={() => {
							setContextMenu(null);
							terminal?.term.focus();
						}}
						onSearch={() => setShowSearch(true)}
						onHistory={() => setShowHistory(true)}
					/>
				)}
			</Show>
			<div class="size-full" ref={el => (terminalEl = el)} />
		</div>
	);
}

export default Session;
