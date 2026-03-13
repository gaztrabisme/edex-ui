import { createSignal, Show } from 'solid-js';
import BootAnimation from '@/components/boot';
import '@/components/boot/index.css';
import PanelErrorBoundary from '@/components/error-boundary';
import '@/components/error-boundary/index.css';
import FileSystem from '@/components/filesystem';
import Network from '@/components/network';
import System from '@/components/system';
import Terminal from '@/components/terminal';

function App() {
	const [booted, setBooted] = createSignal(false);

	return (
		<>
			<Show when={!booted()}>
				<BootAnimation onComplete={() => setBooted(true)} />
			</Show>
			<div
				class="bg-main text-main flex h-screen w-full flex-row flex-nowrap overflow-hidden"
				classList={{ 'opacity-0': !booted(), 'animate-fade': booted() }}
			>
				<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
					<div class="flex h-[62vh] w-full shrink-0 flex-row flex-nowrap overflow-hidden">
						<PanelErrorBoundary name="SYSTEM">
							<System />
						</PanelErrorBoundary>
						<PanelErrorBoundary name="TERMINAL">
							<Terminal />
						</PanelErrorBoundary>
					</div>
					<PanelErrorBoundary name="FILESYSTEM">
						<FileSystem />
					</PanelErrorBoundary>
				</div>
				<PanelErrorBoundary name="NETWORK">
					<Network />
				</PanelErrorBoundary>
			</div>
		</>
	);
}

export default App;
