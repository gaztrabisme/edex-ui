import Icon from '@/components/filesystem/icon';
import { getFileColor } from '@/lib/fileColors';
import type { FileType } from '@/models';

interface FileTileProps {
	name: string;
	t: FileType;
	hidden: boolean;
	onClick: VoidFunction;
}

function FileTile(props: FileTileProps) {
	return (
		<div
			class="flex h-[10vh] w-full cursor-pointer flex-col items-center justify-start gap-0.5 rounded-sm pt-[0.5vh] text-center hover:opacity-70"
			style={{ color: getFileColor(props.name, props.t) }}
			onMouseDown={() => props.onClick()}
			title={props.name}
		>
			<Icon {...props} />
			<span class="sm:text-xxs w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 pb-[0.3vh] md:text-xs lg:text-sm xl:text-lg">
				{props.name}
			</span>
		</div>
	);
}

export default FileTile;
