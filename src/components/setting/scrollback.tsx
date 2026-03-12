import { createSignal, For, onMount } from 'solid-js';
import { getScrollback, setScrollback } from '@/lib/setting';

const SCROLLBACK_OPTIONS = [1000, 2000, 5000, 10000, 50000];

function ScrollbackSetting() {
	const [value, setValue] = createSignal(5000);

	onMount(async () => {
		const saved = await getScrollback();
		setValue(saved);
	});

	async function onChange(lines: number) {
		setValue(lines);
		await setScrollback(lines);
	}

	return (
		<div class="flex flex-row flex-nowrap items-center justify-between py-1">
			<span class="text-main sm:text-base md:text-xl lg:text-3xl xl:text-5xl">
				Scrollback Lines
			</span>
			<select
				class="border-default bg-secondary text-main relative block w-32 cursor-pointer appearance-none border-2 border-solid px-2 text-center focus:outline-hidden sm:text-sm md:text-lg lg:text-2xl xl:text-3xl"
				value={value()}
				onInput={e => onChange(Number(e.currentTarget.value))}
			>
				<For each={SCROLLBACK_OPTIONS}>
					{opt => (
						<option
							value={opt}
							class="bg-secondary text-main mt-1 max-h-60 w-full overflow-auto focus:outline-hidden sm:text-sm md:text-base lg:text-xl xl:text-2xl"
						>
							{opt.toLocaleString()}
						</option>
					)}
				</For>
			</select>
		</div>
	);
}

export default ScrollbackSetting;
