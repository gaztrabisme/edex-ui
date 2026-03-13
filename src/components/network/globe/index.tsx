import type { GlobeInstance } from 'globe.gl';
import Globe from 'globe.gl';
import { createEffect, on, onCleanup, onMount } from 'solid-js';
import { useTauriEvent } from '@/lib/hooks/useTauriEvent';
import { selectStyle, useTheme } from '@/lib/themes';
import type { ConnectionsData } from '@/models';

const COUNTRIES_GEOJSON_URL =
	'https://cdn.jsdelivr.net/npm/globe.gl/example/datasets/ne_110m_admin_0_countries.geojson';

function getBorderColor(): string {
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue('--border-default')
		.trim();
	return raw ? `rgb(${raw.replace(/ /g, ', ')})` : 'rgb(251, 48, 72)';
}

function GlobeView() {
	const { theme } = useTheme();
	const style = () => selectStyle(theme());
	let containerRef!: HTMLDivElement;
	let globeInstance: GlobeInstance | undefined;

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
		const globeMaterial = globeInstance.globeMaterial() as {
			color: { set: (c: string) => void };
			emissive: { set: (c: string) => void };
			emissiveIntensity: number;
			shininess: number;
		};
		globeMaterial.color.set('#000000');
		globeMaterial.emissive.set(style().terminal.background);
		globeMaterial.emissiveIntensity = 1;
		globeMaterial.shininess = 0;

		// Load country GeoJSON and render as hex polygons
		fetch(COUNTRIES_GEOJSON_URL)
			.then(res => res.json())
			.then(countries => {
				if (!globeInstance) return;
				globeInstance
					.hexPolygonsData(countries.features)
					.hexPolygonResolution(3)
					.hexPolygonMargin(0.35)
					.hexPolygonUseDots(false)
					.hexPolygonColor(() => mainColor)
					.hexPolygonAltitude(0.005);
			});

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

	// Listen for connection data from Rust backend
	useTauriEvent<ConnectionsData>('connections', data => {
		if (!globeInstance) return;

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

				const globeMaterial = globeInstance.globeMaterial() as {
					emissive: { set: (c: string) => void };
				};
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
		<div
			// biome-ignore lint/style/noNonNullAssertion: SolidJS definite assignment pattern
			ref={containerRef!}
			class="w-full min-h-0 flex-1 overflow-hidden"
		/>
	);
}

export default GlobeView;
