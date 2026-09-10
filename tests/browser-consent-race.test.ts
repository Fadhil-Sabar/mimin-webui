import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	applyConsentDecision,
	attachOrBufferConsent,
	consentFromEvent,
	flushConsentBuffer,
	isConsentPending,
	type ConsentBuffer,
	type ConsentState
} from '../src/lib/client/consent-state';

/**
 * Regression test for a prompt that reached the browser before its tool call.
 *
 * The server emits `browser.consent.request` from inside the tool and
 * `tool.start` from the agent's event handler. In a real turn the prompt frame
 * arrived first (see tests/fixtures/browser-consent-race-frames.json, taken from
 * the browser's cache of the live response), the client found no tool call to
 * attach it to, dropped it, and the tool hung for its full five-minute consent
 * timeout while the user watched a "Running..." card with no prompt.
 */

type ToolCall = { toolCallId: string; toolName: string; consent?: ConsentState };
type Message = { id: string; role: string; toolCalls?: ToolCall[] };

type CapturedFrame = { type: string; [key: string]: unknown };

const fixture = JSON.parse(
	readFileSync(
		fileURLToPath(new URL('./fixtures/browser-consent-race-frames.json', import.meta.url)),
		'utf8'
	)
) as { frames: CapturedFrame[] };

/**
 * The page adds a tool call to the assistant message that is streaming; only the
 * consent-relevant part is reproduced here so the frame order can be replayed.
 */
function applyToolStart(messages: Message[], frame: CapturedFrame): Message[] {
	const toolCallId = String(frame.toolCallId);
	const target = frame.messageId ? String(frame.messageId) : messages.at(-1)?.id;
	return messages.map((message) =>
		message.id === target
			? {
					...message,
					toolCalls: [
						...(message.toolCalls ?? []),
						{ toolCallId, toolName: String(frame.tool ?? 'tool') }
					]
				}
			: message
	);
}

function assistantTurn(): Message[] {
	return [
		{ id: 'user-1', role: 'user' },
		{ id: '2a3ed3f0-0415-4e4c-8ca3-692c4a422f4d', role: 'assistant' }
	];
}

function consentOf(message: Message, toolCallId: string): ConsentState | undefined {
	return message.toolCalls?.find((call) => call.toolCallId === toolCallId)?.consent;
}

describe('browser consent frame ordering', () => {
	it('captured the prompt before the tool call that it belongs to', () => {
		expect(fixture.frames.map((frame) => frame.type)).toEqual([
			'browser.consent.request',
			'message.end',
			'tool.start'
		]);
	});

	it('holds a prompt that arrives before its tool call and attaches it once the call appears', () => {
		let messages = assistantTurn();
		let buffer: ConsentBuffer = {};

		// Frame 1 of the captured turn: the prompt, with no tool call in sight.
		const consent = consentFromEvent(fixture.frames[0]);
		expect(consent).not.toBeNull();
		const held = attachOrBufferConsent(messages, buffer, consent!);
		messages = held.messages;
		buffer = held.buffer;

		// The prompt is not lost, and it is not attached to a message that cannot
		// render it either.
		expect(buffer[consent!.requestId]).toEqual(consent);
		expect(messages.flatMap((m) => m.toolCalls ?? [])).toHaveLength(0);

		// Frame 2 is a message.end, which carries no consent state.
		// Frame 3: the tool call finally arrives.
		const toolStart = fixture.frames[2];
		messages = applyToolStart(messages, toolStart);
		const flushed = flushConsentBuffer(messages, buffer);
		messages = flushed.messages;
		buffer = flushed.buffer;

		expect(flushed.attached).toBe(true);
		expect(buffer).toEqual({});
		const attached = consentOf(messages[1], String(toolStart.toolCallId));
		expect(attached?.requestId).toBe('call_00_KYpbYkJPePJMA2BI3fHI4613');
		expect(attached?.action).toBe('browser_interact');
		expect(attached?.tabId).toBe(5);

		// This is what makes the card render, and what the user never got.
		expect(isConsentPending(attached)).toBe(true);
	});

	it('attaches immediately when the tool call arrives first', () => {
		const toolStart = fixture.frames[2];
		const consent = consentFromEvent(fixture.frames[0])!;
		let messages = applyToolStart(assistantTurn(), toolStart);
		let buffer: ConsentBuffer = {};

		const next = attachOrBufferConsent(messages, buffer, consent);
		messages = next.messages;
		buffer = next.buffer;

		expect(buffer).toEqual({});
		expect(consentOf(messages[1], String(toolStart.toolCallId))?.requestId).toBe(consent.requestId);
	});

	it('keeps an unclaimed prompt held instead of attaching it to another tool call', () => {
		const consent = consentFromEvent(fixture.frames[0])!;
		const otherCall: Message[] = [
			{
				id: 'assistant-1',
				role: 'assistant',
				toolCalls: [{ toolCallId: 'call-someone-else', toolName: 'browser_tabs' }]
			}
		];

		const next = attachOrBufferConsent(otherCall, {}, consent);

		expect(next.messages).toBe(otherCall);
		expect(consentOf(otherCall[0], 'call-someone-else')).toBeUndefined();
		expect(Object.keys(next.buffer)).toEqual([consent.requestId]);
	});

	it('records the answer on a prompt that was held until its tool call arrived', () => {
		const toolStart = fixture.frames[2];
		const consent = consentFromEvent(fixture.frames[0])!;

		// Prompt first, tool call second, exactly as the live turn ordered them.
		const held = attachOrBufferConsent(assistantTurn(), {}, consent);
		let messages = applyToolStart(held.messages, toolStart);
		messages = flushConsentBuffer(messages, held.buffer).messages;

		messages = applyConsentDecision(messages, consent.requestId, 'once');

		expect(consentOf(messages[1], consent.requestId)?.decision).toBe('once');
		expect(isConsentPending(consentOf(messages[1], consent.requestId))).toBe(false);
	});
});
