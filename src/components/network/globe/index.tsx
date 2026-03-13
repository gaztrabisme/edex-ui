import type { GlobeInstance } from 'globe.gl';
import Globe from 'globe.gl';
import {
	createEffect,
	createSignal,
	on,
	onCleanup,
	onMount,
	Show,
} from 'solid-js';
import { useTauriEvent } from '@/lib/hooks/useTauriEvent';
import { selectStyle, useTheme } from '@/lib/themes';
import type { ConnectionsData } from '@/models';

const COUNTRIES_GEOJSON_URL =
	'https://cdn.jsdelivr.net/npm/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson';

/** Max retries for GeoJSON CDN fetch */
const GEOJSON_MAX_RETRIES = 2;
/** Delay between retries in ms */
const GEOJSON_RETRY_DELAY = 5000;

function getBorderColor(): string {
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue('--border-default')
		.trim();
	return raw ? `rgb(${raw.replace(/ /g, ', ')})` : 'rgb(251, 48, 72)';
}

interface GlobeMaterial {
	color: { set: (c: string) => void };
	emissive: { set: (c: string) => void };
	emissiveIntensity: number;
	shininess: number;
}

function GlobeView() {
	const { theme } = useTheme();
	const style = () => selectStyle(theme());
	let containerRef!: HTMLDivElement;
	let globeInstance: GlobeInstance | undefined;
	const [hasConnections, setHasConnections] = createSignal(false);
	const [receivedFirstData, setReceivedFirstData] = createSignal(false);

	onMount(() => {
		const mainColor = style().colors.main;

		globeInstance = new Globe(containerRef)
			.backgroundColor('rgba(0,0,0,0)')
			.showGlobe(true)
			.showAtmosphere(false)
			.width(containerRef.clientWidth)
			.height(containerRef.clientHeight)
			.pointsMerge(true)
			.arcStroke(0.5)
			.arcDashLength(0.4)
			.arcDashGap(0.2)
			.arcDashAnimateTime(1500)
			.ringColor('color')
			.ringMaxRadius(3)
			.ringPropagationSpeed(2)
			.ringRepeatPeriod(1200);

		// Globe surface matches theme background, unlit (no shading)
		const globeMaterial =
			globeInstance.globeMaterial() as unknown as GlobeMaterial;
		globeMaterial.color.set('#000000');
		globeMaterial.emissive.set(style().terminal.background);
		globeMaterial.emissiveIntensity = 1;
		globeMaterial.shininess = 0;

		// Load country GeoJSON with retry
		loadGeoJSON(globeInstance, mainColor, 0);

		// Auto-rotate, allow spinning but no zoom/pan
		const controls = globeInstance.controls();
		controls.autoRotate = true;
		controls.autoRotateSpeed = 0.3;
		controls.enableZoom = false;
		controls.enableRotate = true;
		controls.enablePan = false;

		// Responsive sizing
		const ro = new ResizeObserver(() => {
			if (globeInstance) {
				globeInstance.width(containerRef.clientWidth);
				globeInstance.height(containerRef.clientHeight);
			}
		});
		ro.observe(containerRef);

		onCleanup(() => {
			ro.disconnect();
			if (globeInstance) {
				globeInstance.pauseAnimation();
			}
		});
	});

	function loadGeoJSON(globe: GlobeInstance, color: string, attempt: number) {
		fetch(COUNTRIES_GEOJSON_URL)
			.then(res => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then(countries => {
				if (!globe) return;
				globe
					.hexPolygonsData(countries.features)
					.hexPolygonResolution(3)
					.hexPolygonMargin(0.35)
					.hexPolygonUseDots(false)
					.hexPolygonColor(() => color)
					.hexPolygonAltitude(0.005);
			})
			.catch(() => {
				if (attempt < GEOJSON_MAX_RETRIES) {
					setTimeout(
						() => loadGeoJSON(globe, color, attempt + 1),
						GEOJSON_RETRY_DELAY,
					);
				}
				// Globe still works without countries — just no hex polygons
			});
	}

	// Listen for connection data from Rust backend
	useTauriEvent<ConnectionsData>('connections', data => {
		if (!globeInstance) return;

		setReceivedFirstData(true);
		setHasConnections(data.connections.length > 0);

		// User location as a glowing point
		const borderColor = getBorderColor();
		globeInstance
			.pointsData([
				{
					lat: data.user_lat,
					lng: data.user_lon,
					size: 0.6,
					color: style().colors.main,
				},
			])
			.pointColor('color')
			.pointAltitude(0.01)
			.pointRadius('size');

		// Arcs from user to remote connections — use border color
		const arcs = data.connections.map(conn => ({
			startLat: data.user_lat,
			startLng: data.user_lon,
			endLat: conn.lat,
			endLng: conn.lon,
			color: borderColor,
		}));

		globeInstance.arcsData(arcs).arcColor('color');

		// Pulsing rings at connection endpoints for glow effect
		const rings = data.connections.map(conn => ({
			lat: conn.lat,
			lng: conn.lon,
			color: borderColor,
		}));
		globeInstance.ringsData(rings);
	});

	// Theme reactivity — update hex color, atmosphere, points, arcs, rings
	createEffect(
		on(
			() => theme(),
			() => {
				if (!globeInstance) return;
				const mainColor = style().colors.main;
				const borderColor = getBorderColor();

				const globeMaterial = globeInstance.globeMaterial() as unknown as Pick<
					GlobeMaterial,
					'emissive'
				>;
				globeMaterial.emissive.set(style().terminal.background);
				globeInstance.hexPolygonColor(() => mainColor);

				const currentPoints = globeInstance.pointsData() as Array<{
					lat: number;
					lng: number;
					size: number;
					color: string;
				}>;
				if (currentPoints.length > 0) {
					globeInstance.pointsData(
						currentPoints.map(p => ({ ...p, color: mainColor })),
					);
				}
				const currentArcs = globeInstance.arcsData() as Array<{
					startLat: number;
					startLng: number;
					endLat: number;
					endLng: number;
					color: string;
				}>;
				if (currentArcs.length > 0) {
					globeInstance.arcsData(
						currentArcs.map(a => ({ ...a, color: borderColor })),
					);
				}
				const currentRings = globeInstance.ringsData() as Array<{
					lat: number;
					lng: number;
					color: string;
				}>;
				if (currentRings.length > 0) {
					globeInstance.ringsData(
						currentRings.map(r => ({ ...r, color: borderColor })),
					);
				}
			},
		),
	);

	return (
		<div class="relative w-full min-h-0 flex-1 overflow-hidden">
			<div
				// biome-ignore lint/style/noNonNullAssertion: SolidJS definite assignment pattern
				ref={containerRef!}
				class="h-full w-full"
			/>
			<Show when={receivedFirstData() && !hasConnections()}>
				<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
					<span
						class="text-main no-connection-pulse font-united_sans_medium tracking-[0.35em] uppercase"
						style={{ 'font-size': 'clamp(0.6rem, 1vw, 1.1rem)' }}
					>
						NO CONNECTION
					</span>
				</div>
			</Show>
		</div>
	);
}

export default GlobeView;
