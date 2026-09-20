import { describe, expect, it } from 'vitest';
import { createTurnTiming, formatTurnTiming } from '../src/lib/server/ai/turn-timing';

describe('turn timing', () => {
	it('splits a turn into context, provider, tool and persist time', () => {
		let now = 0;
		const timing = createTurnTiming(() => now);

		now = 120;
		timing.markContextAssembled({ promptChars: 1_000, historyMessages: 4, attachmentChars: 200 });
		now = 130;
		timing.beginPrompt();
		now = 180;
		timing.markFirstToken();
		timing.beginTool();
		now = 1_300;
		timing.endTool();
		now = 2_000;
		timing.endPrompt();
		timing.beginPersist();
		now = 2_050;
		timing.endPersist();

		expect(timing.snapshot()).toEqual({
			totalMs: 2_050,
			contextMs: 120,
			promptMs: 1_870,
			toolMs: 1_120,
			providerMs: 750,
			firstTokenMs: 180,
			persistMs: 50,
			toolCalls: 1,
			autoContinues: 0,
			promptChars: 1_000,
			historyMessages: 4,
			attachmentChars: 200
		});
	});

	it('accumulates repeated model round trips and keeps the first token mark', () => {
		let now = 0;
		const timing = createTurnTiming(() => now);

		now = 10;
		timing.beginPrompt();
		now = 60;
		timing.endPrompt();
		now = 70;
		timing.beginPrompt();
		now = 120;
		timing.endPrompt();
		now = 130;
		timing.markFirstToken();
		now = 140;
		timing.markFirstToken();
		timing.markAutoContinue();

		const snapshot = timing.snapshot();
		expect(snapshot.promptMs).toBe(100);
		expect(snapshot.providerMs).toBe(100);
		expect(snapshot.firstTokenMs).toBe(130);
		expect(snapshot.autoContinues).toBe(1);
		expect(snapshot.toolCalls).toBe(0);
	});

	it('ignores unbalanced end marks', () => {
		let now = 0;
		const timing = createTurnTiming(() => now);
		now = 50;
		timing.endPrompt();
		timing.endTool();
		timing.endPersist();

		const snapshot = timing.snapshot();
		expect(snapshot.promptMs).toBe(0);
		expect(snapshot.toolMs).toBe(0);
		expect(snapshot.persistMs).toBe(0);
		expect(snapshot.firstTokenMs).toBeNull();
	});

	it('formats one line that can be grepped out of container logs', () => {
		let now = 0;
		const timing = createTurnTiming(() => now);
		now = 120;
		timing.markContextAssembled({ promptChars: 5_000, historyMessages: 12 });
		const line = formatTurnTiming(timing.snapshot());

		expect(line).toContain('[turn-timing]');
		expect(line).toContain('context=120ms');
		expect(line).toContain('provider=0ms');
		expect(line).toContain('firstToken=none');
		expect(line).toContain('history=12');
	});
});
