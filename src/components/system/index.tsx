import { lazy } from 'solid-js';
import Banner from '@/components/banner';

const Content = lazy(() => import('@/components/system/content'));

function System() {
	return (
		<div class="relative box-border flex h-full w-[16vw] min-w-[280px] flex-col items-end sm:px-1 md:px-2 lg:w-[20vw] lg:px-3">
			<Banner title={/*@once*/ 'SYSTEM'} name={/*@once*/ ''} />
			<Content />
		</div>
	);
}

export default System;
