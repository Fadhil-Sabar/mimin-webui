import { describe, expect, it } from 'vitest';
import { extractSseErrorMessage } from '../src/lib/client/api';

describe('SSE error message extraction', () => {
	it('unwraps a provider message serialized after an HTTP status', () => {
		const providerMessage =
			'403: {"message":"MODEL_NOT_IN_PLAN: Gemini 3.5 Flash Lite available in Pro and above plans or extra on demand usage","type":"permission_error","code":"FORBIDDEN"}';

		expect(
			extractSseErrorMessage({
				code: providerMessage,
				message: providerMessage
			})
		).toBe(
			'MODEL_NOT_IN_PLAN: Gemini 3.5 Flash Lite available in Pro and above plans or extra on demand usage'
		);
	});

	it('handles nested error objects and leaves ordinary messages intact', () => {
		expect(extractSseErrorMessage({ error: { message: 'Provider is unavailable' } })).toBe(
			'Provider is unavailable'
		);
		expect(extractSseErrorMessage(new Error('Request failed'))).toBe('Request failed');
		expect(extractSseErrorMessage({ code: 'MODEL_NOT_AVAILABLE' })).toBe('MODEL_NOT_AVAILABLE');
	});

	it('uses the fallback when no readable message exists', () => {
		expect(extractSseErrorMessage({ error: { code: 403 } }, 'Unable to continue')).toBe(
			'Unable to continue'
		);
	});
});
