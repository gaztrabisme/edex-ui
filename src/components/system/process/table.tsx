import { createSignal, For } from 'solid-js';
import { useTauriEvent } from '@/lib/hooks/useTauriEvent';
import type { ProcessInformation, SystemData } from '@/models';

function ProcessTable() {
	const [processes, setProcesses] = createSignal<ProcessInformation[]>();

	useTauriEvent<SystemData>('system', payload =>
		setProcesses(payload.processes),
	);

	return (
		<table class="w-full table-auto hover:cursor-pointer hover:opacity-75">
			<tbody>
				<For each={processes()}>
					{process => (
						<tr>
							<td class="sm:text-xs md:text-base lg:text-xl xl:text-3xl">
								{process.pid}
							</td>
							<td class="max-w-[7vw] truncate font-bold sm:text-xs md:text-base lg:text-xl xl:text-3xl">
								{process.name}
							</td>
							<td class="text-right sm:text-xs md:text-base lg:text-xl xl:text-3xl">
								{process.cpu_usage}%
							</td>
							<td class="text-right sm:text-xs md:text-base lg:text-xl xl:text-3xl">
								{process.memory_usage}%
							</td>
						</tr>
					)}
				</For>
			</tbody>
		</table>
	);
}

export default ProcessTable;
