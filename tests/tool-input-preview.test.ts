import { describe, expect, it } from 'vitest';
import { previewToolInput, streamingToolCallBlock } from '../src/lib/server/ai/tool-stream-preview';

describe('previewToolInput', () => {
	it('leaves short strings and primitives untouched', () => {
		expect(previewToolInput('Login')).toBe('Login');
		expect(previewToolInput(42)).toBe(42);
		expect(previewToolInput(true)).toBe(true);
		expect(previewToolInput(null)).toBeNull();
		expect(previewToolInput(undefined)).toBeUndefined();
	});

	it('truncates strings longer than the limit and marks it', () => {
		const long = 'a'.repeat(500);
		const preview = previewToolInput(long) as string;
		expect(preview.length).toBe(201);
		expect(preview.endsWith('…')).toBe(true);
		expect(preview.slice(0, 200)).toBe('a'.repeat(200));
	});

	it('keeps the display fields the tool card reads', () => {
		const preview = previewToolInput({
			name: 'Mobile Checkout',
			viewport: 'mobile',
			html: '<div>'.repeat(1000),
			css: '.a{}'
		}) as Record<string, unknown>;
		expect(preview.name).toBe('Mobile Checkout');
		expect(preview.viewport).toBe('mobile');
		expect(preview.css).toBe('.a{}');
		expect((preview.html as string).length).toBe(201);
	});

	it('recurses into nested objects and arrays', () => {
		const preview = previewToolInput({
			inputs: [{ text: 'x'.repeat(300), submit: false }]
		}) as { inputs: Array<{ text: string; submit: boolean }> };
		expect(preview.inputs[0].submit).toBe(false);
		expect((preview.inputs[0].text as string).length).toBe(201);
	});

	it('respects a custom limit', () => {
		expect(previewToolInput('abcdef', 3)).toBe('abc…');
	});
});

describe('streamingToolCallBlock', () => {
	const toolCall = {
		type: 'toolCall',
		id: 'call-1',
		name: 'create_scene',
		arguments: { name: 'Login', viewport: 'mobile' }
	};

	it('reads the block at the given content index', () => {
		const partial = { content: [{ type: 'text', text: '' }, toolCall] };
		expect(streamingToolCallBlock(partial, 1)).toEqual({
			id: 'call-1',
			name: 'create_scene',
			arguments: { name: 'Login', viewport: 'mobile' }
		});
	});

	it('falls back to the last block when the index is out of range', () => {
		expect(streamingToolCallBlock({ content: [toolCall] }, 5)?.id).toBe('call-1');
		expect(streamingToolCallBlock({ content: [toolCall] }, undefined)?.id).toBe('call-1');
	});

	it('ignores blocks that are not tool calls or have no id', () => {
		expect(streamingToolCallBlock({ content: [{ type: 'text', text: 'hi' }] }, 0)).toBeNull();
		expect(streamingToolCallBlock({ content: [{ type: 'toolCall', name: 'x' }] }, 0)).toBeNull();
		expect(streamingToolCallBlock(null, 0)).toBeNull();
		expect(streamingToolCallBlock({}, 0)).toBeNull();
	});

	it('defaults a missing name to an empty string', () => {
		expect(streamingToolCallBlock({ content: [{ type: 'toolCall', id: 'call-2' }] }, 0)).toEqual({
			id: 'call-2',
			name: '',
			arguments: undefined
		});
	});
});
