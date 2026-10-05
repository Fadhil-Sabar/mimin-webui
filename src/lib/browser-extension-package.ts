/**
 * The half of the extension download contract the settings page and the download route share.
 *
 * A signed XPI installs permanently; an unsigned one is only ever a temporary add-on. The page
 * cannot tell which it will get until it asks, so the route names the artifact it served in a
 * response header and the page reads it back.
 */
export const EXTENSION_PACKAGE_HEADER = 'x-mimin-extension-package';

export type ExtensionPackageKind = 'signed' | 'temporary' | 'unpacked';
