import { invoke } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { openPath } from '@tauri-apps/plugin-opener';
import { errorLog } from '@/lib/log';

export async function openFile(path: string) {
	try {
		await openPath(path);
	} catch (e) {
		await errorLog(`${e}. Path: ${path}`);
	}
}

export async function getKernelVersion(): Promise<string> {
	return (await invoke('kernel_version')) || 'UNKNOWN';
}

export async function readHistory(): Promise<string[]> {
	return invoke('read_history');
}

export async function hasRunningChildren(sessionId: string): Promise<boolean> {
	return invoke('has_running_children', { sessionId });
}

export async function resizeSession(id: string, rows: number, cols: number) {
	await emit(id, {
		type: 'Resize',
		payload: {
			cols,
			rows,
		},
	});
}

/**
 * Write data from the terminal to the pty.
 * Uses Tauri command (invoke) for direct path — bypasses event system + JSON envelope.
 */
export function writeToSession(id: string, data: string) {
	invoke('write_to_session', { id, data });
}

/**
 * Create a new terminal and return pid
 * @param id terminal index
 */
export async function initializeSession(id: string) {
	await emit('manager', {
		type: 'Initialize',
		payload: {
			id,
		},
	});
}

export async function terminateSession(id: string) {
	await emit(id, {
		type: 'Exit',
	});
}

export async function updateCurrentSession(id: string) {
	await emit('manager', {
		type: 'Switch',
		payload: {
			id,
		},
	});
}
