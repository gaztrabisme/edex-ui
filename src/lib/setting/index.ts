import { load } from '@tauri-apps/plugin-store';
import { Theme } from '@/lib/themes/styles';

const store = await load('.settings.dat', {
	defaults: { showHiddenFile: false, theme: Theme.TRON, scrollback: 5000 },
	autoSave: true,
});

export async function getShowHiddenFileStatus(): Promise<boolean> {
	return (await store.get<boolean>('showHiddenFile')) || false;
}

export async function setShowHiddenFileStatus(status: boolean) {
	await store.set('showHiddenFile', status);
}

export async function getTheme(): Promise<Theme> {
	return (await store.get('theme')) || Theme.TRON;
}

export async function setTheme(theme: Theme) {
	await store.set('theme', theme);
}

export async function getScrollback(): Promise<number> {
	return (await store.get<number>('scrollback')) || 5000;
}

export async function setScrollback(lines: number) {
	await store.set('scrollback', lines);
}
