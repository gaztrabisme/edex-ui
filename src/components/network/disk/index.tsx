import prettyBytes from 'pretty-bytes';
import { createSignal, For } from 'solid-js';
import { useTauriEvent } from '@/lib/hooks/useTauriEvent';
import type { DiskUsageStatus } from '@/models';

function deepEqual<T>(a: T, b: T): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function DiskUsage() {
	const [disks, setDisks] = createSignal<DiskUsageStatus[]>();

	useTauriEvent<DiskUsageStatus[]>('disk', payload =>
		setDisks(prevState =>
			deepEqual(prevState, payload) ? prevState : payload,
		),
	);

	return (
		<div class="font-united_sans_light flex h-[28vh] w-full flex-col flex-nowrap tracking-[0.092vh] sm:px-0.5 md:px-1.5 lg:px-2.5 xl:px-3.5">
			<div class="flex flex-row flex-nowrap items-center justify-start">
				<span class="sm:text-xs md:text-base lg:text-xl xl:text-4xl">
					DISK USAGE
				</span>
			</div>
			<div class="mb-3 size-full overflow-auto">
				<For each={disks()}>
					{disk => (
						<div
							class="flex flex-col"
							style={{
								background: `linear-gradient(to right, var(--color-shade) ${disk.usage}%, transparent 80%)`,
							}}
						>
							<div class="flex flex-row items-center justify-between">
								<span class="sm:text-xs md:text-base lg:text-xl xl:text-4xl">
									{disk.name}
								</span>
								<span class="sm:text-xxs md:text-sm lg:text-lg xl:text-3xl">
									{disk.internal ? 'Internal' : 'External'}
								</span>
							</div>
							<div class="flex flex-row items-center justify-between">
								<span class="sm:text-xxxs md:text-xs lg:text-base xl:text-2xl">
									{prettyBytes(disk.total)}
								</span>
								<span class="sm:text-xxxs md:text-xs lg:text-base xl:text-2xl">
									{prettyBytes(disk.available)} Free
								</span>
							</div>
						</div>
					)}
				</For>
			</div>
		</div>
	);
}

export default DiskUsage;
