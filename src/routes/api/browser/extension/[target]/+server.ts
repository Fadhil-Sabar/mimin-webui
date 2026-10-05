import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { apiError, handleApiError, requireUser } from '$lib/server/api';
import {
	EXTENSION_PACKAGE_HEADER,
	type ExtensionPackageKind
} from '$lib/browser-extension-package';
import {
	buildExtensionArchive,
	configuredExtensionOrigins,
	isExtensionTarget,
	parseExtensionOrigin,
	readSignedFirefoxPackage
} from '$lib/server/browser/extension-package';

const UNAUTHORIZED = 'Authentication required.';

type ResolvedPackage = {
	data: Uint8Array;
	contentType: string;
	filename: string;
	kind: ExtensionPackageKind;
};

/**
 * Serves the browser extension package for the origin the settings page is open on. A
 * self-hosted Mimin can be reached at a LAN IP, a Tailscale name, or a domain, so the origin is
 * applied here instead of at build time.
 *
 * A signed Firefox package cannot be rebuilt per download — AMO signs one fixed artifact — so it is
 * served as-is. A universal one covers every origin: localhost on any port as built in, and any
 * other address once the user connects it in the popup, which is what makes one signed XPI work
 * for every self-hosted instance. A non-universal signed package is served only when it already
 * covers the origins this download needs; otherwise the package is rebuilt for this origin, which
 * Firefox accepts only as a temporary add-on.
 */
async function resolvePackage(event: RequestEvent): Promise<ResolvedPackage | Response> {
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

	if (target === 'firefox') {
		const signed = await readSignedFirefoxPackage();
		if (
			signed &&
			(signed.universal || origins.every((origin) => signed.allowedOrigins.includes(origin)))
		)
			return {
				data: signed.data,
				contentType: 'application/x-xpinstall',
				filename: 'mimin-search-firefox.xpi',
				kind: 'signed'
			};
	}

	const archive = await buildExtensionArchive({ target, origins });
	return {
		data: archive,
		contentType: 'application/zip',
		filename: `mimin-search-${target}.zip`,
		kind: target === 'firefox' ? 'temporary' : 'unpacked'
	};
}

function respond(result: ResolvedPackage, withBody: boolean): Response {
	return new Response(withBody ? new Uint8Array(result.data) : null, {
		headers: {
			'content-type': result.contentType,
			'content-disposition': `attachment; filename="${result.filename}"`,
			'content-length': String(result.data.byteLength),
			[EXTENSION_PACKAGE_HEADER]: result.kind,
			// The archive carries the requesting origin, so it must never be shared or reused.
			'cache-control': 'no-store'
		}
	});
}

async function handle(event: RequestEvent, withBody: boolean): Promise<Response> {
	try {
		const result = await resolvePackage(event);
		if (result instanceof Response) return result;
		return respond(result, withBody);
	} catch (error) {
		return handleApiError(error);
	}
}

export const GET: RequestHandler = (event) => handle(event, true);

/** HEAD answers with the same headers and no package, which is how the settings page probes. */
export const HEAD: RequestHandler = (event) => handle(event, false);
