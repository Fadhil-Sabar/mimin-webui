import { readShippedExtensionOrigins } from '$lib/server/browser/extension-package';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	shippedExtensionOrigins: await readShippedExtensionOrigins()
});
