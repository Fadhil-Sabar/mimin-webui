import { describe, expect, it } from 'vitest';
import { projectInput, messageInput } from '../src/lib/server/validation';

describe('request validation', () => {
	it('accepts a project and applies a description default', () => {
		expect(projectInput.parse({ name: 'Mimin' })).toMatchObject({ name: 'Mimin', description: '' });
	});
	it('rejects empty messages', () => {
		expect(messageInput.safeParse({ content: '   ' }).success).toBe(false);
	});
});
