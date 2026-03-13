import type { JSX } from 'solid-js';
import { ErrorBoundary } from 'solid-js';

interface PanelErrorBoundaryProps {
	name: string;
	children: JSX.Element;
}

function PanelFallback(props: {
	name: string;
	error: Error;
	reset: () => void;
}) {
	return (
		<div class="bg-main border-default/30 flex h-full w-full flex-col items-center justify-center gap-4 border border-solid p-4">
			<div
				class="text-main panel-error-pulse font-united_sans_medium tracking-[0.3em] uppercase"
				style={{ 'font-size': 'clamp(0.7rem, 1.2vw, 1.4rem)' }}
			>
				SYSTEM MALFUNCTION
			</div>
			<div
				class="text-main max-w-full truncate text-center opacity-40 font-serif"
				style={{ 'font-size': 'clamp(8px, 0.6vw, 11px)' }}
			>
				{props.name} :: {props.error.message}
			</div>
			<button
				type="button"
				class="border-default/60 text-main cursor-pointer border border-solid bg-transparent px-4 py-1 tracking-[0.2em] uppercase opacity-60 transition-opacity hover:opacity-100 font-serif"
				style={{ 'font-size': 'clamp(8px, 0.6vw, 11px)' }}
				onClick={props.reset}
			>
				[ RESTART MODULE ]
			</button>
		</div>
	);
}

export default function PanelErrorBoundary(props: PanelErrorBoundaryProps) {
	return (
		<ErrorBoundary
			fallback={(error, reset) => (
				<PanelFallback name={props.name} error={error} reset={reset} />
			)}
		>
			{props.children}
		</ErrorBoundary>
	);
}
