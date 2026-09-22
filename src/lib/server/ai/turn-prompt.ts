import { buildUserSystemPrompt } from './user-instructions.service';
import { buildProjectSystemPrompt } from './project-context';
import { AGENT_SYSTEM_PROMPT, buildSkillSystemPrompt } from './agent-policy';
import {
	getBrowserUnavailableInstruction,
	getPendingBrowserActionInstruction,
	getTurnRoutingInstruction
} from './tool-routing';
import type { TurnContext } from './turn-context';

/**
 * System prompt (base policy → user instructions → project → skill → canvas)
 * plus the per-turn instructions that ride at the end of the prompt instead of
 * the system prompt, keeping the cacheable prefix stable.
 */
export function buildTurnPrompts(ctx: TurnContext): { systemPrompt: string; turnPrompt: string } {
	const {
		promptWithAttachments,
		userInstructions,
		project,
		turnSkillSnapshot,
		canvas,
		toolGating,
		pendingBrowserAction
	} = ctx;
	const routingInstruction =
		toolGating.blockedReason === 'browser_bridge_unavailable'
			? getBrowserUnavailableInstruction(toolGating.browserIntent)
			: getTurnRoutingInstruction(toolGating.browserIntent);
	let systemPrompt = buildUserSystemPrompt(AGENT_SYSTEM_PROMPT, userInstructions);
	systemPrompt = buildProjectSystemPrompt(systemPrompt, project?.instructions);
	systemPrompt = buildSkillSystemPrompt(systemPrompt, turnSkillSnapshot);
	if (canvas) {
		systemPrompt = `${systemPrompt}\n\nCanvas Workspace Context:
You are working in an active visual Canvas named "${canvas.title}".
Style Guideline (design contract for all scenes):
- Direction: ${canvas.styleGuideline.direction}
- Rules: ${canvas.styleGuideline.rules.join('; ')}
- Avoidances: ${canvas.styleGuideline.avoidances.join('; ')}
- Design Tokens: ${JSON.stringify(canvas.styleGuideline.tokens)}

Scenes currently in Canvas (${canvas.scenes.length}):
${canvas.scenes.map((s) => `- [${s.id}] "${s.name}" (${s.viewport})`).join('\n')}

Instructions for Canvas Mockups:
1. Always adhere to the Canvas Style Guideline (tokens, rules, avoidances). Do NOT introduce random arbitrary colors outside the tokens.
2. Use library-agnostic standard semantic HTML, CSS, and lightweight JS. Do NOT lock to shadcn or any framework.
3. You have tools to inspect the canvas, create scenes, edit scenes, delete scenes, and update the style guideline.
	4. When the user asks for a UI screen or mockup, create or edit the corresponding scene using the canvas tools.
5. Do not invent scene coordinates: omit positionX and positionY when creating a scene so the Canvas places it in a free slot without overlapping another frame.
6. Navigation connections are directed flows between existing scenes. Use create_connection and delete_connection when the user asks to add or remove a flow.`;
	}
	// Per-turn instructions are kept out of the system prompt: they change on every
	// turn, and the system prompt plus tool schemas plus replayed history are the
	// prefix the provider caches. They ride at the end of the turn's prompt instead,
	// next to the user's message they apply to.
	const turnInstructions: string[] = [];
	if (routingInstruction) turnInstructions.push(routingInstruction);
	if (pendingBrowserAction) {
		turnInstructions.push(getPendingBrowserActionInstruction(pendingBrowserAction));
		if (!toolGating.exposeBrowserOpen) {
			turnInstructions.push(
				'Browser tools are not available in this request because the browser bridge is not connected. Do not substitute another tool for the pending action; explain that the bridge still is not detected.'
			);
		}
	}
	const turnPrompt = turnInstructions.length
		? `${promptWithAttachments}\n\n${turnInstructions.join('\n\n')}`
		: promptWithAttachments;
	return { systemPrompt, turnPrompt };
}
