import { Agent } from '@earendil-works/pi-agent-core';
import { createFauxCore, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAgentEventQueue } from '../src/lib/server/ai/agent-event-queue';

/**
 * Ordering test across the real agent loop.
 *
 * A tool can emit its own events from inside `execute` (the first-use browser
 * consent prompt does). Those events are attached to the tool call by id on the
 * client, so the `tool.start` frame that creates that tool call must be sent
 * first. That only holds while the event queue is handed back to the SDK, which
 * awaits each subscriber promise before it runs the tool call.
 *
 * Scripted responses come from pi-ai's in-memory faux provider, so this exercises
 * the real loop without a provider credential.
 */
function runTurn() {
	const emitted: string[] = [];
	const faux = createFauxCore({ models: [{ id: 'faux-test-model' }] });

	faux.setResponses([
		fauxAssistantMessage(
			[
				fauxToolCall('browser_interact', {
					action: 'type',
					tabId: 5,
					ref: 0,
					text: 'cafe',
					submit: true
				})
			],
			{ stopReason: 'toolUse' }
		),
		fauxAssistantMessage('done')
	]);

	const tool = {
		name: 'browser_interact',
		label: 'Interact with browser tab',
		description: 'Type into a tab, which needs consent first.',
		parameters: z.object({
			action: z.string(),
			tabId: z.number(),
			ref: z.number(),
			text: z.string(),
			submit: z.boolean()
		}),
		execute: async () => {
			// Stands in for ensureBrowserTabConsent emitting its prompt.
			emitted.push('browser.consent.request');
			return { content: [{ type: 'text' as const, text: 'typed' }], details: {} };
		}
	};

	const agent = new Agent({
		initialState: {
			systemPrompt: 'test',
			model: faux.getModel(),
			messages: [],
			tools: [tool]
		},
		streamFn: faux.streamSimple,
		toolExecution: 'sequential'
	});

	// Same wiring as runConversationTurn: persist and forward an event before the
	// loop is allowed to act on it.
	const events = createAgentEventQueue(
		agent,
		async (event) => {
			if (event.type === 'tool_execution_start') {
				// Persistence takes a turn of the event loop, exactly as the DB
				// writes in the service do.
				await new Promise((resolve) => setTimeout(resolve, 0));
				emitted.push('tool.start');
			}
		},
		(error) => {
			throw error;
		}
	);

	return { agent, events, emitted };
}

describe('agent event ordering', () => {
	it('forwards tool.start before events the tool emits itself', async () => {
		const { agent, events, emitted } = runTurn();

		await agent.prompt('search for cafe in the open tab');
		await events.drain();

		expect(emitted).toEqual(['tool.start', 'browser.consent.request']);
	});
});
