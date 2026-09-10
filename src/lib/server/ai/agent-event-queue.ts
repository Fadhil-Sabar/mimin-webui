import type { AgentEvent } from '@earendil-works/pi-agent-core';

/**
 * Serialize agent lifecycle events with tool execution.
 *
 * `processEvents` awaits every subscriber promise, so this queue is handed back
 * to the SDK on purpose: the loop then waits for an event to be persisted and
 * forwarded before it runs the tool call for that event.
 *
 * That ordering is load-bearing. A tool can emit its own events from inside
 * `execute`, which runs as soon as its `tool_execution_start` event has been
 * received. Without the await, a browser consent prompt can reach the client
 * before the `tool.start` frame that creates the tool call the prompt hangs off,
 * and the prompt is dropped.
 */
export function createAgentEventQueue(
	agent: { subscribe: (listener: (event: AgentEvent) => Promise<void>) => unknown },
	handle: (event: AgentEvent) => Promise<void>,
	onError: (error: unknown) => void
) {
	let queue: Promise<void> = Promise.resolve();

	agent.subscribe((event) => {
		queue = queue.then(() => handle(event)).catch(onError);
		return queue;
	});

	return {
		/** Wait until the queue stops growing, including work added while draining. */
		async drain() {
			while (true) {
				const pending = queue;
				await pending;
				if (pending === queue) return;
			}
		}
	};
}
