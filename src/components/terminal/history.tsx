import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { readHistory } from '@/lib/os';

interface HistoryPopupProps {
	onSelect: (command: string) => void;
	onClose: () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
	const lower = text.toLowerCase();
	const q = query.toLowerCase();
	let qi = 0;
	for (let i = 0; i < lower.length && qi < q.length; i++) {
		if (lower[i] === q[qi]) {
			qi++;
		}
	}
	return qi === q.length;
}

function HistoryPopup(props: HistoryPopupProps) {
	const [query, setQuery] = createSignal('');
	const [history, setHistory] = createSignal<string[]>([]);
	const [selectedIndex, setSelectedIndex] = createSignal(0);
	const [loading, setLoading] = createSignal(true);

	let inputRef: HTMLInputElement | undefined;
	let listRef: HTMLDivElement | undefined;

	const filtered = () => {
		const q = query();
		if (!q) return history();
		return history().filter(cmd => fuzzyMatch(q, cmd));
	};

	onMount(async () => {
		try {
			const items = await readHistory();
			setHistory(items);
		} catch (_) {
			setHistory([]);
		}
		setLoading(false);
		inputRef?.focus();
	});

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			props.onClose();
			return;
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			setSelectedIndex(i => Math.min(i + 1, filtered().length - 1));
			scrollToSelected();
			return;
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			setSelectedIndex(i => Math.max(i - 1, 0));
			scrollToSelected();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			const items = filtered();
			if (items.length > 0) {
				props.onSelect(items[selectedIndex()]);
			}
			return;
		}
	}

	function scrollToSelected() {
		requestAnimationFrame(() => {
			const el = listRef?.querySelector('[data-selected="true"]');
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	function handleClickOutside(e: MouseEvent) {
		const popup = document.getElementById('history-popup');
		if (popup && !popup.contains(e.target as Node)) {
			props.onClose();
		}
	}

	onMount(() => {
		document.addEventListener('mousedown', handleClickOutside);
	});

	onCleanup(() => {
		document.removeEventListener('mousedown', handleClickOutside);
	});

	return (
		<div
			id="history-popup"
			class="absolute inset-0 z-40 flex items-center justify-center"
		>
			<div
				class="border-default bg-secondary flex max-h-[60%] w-[60%] flex-col overflow-hidden border-2 border-solid shadow-lg"
				onKeyDown={handleKeyDown}
			>
				<div class="border-default flex items-center border-b border-solid px-3 py-2">
					<span class="text-main font-united_sans_light mr-3 text-sm uppercase tracking-wider opacity-60">
						History
					</span>
					<input
						ref={el => (inputRef = el)}
						type="text"
						class="bg-main text-main border-default flex-1 border border-solid px-2 py-1 font-mono text-sm focus:outline-hidden"
						placeholder="Type to filter..."
						value={query()}
						onInput={e => {
							setQuery(e.currentTarget.value);
							setSelectedIndex(0);
						}}
					/>
				</div>
				<div ref={el => (listRef = el)} class="flex-1 overflow-y-auto">
					<Show
						when={!loading()}
						fallback={
							<div class="text-main p-4 text-center text-sm opacity-60">
								Loading history...
							</div>
						}
					>
						<Show
							when={filtered().length > 0}
							fallback={
								<div class="text-main p-4 text-center text-sm opacity-60">
									No matching commands
								</div>
							}
						>
							<For each={filtered().slice(0, 200)}>
								{(cmd, i) => (
									<button
										type="button"
										data-selected={i() === selectedIndex()}
										class={`w-full cursor-pointer px-3 py-1 text-left font-mono text-sm ${
											i() === selectedIndex()
												? 'bg-active text-active'
												: 'text-main hover:bg-active hover:text-active'
										}`}
										onClick={() => props.onSelect(cmd)}
									>
										{cmd}
									</button>
								)}
							</For>
						</Show>
					</Show>
				</div>
				<div class="border-default text-main border-t border-solid px-3 py-1 text-xs opacity-50">
					<span class="mr-4">Up/Down: navigate</span>
					<span class="mr-4">Enter: select</span>
					<span>Esc: close</span>
				</div>
			</div>
		</div>
	);
}

export default HistoryPopup;
