import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ViewportDevice, StyleGuideline } from '$lib/canvas';
import {
	getCanvasWithDetails,
	addCanvasScene,
	updateCanvasScene,
	deleteCanvasScene,
	updateCanvasGuideline,
	createCanvasConnection,
	deleteCanvasConnection
} from '../../canvas.service';

export type CanvasToolContext = {
	userId: string;
	canvasId: string;
};

export type CanvasEvent =
	| { type: 'canvas.updated'; canvasId: string; revision: number; action: string }
	| { type: 'canvas.scene_created'; canvasId: string; sceneId: string; revision: number }
	| { type: 'canvas.scene_updated'; canvasId: string; sceneId: string; revision: number }
	| { type: 'canvas.scene_deleted'; canvasId: string; sceneId: string; revision: number }
	| {
			type: 'canvas.connection_created';
			canvasId: string;
			connectionId: string;
			sourceSceneId: string;
			targetSceneId: string;
			revision: number;
	  }
	| { type: 'canvas.connection_deleted'; canvasId: string; connectionId: string; revision: number };

export const inspectCanvasParameters = Type.Object({
	includeCode: Type.Optional(
		Type.Boolean({
			description:
				'Whether to include the full HTML/CSS/JS source of all scenes. Defaults to false.'
		})
	)
});

export function createInspectCanvasTool(
	context: CanvasToolContext
): AgentTool<typeof inspectCanvasParameters> {
	return {
		name: 'inspect_canvas',
		label: 'Inspect Canvas',
		description:
			'Inspect the current Canvas: view its style guidelines (tokens, rules, avoidances, direction) and scene list with viewport and metadata.',
		parameters: inspectCanvasParameters,
		execute: async (_toolCallId, params) => {
			const canvas = await getCanvasWithDetails(context.canvasId, context.userId);
			if (!canvas) {
				return {
					content: [{ type: 'text', text: 'Canvas not found.' }],
					details: { error: 'Canvas not found' },
					isError: true
				};
			}

			const summary = {
				id: canvas.id,
				title: canvas.title,
				description: canvas.description,
				revision: canvas.revision,
				activeSceneId: canvas.activeSceneId,
				styleGuideline: canvas.styleGuideline,
				scenes: canvas.scenes.map(
					(s: {
						id: string;
						name: string;
						viewport: ViewportDevice;
						order: number;
						positionX: number;
						positionY: number;
						description?: string;
						html: string;
						css: string;
						js?: string;
					}) => ({
						id: s.id,
						name: s.name,
						viewport: s.viewport,
						order: s.order,
						positionX: s.positionX,
						positionY: s.positionY,
						description: s.description,
						...(params.includeCode ? { html: s.html, css: s.css, js: s.js } : {})
					})
				),
				connections: canvas.connections
			};

			return {
				content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
				details: summary
			};
		}
	};
}

export const createSceneParameters = Type.Object({
	name: Type.String({
		minLength: 1,
		maxLength: 120,
		description: 'Name of the scene/screen (e.g. "Mobile Checkout", "Dashboard Desktop").'
	}),
	viewport: Type.Union([Type.Literal('mobile'), Type.Literal('tablet'), Type.Literal('desktop')], {
		description: 'Target viewport for the scene mockup: "mobile", "tablet", or "desktop".'
	}),
	positionX: Type.Optional(
		Type.Number({
			description:
				'Horizontal position of the scene frame in Canvas coordinates. Omit to let the Canvas pick a free slot; a position that would overlap another frame is moved automatically.'
		})
	),
	positionY: Type.Optional(
		Type.Number({
			description:
				'Vertical position of the scene frame in Canvas coordinates. Omit to let the Canvas pick a free slot; a position that would overlap another frame is moved automatically.'
		})
	),
	description: Type.Optional(
		Type.String({
			maxLength: 2000,
			description: 'Brief description of what this scene or mockup demonstrates.'
		})
	),
	html: Type.String({
		description:
			'Semantic HTML markup for the mockup. Use the canvas Style Guideline tokens/classes.'
	}),
	css: Type.Optional(
		Type.String({
			description: 'Scoped or component CSS styling adhering to the Canvas Style Guideline.'
		})
	),
	js: Type.Optional(
		Type.String({
			description: 'Optional lightweight JavaScript for interactive mockup behavior.'
		})
	)
});

