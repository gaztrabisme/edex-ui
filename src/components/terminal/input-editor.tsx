import {
	defaultKeymap,
	history,
	historyKeymap,
	insertNewlineAndIndent,
} from '@codemirror/commands';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { type Accessor, createEffect, on, onCleanup, onMount } from 'solid-js';
import { selectStyle, type Theme } from '@/lib/themes/styles';

interface InputEditorProps {
	theme: Accessor<Theme>;
	onSubmit: (text: string) => void;
	onRawKey?: (key: string) => void;
	visible: Accessor<boolean>;
	fontSize: Accessor<number>;
}

function buildThemeExtension(theme: Theme, fontSize: number) {
	const style = selectStyle(theme);
	return EditorView.theme({
		'&': {
			backgroundColor: 'transparent',
			fontSize: `${fontSize}px`,
			maxHeight: '40vh',
		},
		'.cm-content': {
			fontFamily: `"${style.terminal.fontFamily}", monospace`,
			color: style.terminal.foreground,
			caretColor: style.terminal.cursor,
			padding: '4px 0',
			minHeight: '1.5em',
		},
		'.cm-cursor': {
			borderLeftColor: style.terminal.cursor,
			borderLeftWidth: '2px',
		},
		'.cm-focused': {
			outline: 'none',
		},
		'.cm-scroller': {
			overflow: 'auto',
		},
		'.cm-line': {
			padding: '0 4px',
		},
		'.cm-selectionBackground': {
			backgroundColor: `${style.terminal.foreground}33 !important`,
		},
		'&.cm-focused .cm-selectionBackground': {
			backgroundColor: `${style.terminal.foreground}44 !important`,
		},
		'.cm-placeholder': {
			color: `${style.terminal.foreground}55`,
			fontStyle: 'italic',
		},
		'.cm-gutters': {
			display: 'none',
		},
	});
}

/**
 * Rich text input editor for terminal commands.
 * - Enter submits the command
 * - Shift+Enter inserts a newline
 * - Arrow keys navigate within the editor
 * - Full text editing (select, cut, copy, paste)
 */
function InputEditor(props: InputEditorProps) {
	let containerEl: HTMLDivElement | undefined;
	let view: EditorView | undefined;
	const themeCompartment = new Compartment();

	function submit() {
		if (!view) return;
		const text = view.state.doc.toString();
		if (text.trim()) {
			props.onSubmit(text);
		}
		// Clear editor
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length },
		});
	}

	const submitKeymap = keymap.of([
		{
			key: 'Enter',
			run: () => {
				submit();
				return true;
			},
		},
		{
			key: 'Shift-Enter',
			run: insertNewlineAndIndent,
		},
		{
			key: 'Ctrl-c',
			run: () => {
				if (view?.state.selection.main.empty) {
					// Send interrupt signal and clear editor
					props.onRawKey?.('\x03');
					view.dispatch({
						changes: { from: 0, to: view.state.doc.length },
					});
					return true;
				}
				return false; // Let default copy handle it with selection
			},
		},
		{
			key: 'Tab',
			run: () => {
				props.onRawKey?.('\t');
				return true;
			},
		},
		{
			key: 'ArrowUp',
			run: v => {
				const line = v.state.doc.lineAt(v.state.selection.main.head);
				if (line.number === 1) {
					props.onRawKey?.('\x1b[A');
					return true;
				}
				return false;
			},
		},
		{
			key: 'ArrowDown',
			run: v => {
				const line = v.state.doc.lineAt(v.state.selection.main.head);
				if (line.number === v.state.doc.lines) {
					props.onRawKey?.('\x1b[B');
					return true;
				}
				return false;
			},
		},
	]);

	onMount(() => {
		if (!containerEl) return;

		const state = EditorState.create({
			doc: '',
			extensions: [
				submitKeymap,
				keymap.of([...defaultKeymap, ...historyKeymap]),
				history(),
				placeholder('Type a command...'),
				themeCompartment.of(
					buildThemeExtension(props.theme(), props.fontSize()),
				),
				EditorView.lineWrapping,
			],
		});

		view = new EditorView({
			state,
			parent: containerEl,
		});
	});

	// Update theme/font size via compartment reconfiguration
	createEffect(
		on(
			() => [props.theme(), props.fontSize()] as const,
			([theme, fontSize]) => {
				if (!view) return;
				view.dispatch({
					effects: themeCompartment.reconfigure(
						buildThemeExtension(theme, fontSize),
					),
				});
			},
		),
	);

	// Focus management
	createEffect(
		on(props.visible, visible => {
			if (visible && view) {
				requestAnimationFrame(() => view?.focus());
			}
		}),
	);

	onCleanup(() => {
		view?.destroy();
	});

	return (
		<div
			class="input-editor-container"
			classList={{ hidden: !props.visible() }}
			style={{
				'border-top': '1px solid var(--color-default, #333)',
				padding: '4px 8px',
				background: 'rgba(0, 0, 0, 0.3)',
			}}
		>
			<div class="flex items-center gap-2">
				<span
					class="select-none text-xs opacity-50"
					style={{ color: 'var(--color-main, #aacfd1)' }}
				>
					&#10095;
				</span>
				<div class="flex-1" ref={el => (containerEl = el)} />
			</div>
			<div
				class="mt-1 select-none text-right font-mono text-xs opacity-30"
				style={{ color: 'var(--color-main, #aacfd1)' }}
			>
				Enter to run | Shift+Enter for newline | Ctrl+Shift+E for raw mode
			</div>
		</div>
	);
}

export default InputEditor;
