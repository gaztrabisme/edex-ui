import { lazy } from 'solid-js';
import Banner from '@/components/banner';

const GlobeView = lazy(() => import('@/components/network/globe'));

const NetworkContent = lazy(() => import('@/components/network/content'));

function Network() {
	return (
		<div class="border-default/30 relative box-border flex h-screen w-[20vw] min-w-[280px] flex-col items-end sm:px-1 md:px-2 lg:px-3">
			<Banner title={'NETWORK'} name={''} />
			<GlobeView />
			<NetworkContent />
		</div>
	);
}

export default Network;
