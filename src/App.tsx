import FileSystem from '@/components/filesystem';
import Network from '@/components/network';
import System from '@/components/system';
import Terminal from '@/components/terminal';

function App() {
	return (
		<div class="bg-main text-main flex h-screen w-full flex-row flex-nowrap overflow-hidden">
			<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
				<div class="flex h-[62vh] w-full shrink-0 flex-row flex-nowrap overflow-hidden">
					<System />
					<Terminal />
				</div>
				<FileSystem />
			</div>
			<Network />
		</div>
	);
}

export default App;
