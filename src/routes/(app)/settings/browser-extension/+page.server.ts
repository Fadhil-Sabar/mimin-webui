import type { PageServerLoad } from './$types';

/**
 * The origin the app is configured to answer on. The settings page prefers the browser's own
 * `location.origin` (an instance can be reached at more than one origin) and falls back to this
 * for the pre-hydration markup.
 */
export const load: PageServerLoad = async ({ url }) => ({ origin: url.origin });
