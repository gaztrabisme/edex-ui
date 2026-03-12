import type { Terminal } from '@xterm/xterm';
import { onCleanup, onMount } from 'solid-js';
import { writeToSession } from '@/lib/os';

interface ContextMenuProps {
	x: number;
	y: number;
	terminal: Terminal;
	sessionId: string;
	onClose: () => void;
	onSearch: () => void;
	onHistory?: () => void;
}

interface MenuItem {
	label: string;
	shortcut?: string;
	disabled?: boolean;
	divider?: boolean;
	action: () => void;
}

function ContextMenu(props: ContextMenuProps) {
	let menuRef: HTMLDivElement | undefined;

	const hasSelection = () => {
		const sel = props.terminal.getSelection();
		return sel !== undefined && sel.length > 0;
	};

	const items: MenuItem[] = [
		{
			label: 'Copy',
			shortcut: 'Ctrl+Shift+C',
			disabled: !hasSelection(),
			action: () => {
				const text = props.terminal.getSelection();
				if (text) {
					navigator.clipboard.writeText(text);
				}
				props.onClose();
			},
		},
		{
			label: 'Paste',
			shortcut: 'Ctrl+Shift+V',
			action: async () => {
				try {
					const text = await navigator.clipboard.readText();
					if (text) {
						await writeToSession(props.sessionId, text);
					}
				} catch (_) {
					// clipboard access denied
				}
				props.onClose();
			},
		},
		{
			label: 'Select All',
			shortcut: 'Ctrl+Shift+A',
			action: () => {
				props.terminal.selectAll();
				props.onClose();
			},
		},
		{
			label: 'Clear Terminal',
			shortcut: 'Ctrl+Shift+K',
			action: () => {
				props.terminal.clear();
				props.onClose();
			},
		},
		{
			label: '',
			divider: true,
			action: () => {
				/* divider - no action */
			},
		},
		{
			label: 'Search',
			shortcut: 'Ctrl+F',
			action: () => {
				props.onSearch();
				props.onClose();
			},
		},
		{
			label: 'Command History',
			shortcut: 'Ctrl+Shift+H',
			action: () => {
				props.onHistory?.();
				props.onClose();
			},
		},
	];

	function handleClickOutside(e: MouseEvent) {
		if (menuRef && !menuRef.contains(e.target as Node)) {
			props.onClose();
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			props.onClose();
		}
	}

	onMount(() => {
		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleKeyDown);

		// Adjust position if menu would overflow viewport
		if (menuRef) {
			const rect = menuRef.getBoundingClientRect();
			if (rect.right > window.innerWidth) {
				menuRef.style.left = `${window.innerWidth - rect.width - 4}px`;
			}
			if (rect.bottom > window.innerHeight) {
				menuRef.style.top = `${window.innerHeight - rect.height - 4}px`;
			}
		}
	});

	onCleanup(() => {
		document.removeEventListener('mousedown', handleClickOutside);
		document.removeEventListener('keydown', handleKeyDown);
	});

	return (
		<div
			ref={el => (menuRef = el)}
			class="fixed z-50 min-w-[200px] border border-default bg-secondary py-1 font-serif text-sm text-main shadow-lg"
			style={{ left: `${props.x}px`, top: `${props.y}px` }}
		>
			{items.map(item =>
				item.divider ? (
					<div class="my-1 border-t border-default/30" />
				) : (
					<button
						type="button"
						class={`flex w-full items-center justify-between px-3 py-1.5 text-left ${
							item.disabled
								? 'cursor-default opacity-40'
								: 'cursor-pointer hover:bg-active hover:text-active'
						}`}
						disabled={item.disabled}
						onClick={() => item.action()}
					>
						<span>{item.label}</span>
						{item.shortcut && (
							<span class="ml-6 text-xs opacity-50">{item.shortcut}</span>
						)}
					</button>
				),
			)}
		</div>
	);
}

export default ContextMenu;
