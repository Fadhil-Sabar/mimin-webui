import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	conversationsState,
	getLastUsedModel,
	resolveInitialModel,
	setLastUsedModel,
	LAST_USED_MODEL_STORAGE_KEY
} from '../src/lib/client/conversations.svelte';

function createStorageMock() {
	const values = new Map<string, string>();
	return {
		getItem: vi.fn((key: string) => values.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => values.set(key, value)),
		removeItem: vi.fn((key: string) => values.delete(key)),
		clear: vi.fn(() => values.clear())
	};
}

describe('last used model client helper', () => {
	let storageMock: ReturnType<typeof createStorageMock>;

	beforeEach(() => {
		storageMock = createStorageMock();
		vi.stubGlobal('window', {});
		vi.stubGlobal('localStorage', storageMock);
		conversationsState.items = [];
	});

	it('reads and writes last used model to localStorage', () => {
		expect(getLastUsedModel()).toBeNull();
		setLastUsedModel('google/gemini-2.5-flash');
		expect(storageMock.setItem).toHaveBeenCalledWith(
			LAST_USED_MODEL_STORAGE_KEY,
			'google/gemini-2.5-flash'
		);
		expect(getLastUsedModel()).toBe('google/gemini-2.5-flash');
	});

	it('prefers explicitly requested candidate if available', () => {
		setLastUsedModel('google/gemini-2.5-flash');
		const configured = [
			{ provider: 'google', id: 'gemini-2.5-flash' },
			{ provider: 'anthropic', id: 'claude-3-5-sonnet' }
		];
		const result = resolveInitialModel(configured, 'anthropic/claude-3-5-sonnet');
		expect(result).toBe('anthropic/claude-3-5-sonnet');
	});

	it('falls back to last used model when preferred candidate is not configured', () => {
		setLastUsedModel('anthropic/claude-3-5-sonnet');
		const configured = [
			{ provider: 'openai', id: 'gpt-4o-mini' },
			{ provider: 'anthropic', id: 'claude-3-5-sonnet' }
		];
		const result = resolveInitialModel(configured, 'non-existent/model');
		expect(result).toBe('anthropic/claude-3-5-sonnet');
	});

	it('falls back to last used model when no candidate is passed', () => {
		setLastUsedModel('google/gemini-2.5-flash');
		const configured = [
			{ provider: 'openai', id: 'gpt-4o-mini' },
			{ provider: 'google', id: 'gemini-2.5-flash' }
		];
		const result = resolveInitialModel(configured);
		expect(result).toBe('google/gemini-2.5-flash');
	});

	it('falls back to latest conversation when localStorage is empty', () => {
		conversationsState.items = [
			{
				id: 'c1',
				title: 'Existing chat',
				projectId: null,
				model: 'anthropic/claude-3-5-sonnet'
			}
		];
		const configured = [
			{ provider: 'openai', id: 'gpt-4o-mini' },
			{ provider: 'anthropic', id: 'claude-3-5-sonnet' }
		];
		const result = resolveInitialModel(configured);
		expect(result).toBe('anthropic/claude-3-5-sonnet');
	});

	it('falls back to gpt-4o-mini if available and no history', () => {
		const configured = [
			{ provider: 'google', id: 'gemini-2.5-flash' },
			{ provider: 'openai', id: 'gpt-4o-mini' }
		];
		const result = resolveInitialModel(configured);
		expect(result).toBe('openai/gpt-4o-mini');
	});

	it('falls back to first configured model if gpt-4o-mini is not available', () => {
		const configured = [{ provider: 'google', id: 'gemini-2.5-flash' }];
		const result = resolveInitialModel(configured);
		expect(result).toBe('google/gemini-2.5-flash');
	});

	it('updates last used model when conversationsState.setItems is called without existing storage', () => {
		conversationsState.setItems([
			{
				id: 'c1',
				title: 'Recent chat',
				projectId: null,
				model: 'deepseek/deepseek-chat'
			}
		]);
		expect(getLastUsedModel()).toBe('deepseek/deepseek-chat');
	});

	it('updates last used model when conversationsState.addOrUpdate is called', () => {
		conversationsState.addOrUpdate({
			id: 'c2',
			title: 'New chat',
			projectId: null,
			model: 'google/gemini-2.5-pro'
		});
		expect(getLastUsedModel()).toBe('google/gemini-2.5-pro');
	});
});
