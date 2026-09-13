import type { RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	buildExtensionArchive,
	configuredExtensionOrigins,
	isExtensionTarget,
	parseExtensionOrigin
} from '$lib/server/browser/extension-package';

const UNAUTHORIZED = 'Authentication required.';

/**
 * Serves the browser extension package for the origin the settings page is open on. The package
 * only bridges the origins baked into it, and a self-hosted Mimin can be reached at a LAN IP, a
 * Tailscale name, or a domain, so the origin is applied here instead of at build time.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const user = await requireUser(event);
		if (!user) return apiError('UNAUTHORIZED', UNAUTHORIZED, 401);

		const target = event.params.target;
		if (!target || !isExtensionTarget(target))
			return apiError('EXTENSION_TARGET_UNKNOWN', 'Unknown extension package.', 404);

		const requested = parseExtensionOrigin(event.url.searchParams.get('origin'));
		if (!requested)
			return apiError(
				'INVALID_ORIGIN',
				'An exact http(s) origin is required to build this package.',
				400
			);

		const origins = [...new Set([requested, ...configuredExtensionOrigins()])];
		const archive = await buildExtensionArchive({ target, origins });

		return new Response(new Uint8Array(archive), {
			headers: {
				'content-type': 'application/zip',
				'content-disposition': `attachment; filename="mimin-search-${target}.zip"`,
				'content-length': String(archive.byteLength),
				// The archive carries the requesting origin, so it must never be shared or reused.
				'cache-control': 'no-store'
			}
		});
	} catch (error) {
		return handleApiError(error);
	}
};
