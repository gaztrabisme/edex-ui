import FileSystem from '@/components/filesystem';
import Network from '@/components/network';
import System from '@/components/system';
import Terminal from '@/components/terminal';

function App() {
	return (
		<div class="bg-main text-main flex h-screen w-full flex-col flex-nowrap overflow-hidden">
			<div class="flex h-[62vh] w-full shrink-0 flex-row flex-nowrap overflow-hidden">
				<System />
				<Terminal />
				<Network />
			</div>
			<FileSystem />
		</div>
	);
}

export default App;
