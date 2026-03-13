import { type Event, listen } from '@tauri-apps/api/event';
import { onCleanup } from 'solid-js';
import { errorLog } from '@/lib/log';

export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
	const unListen = listen<T>(event, (e: Event<T>) => handler(e.payload));
	onCleanup(() => {
		unListen.then(f => f()).catch(errorLog);
	});
}
