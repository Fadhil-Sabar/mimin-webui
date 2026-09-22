import type { BrowserBridgeContext } from '../browser/bridge';
import type { QuestionContext, QuestionEvent } from './question-broker';
import {
	createBrowserInteractTool,
	createBrowserOpenTool,
	createBrowserReadTabTool,
	createBrowserSearchTool,
	createBrowserTabsTool,
	type BrowserToolEvent
} from './tools/browser.tool';
import { createWebSearchTool } from './tools/web-search.tool';
import { createWebFetchTool } from './tools/web-fetch.tool';
import { createProjectKnowledgeTool } from './tools/project-knowledge.tool';
import { createAskQuestionTool } from './tools/question.tool';
import { createCreateSkillTool } from './tools/skill.tool';
import {
	createInspectCanvasTool,
	createCreateSceneTool,
	createEditSceneTool,
	createDeleteSceneTool,
	createCreateConnectionTool,
	createDeleteConnectionTool,
	createUpdateStyleGuidelineTool
} from './tools/canvas.tool';
import type { TurnContext } from './turn-context';
import type { AppEvent } from './agent-messages';

/**
 * Assembles the tool list for one turn from the gated capabilities resolved in
 * the turn context. Browser tools only exist when a bridge can serve them.
 */
export function buildTurnTools(
	ctx: TurnContext,
	{
		emit,
		browserBridgeEnabled,
		turnEnabledTools
	}: {
		emit: (event: AppEvent) => void;
		browserBridgeEnabled: boolean;
		turnEnabledTools?: string[];
	}
) {
	const {
		conversationId,
		turnToken,
		effectiveUserId,
		conversation,
		enabledTools,
		searchSettings,
		toolGating,
		canvas
	} = ctx;
	const browserContext: BrowserBridgeContext | null = effectiveUserId
		? { userId: effectiveUserId, conversationId, turnToken }
		: null;
	const browserEmit = (event: BrowserToolEvent) => emit(event);

	const tools = [
		...(toolGating.exposeWebSearch ? [createWebSearchTool(searchSettings)] : []),
		...(toolGating.exposeWebFetch
			? [
					createWebFetchTool(
						// A JavaScript shell is read through the user's browser when that bridge is available.
						browserContext && browserBridgeEnabled
							? { context: browserContext, emit: browserEmit }
							: undefined
					)
				]
			: []),
		...(conversation.projectId && enabledTools.includes('project_knowledge_search')
			? [createProjectKnowledgeTool(conversation.projectId, effectiveUserId)]
			: []),
		...(toolGating.exposeBrowserOpen && browserContext
			? [createBrowserOpenTool(browserContext, browserEmit)]
			: []),
		...(toolGating.exposeBrowserSearch && browserContext
			? [createBrowserSearchTool(browserContext, browserEmit)]
			: []),
		...(toolGating.exposeBrowserTabs && browserContext
			? [
					createBrowserTabsTool(browserContext, browserEmit),
					createBrowserReadTabTool(browserContext, browserEmit),
					createBrowserInteractTool(browserContext, browserEmit)
				]
			: []),
		...(enabledTools.includes('ask_question')
			? [
					createAskQuestionTool(
						{
							userId: effectiveUserId || '',
							conversationId,
							turnToken
						} satisfies QuestionContext,
						(event: QuestionEvent) => emit(event)
					)
				]
			: []),
		...(effectiveUserId && (enabledTools.includes('create_skill') || !turnEnabledTools)
			? [
					createCreateSkillTool({
						userId: effectiveUserId,
						conversationProjectId: conversation.projectId ?? null
					})
				]
			: []),
		...(canvas
			? [
					createInspectCanvasTool({ userId: effectiveUserId, canvasId: canvas.id }),
					createCreateSceneTool({ userId: effectiveUserId, canvasId: canvas.id }, (e) => emit(e)),
					createEditSceneTool({ userId: effectiveUserId, canvasId: canvas.id }, (e) => emit(e)),
					createDeleteSceneTool({ userId: effectiveUserId, canvasId: canvas.id }, (e) => emit(e)),
					createCreateConnectionTool({ userId: effectiveUserId, canvasId: canvas.id }, (e) =>
						emit(e)
					),
					createDeleteConnectionTool({ userId: effectiveUserId, canvasId: canvas.id }, (e) =>
						emit(e)
					),
					createUpdateStyleGuidelineTool({ userId: effectiveUserId, canvasId: canvas.id }, (e) =>
						emit(e)
					)
				]
			: [])
	];
	return tools;
}
