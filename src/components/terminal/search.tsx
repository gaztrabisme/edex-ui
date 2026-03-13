import type { SearchAddon } from '@xterm/addon-search';
import { createSignal, onCleanup, onMount } from 'solid-js';

/** Read a CSS custom property containing an RGB triplet (e.g. "170 207 209")
 *  and return a hex color string with optional alpha (0-255). */
function themeHex(varName: string, alpha = 255): string {
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue(varName)
		.trim();
	const [r, g, b] = raw.split(/\s+/).map(Number);
	const hex = (n: number) => n.toString(16).padStart(2, '0');
	return alpha >= 255
		? `#${hex(r)}${hex(g)}${hex(b)}`
		: `#${hex(r)}${hex(g)}${hex(b)}${hex(alpha)}`;
}

function getSearchDecorations() {
	const match = themeHex('--text-main', 0x40);
	const matchBorder = themeHex('--text-main', 0x60);
	const matchFull = themeHex('--text-main');
	const active = themeHex('--bg-active', 0x80);
	const activeFull = themeHex('--bg-active');
	return {
		matchBackground: match,
		matchBorder: matchBorder,
		matchOverviewRuler: matchFull,
		activeMatchBackground: active,
		activeMatchBorder: activeFull,
		activeMatchColorOverviewRuler: activeFull,
	};
}

interface SearchBarProps {
	searchAddon: SearchAddon;
	onClose: () => void;
}

function SearchBar(props: SearchBarProps) {
	let inputEl: HTMLInputElement | undefined;

	const [query, setQuery] = createSignal('');
	const [matchInfo, setMatchInfo] = createSignal('');

	const searchDecorations = getSearchDecorations();

	const resultsDisposable = props.searchAddon.onDidChangeResults(e => {
		if (e.resultCount > 0) {
			setMatchInfo(`${e.resultIndex + 1}/${e.resultCount}`);
		} else if (query().length > 0) {
			setMatchInfo('0/0');
		} else {
			setMatchInfo('');
		}
	});

	function findNext() {
		if (!query()) return;
		props.searchAddon.findNext(query(), {
			incremental: false,
			decorations: searchDecorations,
		});
	}

	function findPrevious() {
		if (!query()) return;
		props.searchAddon.findPrevious(query(), {
			decorations: searchDecorations,
		});
	}

	function handleInput(value: string) {
		setQuery(value);
		if (value) {
			props.searchAddon.findNext(value, {
				incremental: true,
				decorations: searchDecorations,
			});
		} else {
			props.searchAddon.clearDecorations();
			setMatchInfo('');
		}
	}

	function handleInputKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && e.shiftKey) {
			e.preventDefault();
			findPrevious();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			findNext();
		}
	}

	function close() {
		try {
			props.searchAddon.clearDecorations();
		} catch (_) {
			// ignore if addon is already disposed
		}
		props.onClose();
	}

	// Global Escape listener — works regardless of focus
	function handleGlobalKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
		}
	}

	onMount(() => {
		inputEl?.focus();
		document.addEventListener('keydown', handleGlobalKeyDown, true);
	});

	onCleanup(() => {
		document.removeEventListener('keydown', handleGlobalKeyDown, true);
		try {
			props.searchAddon.clearDecorations();
		} catch (_) {
			// ignore
		}
		resultsDisposable.dispose();
	});

	return (
		<div
			class="absolute top-2 right-2 z-50 flex items-center gap-1 rounded border border-default bg-secondary px-2 py-1 shadow-lg"
			onMouseDown={e => e.stopPropagation()}
		>
			<input
				ref={el => (inputEl = el)}
				type="text"
				value={query()}
				onInput={e => handleInput(e.currentTarget.value)}
				onKeyDown={handleInputKeyDown}
				placeholder="Search..."
				class="w-40 border-none bg-transparent text-sm text-main outline-none placeholder:text-main/50"
			/>
			{matchInfo() && (
				<span class="whitespace-nowrap text-xs text-main opacity-60">
					{matchInfo()}
				</span>
			)}
			<button
				type="button"
				onClick={() => findPrevious()}
				class="px-1 text-sm text-main opacity-70 hover:opacity-100"
				title="Previous (Shift+Enter)"
			>
				&#x25B2;
			</button>
			<button
				type="button"
				onClick={() => findNext()}
				class="px-1 text-sm text-main opacity-70 hover:opacity-100"
				title="Next (Enter)"
			>
				&#x25BC;
			</button>
			<button
				type="button"
				onClick={() => close()}
				class="px-1 text-sm text-main opacity-70 hover:opacity-100"
				title="Close (Escape)"
			>
				&#x2715;
			</button>
		</div>
	);
}

export default SearchBar;
