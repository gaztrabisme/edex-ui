import { createShortcut } from '@solid-primitives/keyboard';
import { type Event, listen } from '@tauri-apps/api/event';
import {
	batch,
	createEffect,
	createSignal,
	For,
	on,
	onCleanup,
	onMount,
	Show,
} from 'solid-js';
import Session from '@/components/terminal/session';
import TerminalSelectionTab from '@/components/terminal/tab';
import { useTauriEvent } from '@/lib/hooks/useTauriEvent';
import { errorLog } from '@/lib/log';
import { hasRunningChildren, terminateSession } from '@/lib/os';
import { useTerminal } from '@/lib/terminal';
import type { FileSystemStatus, TerminalContainer } from '@/models';

import './index.css';

function nextActiveTerminal(target: string, ids: string[]) {
	const idx = ids.indexOf(target);
	return ids[(idx + 1) % ids.length] || ids[0];
}

function TerminalSection() {
	const { active, setActive } = useTerminal();

	const [terminals, setTerminals] = createSignal<
		Map<string, TerminalContainer>
	>(new Map());

	const terminalIds = () => [...terminals().keys()];

	const [activitySet, setActivitySet] = createSignal<Set<string>>(new Set());
	const [cwdMap, setCwdMap] = createSignal<Record<string, string>>({});
	const [showCloseConfirm, setShowCloseConfirm] = createSignal(false);

	function markActivity(id: string) {
		if (active() !== id) {
			setActivitySet(prev => {
				if (prev.has(id)) return prev;
				const next = new Set(prev);
				next.add(id);
				return next;
			});
		}
	}

	// Track CWD from filesystem events
	useTauriEvent<FileSystemStatus>('files', payload => {
		const currentActive = active();
		setCwdMap(prev => ({ ...prev, [currentActive]: payload.path }));
	});

	onMount(() => {
		addTerminal();
	});

	createEffect(
		on(active, active => {
			const item = document.getElementById(`#${active}`);
			if (item) {
				item.scrollIntoView({ behavior: 'smooth', inline: 'center' });
			}
			// Clear activity indicator for newly active tab
			setActivitySet(prev => {
				if (!prev.has(active)) return prev;
				const next = new Set(prev);
				next.delete(active);
				return next;
			});
		}),
	);

	createShortcut(
		['Control', 'Tab'],
		() => {
			if (terminalIds().length === 1) {
				return;
			}
			setActive(prevState => nextActiveTerminal(prevState, terminalIds()));
		},
		{ preventDefault: true },
	);

	createShortcut(
		['Control', 'W'],
		async () => {
			try {
				const children = await hasRunningChildren(active());
				if (children) {
					setShowCloseConfirm(true);
				} else {
					await terminateSession(active());
				}
			} catch {
				await terminateSession(active());
			}
		},
		{ preventDefault: true },
	);

	createShortcut(['Control', 'T'], () => addTerminal(), {
		preventDefault: true,
	});

	const unListen = listen('destroy', async (e: Event<string>) => {
		const id = e.payload;
		const nextIndex = nextActiveTerminal(id, terminalIds());
		batch(() => {
			setActive(nextIndex);
			setTerminals(prevState => {
				const newMap = new Map(prevState);
				newMap.delete(id);
				return newMap;
			});
		});
	});

	onCleanup(() => {
		unListen.then(f => f()).catch(errorLog);
	});

	/**
	 * Create new terminal node
	 * Internally, will create a new pty sessions in the backend
	 * it will also handle updating the current index on creation.
	 */
	function addTerminal() {
		const id = crypto.randomUUID();
		batch(() => {
			setActive(id);
			setTerminals(prevState => {
				const newMap = new Map(prevState);
				newMap.set(id, {
					id,
					terminal: () => (
						<Session
							id={/* @once */ id}
							active={active}
							onActivity={markActivity}
						/>
					),
				});
				return newMap;
			});
		});
	}

	function reorderTabs(fromId: string, toId: string) {
		setTerminals(prev => {
			const entries = [...prev.entries()];
			const fromIdx = entries.findIndex(([k]) => k === fromId);
			const toIdx = entries.findIndex(([k]) => k === toId);
			if (fromIdx === -1 || toIdx === -1) return prev;
			const [moved] = entries.splice(fromIdx, 1);
			entries.splice(toIdx, 0, moved);
			return new Map(entries);
		});
	}

	async function switchTerminal(id: string) {
		setActive(id);
	}

	return (
		<section class="relative h-full flex-1 overflow-hidden pt-[2.5vh] sm:px-1 md:px-2 lg:px-3">
			<div
				class="shell augment-border flex size-full flex-col items-start justify-start"
				data-augmented-ui="bl-clip tr-clip border"
			>
				<TerminalSelectionTab
					addTerminal={addTerminal}
					active={active}
					terminalIds={terminalIds}
					switchTab={switchTerminal}
					cwdMap={cwdMap}
					activitySet={activitySet}
					reorderTabs={reorderTabs}
				/>
				<div class="m-0 size-full overflow-hidden">
					<For each={[...terminals().values()]}>
						{({ terminal }) => terminal()}
					</For>
				</div>
			</div>
			<Show when={showCloseConfirm()}>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
					<div class="border border-default bg-secondary p-6 text-main font-serif">
						<p class="mb-4">
							A process is still running in this terminal. Close anyway?
						</p>
						<div class="flex justify-end gap-3">
							<button
								type="button"
								class="cursor-pointer border border-default/50 px-4 py-1.5 hover:bg-active hover:text-active"
								onClick={() => setShowCloseConfirm(false)}
							>
								Cancel
							</button>
							<button
								type="button"
								class="cursor-pointer border border-default/50 bg-active px-4 py-1.5 text-active hover:opacity-80"
								onClick={() => {
									terminateSession(active()).catch(errorLog);
									setShowCloseConfirm(false);
								}}
							>
								Close
							</button>
						</div>
					</div>
				</div>
			</Show>
		</section>
	);
}

export default TerminalSection;
