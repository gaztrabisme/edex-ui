import { createSignal, onCleanup, onMount, Show } from 'solid-js';

const BOOT_LINES = [
	'eDEX-UI Kernel v4.2.1-edex — Initializing...',
	'',
	'[    0.000000] eDEX BIOS-e820: [mem 0x0000000000000000-0x000000000009fbff] usable',
	'[    0.000000] eDEX BIOS-e820: [mem 0x0000000100000000-0x00000008bfffffff] usable',
	'[    0.000000] NX (Execute Disable) protection: active',
	'[    0.000000] DMI: eDEX Systems Corp eDEX-v4/MAINBOARD, BIOS 4.2.1 03/13/2026',
	'[    0.000000] tsc: Fast TSC calibration using PIT',
	'[    0.000000] e820: last_pfn = 0x8c0000 max_arch_pfn = 0x400000000',
	'[    0.000000] found SMP MP-table at [mem 0x000f6b80-0x000f6b8f]',
	'[    0.000000] x86/PAT: Configuration [0-7]: WB  WC  UC- UC  WB  WP  UC- WT',
	'[    0.000000] Scanning 1 areas for low memory corruption',
	'[    0.004000] Freeing SMP alternatives memory: 40K',
	'[    0.004000] ACPI: Core revision 20210930',
	'[    0.008312] ..TIMER: vector=0x30 apic1=0 pin1=2 apic2=-1 pin2=-1',
	'[    0.009000] smpboot: CPU0: Intel(R) Core(TM) EDEX-9900X @ 4.20GHz (family: 0x6, model: 0x55)',
	'[    0.009000] Performance Events: PEBS fmt4+-baseline, 32-deep LBR, Intel PMU driver.',
	'[    0.009100] smpboot: Total of 32 processors activated',
	'[    0.012000] PCI: Using configuration type 1 for base access',
	'[    0.015000] PCI: MMCONFIG for domain 0000 [bus 00-ff] at [mem 0xe0000000-0xefffffff]',
	'[    0.024000] ACPI: Added _OSI(Module Device)',
	'[    0.024000] ACPI: Added _OSI(Processor Device)',
	'[    0.036000] pci 0000:01:00.0: [10de:2b85] type 00 class 0x030000',
	'[    0.036000] pci 0000:01:00.0: GPU NVIDIA RTX-EDEX 16384 MiB GDDR7',
	'[    0.036001] pci 0000:01:00.0: BAR 1: assigned [mem 0x4000000000-0x43ffffffff 64bit pref]',
	'[    0.041000] IOMMU: Setting IOMMU-DMA strict mode',
	'[    0.053000] EDEX NetSec: Firewall initialized — passive mode',
	'[    0.053000] EDEX NetSec: TCP connection monitor active',
	'[    0.062000] clocksource: tsc: mask: 0xffffffffffffffff max_cycles: 0x60923a045d',
	'[    0.064000] random: crng init done',
	'[    0.081000] EXT4-fs (nvme0n1p2): mounted filesystem with ordered data mode. Quota mode: none.',
	'[    0.081000] VFS: Mounted root (ext4 filesystem) readonly on device 259:2.',
	'[    0.089000] systemd[1]: Detected architecture x86-64.',
	'[    0.089000] systemd[1]: Hostname set to <edex-terminal>.',
	'[    0.102000] input: eDEX Virtual Keyboard as /devices/virtual/input/input0',
	'[    0.110000] usb 1-2: New USB device found, idVendor=edex, idProduct=0001, bcdDevice=4.21',
	'[    0.110001] usb 1-2: Product: eDEX Neural Interface',
	'[    0.120000] Loading eDEX subsystems...',
	'[    0.120001]   SystemMonitor .................... OK',
	'[    0.120002]   PTY SessionManager .............. OK',
	'[    0.120003]   DirectoryFileWatcher ............ OK',
	'[    0.120004]   EventProcessor .................. OK',
	'[    0.120005]   ConnectionMonitor ............... OK',
	'[    0.120006]   GeoLocation Service ............. OK',
	'[    0.130000] [drm] GPU initialized: NVIDIA RTX-EDEX 16384MB',
	'[    0.130001] [drm] Display output: 5120x1440@120Hz',
	'[    0.130002] [drm] WebGL2 renderer: active',
	'[    0.135000] eDEX ThemeEngine: Loading theme configuration',
	'[    0.135001] eDEX ThemeEngine: 6 themes registered',
	'[    0.140000] eDEX TerminalEmulator: xterm.js v6 — WebGL pipeline active',
	'[    0.140001] eDEX TerminalEmulator: SIXEL image protocol enabled',
	'[    0.150000] audit: eDEX security policies loaded',
	'[    0.150001] audit: Sandbox restrictions active',
	'[    0.160000] eDEX Globe: Three.js scene initialized',
	'[    0.160001] eDEX Globe: hex polygon renderer ready',
	'',
	'[    0.170000] eDEX-UI v4.2.1 ready.',
	'[    0.170001] Boot Complete.',
];

