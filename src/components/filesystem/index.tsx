import { createResource, createSignal, lazy } from 'solid-js';
import Banner from '@/components/banner';
import { useTauriEvent } from '@/lib/hooks/useTauriEvent';
import {
	getShowHiddenFileStatus,
	setShowHiddenFileStatus,
} from '@/lib/setting';
import type { FileSystemStatus } from '@/models';

const FileSection = lazy(() => import('@/components/filesystem/file'));

const Setting = lazy(() => import('@/components/setting'));

function FileSystem() {
	const [open, setOpen] = createSignal(false);
	const [showHidden, { mutate }] = createResource(getShowHiddenFileStatus);

	async function change() {
		const v = !showHidden();
		await setShowHiddenFileStatus(v);
		mutate(v);
	}

	const [fileSystem, setFileSystem] = createSignal<FileSystemStatus>();

	useTauriEvent<FileSystemStatus>('files', payload => setFileSystem(payload));

	return (
		<>
			<div class="relative flex size-full max-h-[38vh] flex-col justify-between border-default/20 border-t sm:p-1 md:p-2 lg:p-3">
				<Banner
					title={/*@once*/ 'FILESYSTEM'}
					name={fileSystem()?.path || ''}
				/>
				<div class="no-scrollbar animate-fade relative box-border grid h-full max-h-[34vh] min-h-[25.5vh] appearance-none auto-rows-[10vh] grid-cols-[repeat(auto-fill,minmax(10vh,14vh))] gap-[1vh] overflow-auto">
					<FileSection
						open={() => setOpen(true)}
						showHidden={showHidden}
						fileSystem={fileSystem}
					/>
				</div>
			</div>
			<Setting
				open={open}
				close={() => setOpen(false)}
				showHidden={showHidden}
				changeHidden={change}
			/>
		</>
	);
}

export default FileSystem;