export function createCreateSceneTool(
	context: CanvasToolContext,
	emit?: (event: CanvasEvent) => void
): AgentTool<typeof createSceneParameters> {
	return {
		name: 'create_scene',
		label: 'Create Canvas Scene',
		description:
			'Create a new visual scene/screen mockup in the current Canvas with semantic HTML, CSS, and chosen viewport (mobile, tablet, desktop). Omit positionX and positionY so the Canvas places the scene in the next free slot.',
		parameters: createSceneParameters,
		execute: async (_toolCallId, params) => {
			try {
				const { canvas, sceneId } = await addCanvasScene(context.canvasId, context.userId, {
					name: params.name,
					viewport: params.viewport as ViewportDevice,
					positionX: params.positionX,
					positionY: params.positionY,
					description: params.description,
					html: params.html,
					css: params.css ?? '',
					js: params.js ?? ''
				});

				emit?.({
					type: 'canvas.scene_created',
					canvasId: canvas.id,
					sceneId,
					revision: canvas.revision
				});

				return {
					content: [
						{
							type: 'text',
							text: `Created scene "${params.name}" (${params.viewport}) [ID: ${sceneId}] in Canvas. Revision is now ${canvas.revision}.`
						}
					],
					details: { sceneId, canvasId: canvas.id, revision: canvas.revision }
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : 'Could not create scene';
				return {
					content: [{ type: 'text', text: `Error: ${msg}` }],
					details: { error: msg },
					isError: true
				};
			}
		}
	};
}

export const editSceneParameters = Type.Object({
	sceneId: Type.String({
		description: 'The unique ID of the scene to edit.'
	}),
	name: Type.Optional(
		Type.String({
			minLength: 1,
			maxLength: 120,
			description: 'Updated name of the scene.'
		})
	),
	viewport: Type.Optional(
		Type.Union([Type.Literal('mobile'), Type.Literal('tablet'), Type.Literal('desktop')], {
			description: 'Updated target viewport: "mobile", "tablet", or "desktop".'
		})
	),
	positionX: Type.Optional(
		Type.Number({ description: 'Updated horizontal position in Canvas coordinates.' })
	),
	positionY: Type.Optional(
		Type.Number({ description: 'Updated vertical position in Canvas coordinates.' })
	),
	description: Type.Optional(
		Type.String({
			maxLength: 2000,
			description: 'Updated description of the scene.'
		})
	),
	html: Type.Optional(
		Type.String({
			description: 'Updated HTML markup for the scene.'
		})
	),
	css: Type.Optional(
		Type.String({
			description: 'Updated CSS stylesheet for the scene.'
		})
	),
	js: Type.Optional(
		Type.String({
			description: 'Updated JavaScript for the scene.'
		})
	)
});

export function createEditSceneTool(
	context: CanvasToolContext,
	emit?: (event: CanvasEvent) => void
): AgentTool<typeof editSceneParameters> {
	return {
		name: 'edit_scene',
		label: 'Edit Canvas Scene',
		description:
			'Update an existing scene mockup in the Canvas (HTML, CSS, JS, name, viewport, or description).',
		parameters: editSceneParameters,
		execute: async (_toolCallId, params) => {
			try {
				const canvas = await updateCanvasScene(context.canvasId, params.sceneId, context.userId, {
					name: params.name,
					viewport: params.viewport as ViewportDevice | undefined,
					positionX: params.positionX,
					positionY: params.positionY,
					description: params.description,
					html: params.html,
					css: params.css,
					js: params.js
				});

				emit?.({
					type: 'canvas.scene_updated',
					canvasId: canvas.id,
					sceneId: params.sceneId,
					revision: canvas.revision
				});

				return {
					content: [
						{
							type: 'text',
							text: `Updated scene ${params.sceneId} successfully. Canvas revision is now ${canvas.revision}.`
						}
					],
					details: { sceneId: params.sceneId, canvasId: canvas.id, revision: canvas.revision }
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : 'Could not update scene';
				return {
					content: [{ type: 'text', text: `Error: ${msg}` }],
					details: { error: msg },
					isError: true
				};
			}
		}
	};
}

export const deleteSceneParameters = Type.Object({
	sceneId: Type.String({
		description: 'The unique ID of the scene to delete.'
	})
});

export function createDeleteSceneTool(
	context: CanvasToolContext,
	emit?: (event: CanvasEvent) => void
): AgentTool<typeof deleteSceneParameters> {
	return {
		name: 'delete_scene',
		label: 'Delete Canvas Scene',
		description: 'Delete a scene mockup from the current Canvas. At least one scene must remain.',
		parameters: deleteSceneParameters,
		execute: async (_toolCallId, params) => {
			try {
				const canvas = await deleteCanvasScene(context.canvasId, params.sceneId, context.userId);

				emit?.({
					type: 'canvas.scene_deleted',
					canvasId: canvas.id,
					sceneId: params.sceneId,
					revision: canvas.revision
				});

				return {
					content: [
						{
							type: 'text',
							text: `Deleted scene ${params.sceneId}. Canvas revision is now ${canvas.revision}.`
						}
					],
					details: { sceneId: params.sceneId, canvasId: canvas.id, revision: canvas.revision }
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : 'Could not delete scene';
				return {
					content: [{ type: 'text', text: `Error: ${msg}` }],
					details: { error: msg },
					isError: true
				};
			}
		}
	};
}

export const createConnectionParameters = Type.Object({
	sourceSceneId: Type.String({
		description: 'The unique ID of the scene where this navigation flow starts.'
	}),
	targetSceneId: Type.String({
		description: 'The unique ID of the scene where this navigation flow ends.'
	})
});

export function createCreateConnectionTool(
	context: CanvasToolContext,
	emit?: (event: CanvasEvent) => void
): AgentTool<typeof createConnectionParameters> {
	return {
		name: 'create_connection',
		label: 'Create Canvas Connection',
		description:
			'Connect two scenes with a directed navigation flow. Both scenes must belong to the current Canvas; self-connections and duplicate directions are rejected.',
		parameters: createConnectionParameters,
		execute: async (_toolCallId, params) => {
			try {
				const { canvas, connection } = await createCanvasConnection(
					context.canvasId,
					context.userId,
					params
				);

				emit?.({
					type: 'canvas.connection_created',
					canvasId: canvas.id,
					connectionId: connection.id,
					sourceSceneId: connection.sourceSceneId,
					targetSceneId: connection.targetSceneId,
					revision: canvas.revision
				});

				return {
					content: [
						{
							type: 'text',
							text: `Connected scene ${connection.sourceSceneId} to ${connection.targetSceneId}. Canvas revision is now ${canvas.revision}.`
						}
					],
					details: {
						connectionId: connection.id,
						canvasId: canvas.id,
						sourceSceneId: connection.sourceSceneId,
						targetSceneId: connection.targetSceneId,
						revision: canvas.revision
					}
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : 'Could not create connection';
				return {
					content: [{ type: 'text', text: `Error: ${msg}` }],
					details: { error: msg },
					isError: true
				};
			}
		}
	};
}

export const deleteConnectionParameters = Type.Object({
	connectionId: Type.String({ description: 'The unique ID of the connection to delete.' })
});

export function createDeleteConnectionTool(
	context: CanvasToolContext,
	emit?: (event: CanvasEvent) => void
): AgentTool<typeof deleteConnectionParameters> {
	return {
		name: 'delete_connection',
		label: 'Delete Canvas Connection',
		description: 'Delete a directed navigation flow from the current Canvas.',
		parameters: deleteConnectionParameters,
		execute: async (_toolCallId, params) => {
			try {
				const canvas = await deleteCanvasConnection(
					context.canvasId,
					params.connectionId,
					context.userId
				);

				emit?.({
					type: 'canvas.connection_deleted',
					canvasId: canvas.id,
					connectionId: params.connectionId,
					revision: canvas.revision
				});

				return {
					content: [
						{
							type: 'text',
							text: `Deleted connection ${params.connectionId}. Canvas revision is now ${canvas.revision}.`
						}
					],
					details: {
						connectionId: params.connectionId,
						canvasId: canvas.id,
						revision: canvas.revision
					}
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : 'Could not delete connection';
				return {
					content: [{ type: 'text', text: `Error: ${msg}` }],
					details: { error: msg },
					isError: true
				};
			}
		}
	};
}

export const updateStyleGuidelineParameters = Type.Object({
	direction: Type.Optional(
		Type.String({
			maxLength: 5000,
			description: 'High-level aesthetic and design direction statement.'
		})
	),
	rules: Type.Optional(
		Type.Array(Type.String({ maxLength: 2000 }), {
			description: 'Qualitative human-readable design rules and contracts.'
		})
	),
	avoidances: Type.Optional(
		Type.Array(Type.String({ maxLength: 2000 }), {
			description: 'Things to avoid in this canvas (e.g. unharmonized colors, non-standard fonts).'
		})
	),
	tokens: Type.Optional(
		Type.Record(Type.String(), Type.Any(), {
			description: 'Structured design token object (colors, typography, spacing, radii, etc.).'
		})
	)
});

export function createUpdateStyleGuidelineTool(
	context: CanvasToolContext,
	emit?: (event: CanvasEvent) => void
): AgentTool<typeof updateStyleGuidelineParameters> {
	return {
		name: 'update_style_guideline',
		label: 'Update Style Guideline',
		description:
			'Update the Style Guideline contract for this Canvas (structured tokens, rules, avoidances, direction). All scenes must adhere to this guideline.',
		parameters: updateStyleGuidelineParameters,
		execute: async (_toolCallId, params) => {
			try {
				const current = await getCanvasWithDetails(context.canvasId, context.userId);
				if (!current) throw new Error('CANVAS_NOT_FOUND');

				const currentTokens = current.styleGuideline.tokens as Record<string, unknown>;
				const mergedTokens: Record<string, unknown> = {
					...currentTokens,
					...(params.tokens ?? {})
				};
				if (params.tokens && typeof params.tokens === 'object') {
					for (const key of Object.keys(params.tokens)) {
						const nextVal = (params.tokens as Record<string, unknown>)[key];
						const currVal = currentTokens[key];
						if (
							nextVal &&
							typeof nextVal === 'object' &&
							!Array.isArray(nextVal) &&
							currVal &&
							typeof currVal === 'object' &&
							!Array.isArray(currVal)
						) {
							mergedTokens[key] = {
								...(currVal as Record<string, unknown>),
								...(nextVal as Record<string, unknown>)
							};
						}
					}
				}

				const updatedGuideline: StyleGuideline = {
					direction: params.direction ?? current.styleGuideline.direction,
					rules: params.rules ?? current.styleGuideline.rules,
					avoidances: params.avoidances ?? current.styleGuideline.avoidances,
					tokens: mergedTokens
				};

				const canvas = await updateCanvasGuideline(
					context.canvasId,
					context.userId,
					updatedGuideline
				);

				emit?.({
					type: 'canvas.updated',
					canvasId: canvas.id,
					revision: canvas.revision,
					action: 'style_guideline_updated'
				});

				return {
					content: [
						{
							type: 'text',
							text: `Style guideline updated. Revision is now ${canvas.revision}.`
						}
					],
					details: {
						canvasId: canvas.id,
						revision: canvas.revision,
						styleGuideline: canvas.styleGuideline
					}
				};
			} catch (error) {
				const msg = error instanceof Error ? error.message : 'Could not update style guideline';
				return {
					content: [{ type: 'text', text: `Error: ${msg}` }],
					details: { error: msg },
					isError: true
				};
			}
		}
	};
}