/** Milliseconds per line — fast bulk, slower for key lines */
function lineDelay(index: number, total: number): number {
	if (index < 3) return 60;
	if (index >= total - 3) return 120;
	return 18 + Math.random() * 14;
}

const TITLE_HOLD_MS = 1400;
const FADE_OUT_MS = 400;

interface BootAnimationProps {
	onComplete: () => void;
}

export default function BootAnimation(props: BootAnimationProps) {
	const [lines, setLines] = createSignal<string[]>([]);
	const [phase, setPhase] = createSignal<'log' | 'title' | 'done'>('log');
	const [fading, setFading] = createSignal(false);
	let logEl: HTMLDivElement | undefined;

	function skip() {
		setPhase('done');
		props.onComplete();
	}

	onMount(() => {
		let cancelled = false;
		let i = 0;

		async function runLog() {
			while (i < BOOT_LINES.length && !cancelled) {
				const line = BOOT_LINES[i];
				setLines(prev => [...prev, line]);
				logEl?.scrollTo(0, logEl.scrollHeight);
				i++;
				await new Promise(r => setTimeout(r, lineDelay(i, BOOT_LINES.length)));
				if (cancelled) return;
			}
			if (!cancelled) {
				setPhase('title');
				setTimeout(() => {
					if (cancelled) return;
					setFading(true);
					setTimeout(() => {
						if (cancelled) return;
						setPhase('done');
						props.onComplete();
					}, FADE_OUT_MS);
				}, TITLE_HOLD_MS);
			}
		}

		const handleSkip = () => {
			if (!cancelled) {
				cancelled = true;
				skip();
			}
		};

		document.addEventListener('keydown', handleSkip);
		document.addEventListener('click', handleSkip);

		runLog();

		onCleanup(() => {
			cancelled = true;
			document.removeEventListener('keydown', handleSkip);
			document.removeEventListener('click', handleSkip);
		});
	});

	return (
		<Show when={phase() !== 'done'}>
			<div
				class="bg-main fixed inset-0 z-50 flex items-center justify-center font-serif"
				classList={{ 'boot-fade-out': fading() }}
			>
				<Show when={phase() === 'log'}>
					<div
						ref={logEl}
						class="text-main no-scrollbar absolute inset-0 overflow-y-auto p-[2vh_3vw]"
						style={{ 'font-size': '11px', 'line-height': '1.5' }}
					>
						{lines().map(line => (
							<div class="whitespace-pre">{line || '\u00A0'}</div>
						))}
						<span class="boot-cursor text-main inline-block">_</span>
					</div>
					<div
						class="text-main pointer-events-none absolute right-[3vw] bottom-[2vh] opacity-30"
						style={{ 'font-size': '10px' }}
					>
						Press any key to skip
					</div>
				</Show>

				<Show when={phase() === 'title'}>
					<div class="boot-title-enter flex flex-col items-center gap-4">
						<h1
							class="text-main boot-glitch font-united_sans_medium tracking-[0.4em] uppercase"
							style={{ 'font-size': 'clamp(3rem, 6vw, 8rem)' }}
							data-text="eDEX-UI"
						>
							eDEX-UI
						</h1>
						<div
							class="text-main tracking-[0.3em] uppercase opacity-50"
							style={{ 'font-size': '12px' }}
						>
							Terminal System Monitor v4.2.1
						</div>
					</div>
				</Show>
			</div>
		</Show>
	);
}
