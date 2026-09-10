export async function resolve(specifier, context, nextResolve) {
	if (specifier === '$env/dynamic/private') {
		return { url: 'data:text/javascript,export const env = {};', shortCircuit: true };
	}
	return nextResolve(specifier, context);
}
