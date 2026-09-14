import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from './db/client';
import {
	DEFAULT_STYLE_GUIDELINE,
	findFreeScenePosition,
	planSceneLayout,
	sceneFramesOverlap,
	type CanvasDetail,
	type CanvasConnection,
	type CanvasSummary,
	type ScenePlacement,
	type StyleGuideline,
	type ViewportDevice
} from '$lib/canvas';
import { getOwnedConversation, getOwnedProject } from './api';

function toPlacement(scene: {
	viewport?: string | null;
	positionX?: number | null;
	positionY?: number | null;
}): ScenePlacement {
	return {
		viewport: (scene.viewport as ViewportDevice) || 'desktop',
		positionX: Number(scene.positionX ?? 0),
		positionY: Number(scene.positionY ?? 0)
	};
}

/** Fallback positions for scenes that were stored without one. */
function getSceneLayoutFallbacks(scenes: Array<{ id: string; viewport?: string | null }>) {
	return planSceneLayout(
		scenes.map((scene) => ({
			id: scene.id,
			viewport: (scene.viewport as ViewportDevice) || 'desktop'
		}))
	);
}

export async function getCanvasWithDetails(
	canvasId: string,
	userId: string
): Promise<CanvasDetail | null> {
	const db = getDb();
	const [canvas] = await db
		.select()
		.from(schema.canvases)
		.where(and(eq(schema.canvases.id, canvasId), eq(schema.canvases.userId, userId)));

	if (!canvas) return null;

	const [scenes, assets, connections] = await Promise.all([
		db
			.select()
			.from(schema.canvasScenes)
			.where(eq(schema.canvasScenes.canvasId, canvasId))
			.orderBy(asc(schema.canvasScenes.order), asc(schema.canvasScenes.createdAt)),
		db
			.select()
			.from(schema.canvasAssets)
			.where(eq(schema.canvasAssets.canvasId, canvasId))
			.orderBy(asc(schema.canvasAssets.name)),
		// The fallback keeps service unit tests and partially migrated databases readable;
		// production schemas always expose canvasConnections.
		schema.canvasConnections
			? db
					.select()
					.from(schema.canvasConnections)
					.where(eq(schema.canvasConnections.canvasId, canvasId))
					.orderBy(asc(schema.canvasConnections.createdAt), asc(schema.canvasConnections.id))
			: Promise.resolve([])
	]);

	const layoutFallbacks = getSceneLayoutFallbacks(scenes);

	return {
		id: canvas.id,
		userId: canvas.userId,
		projectId: canvas.projectId,
		conversationId: canvas.conversationId,
		title: canvas.title,
		description: canvas.description,
		styleGuideline: canvas.styleGuideline,
		activeSceneId: canvas.activeSceneId,
		revision: canvas.revision,
		scenes: scenes.map((s) => ({
			id: s.id,
			canvasId: s.canvasId,
			name: s.name,
			description: s.description ?? undefined,
			viewport: (s.viewport as ViewportDevice) || 'desktop',
			order: s.order,
			positionX: Number(s.positionX ?? layoutFallbacks.get(s.id)?.x ?? 0),
			positionY: Number(s.positionY ?? layoutFallbacks.get(s.id)?.y ?? 0),
			html: s.html,
			css: s.css,
			js: s.js ?? '',
			createdAt: s.createdAt.toISOString(),
			updatedAt: s.updatedAt.toISOString()
		})),
		connections: connections.map((c): CanvasConnection => ({
			id: c.id,
			canvasId: c.canvasId,
			sourceSceneId: c.sourceSceneId,
			targetSceneId: c.targetSceneId,
			createdAt: c.createdAt.toISOString()
		})),
		assets: assets.map((a) => ({
			id: a.id,
			canvasId: a.canvasId,
			name: a.name,
			type: a.type as 'css' | 'js' | 'image' | 'font' | 'data' | 'svg',
			content: a.content,
			createdAt: a.createdAt.toISOString(),
			updatedAt: a.updatedAt.toISOString()
		})),
		createdAt: canvas.createdAt.toISOString(),
		updatedAt: canvas.updatedAt.toISOString()
	};
}

export async function listCanvases(
	userId: string,
	options: { projectId?: string | null; conversationId?: string | null } = {}
): Promise<CanvasSummary[]> {
	const db = getDb();
	const conditions = [eq(schema.canvases.userId, userId)];
	if (options.projectId) {
		conditions.push(eq(schema.canvases.projectId, options.projectId));
	}
	if (options.conversationId) {
		conditions.push(eq(schema.canvases.conversationId, options.conversationId));
	}

	const rows = await db
		.select({
			id: schema.canvases.id,
			userId: schema.canvases.userId,
			projectId: schema.canvases.projectId,
			conversationId: schema.canvases.conversationId,
			title: schema.canvases.title,
			description: schema.canvases.description,
			activeSceneId: schema.canvases.activeSceneId,
			revision: schema.canvases.revision,
			createdAt: schema.canvases.createdAt,
			updatedAt: schema.canvases.updatedAt,
			sceneCount: sql<number>`count(${schema.canvasScenes.id})::int`
		})
		.from(schema.canvases)
		.leftJoin(schema.canvasScenes, eq(schema.canvases.id, schema.canvasScenes.canvasId))
		.where(and(...conditions))
		.groupBy(schema.canvases.id)
		.orderBy(desc(schema.canvases.updatedAt));

	return rows.map((r) => ({
		id: r.id,
		userId: r.userId,
		projectId: r.projectId,
		conversationId: r.conversationId,
		title: r.title,
		description: r.description,
		activeSceneId: r.activeSceneId,
		revision: r.revision,
		sceneCount: r.sceneCount,
		createdAt: r.createdAt.toISOString(),
		updatedAt: r.updatedAt.toISOString()
	}));
}

export async function createCanvas(
	userId: string,
	input: {
		title: string;
		description?: string;
		projectId?: string | null;
		conversationId?: string | null;
		styleGuideline?: StyleGuideline;
	}
): Promise<CanvasDetail> {
	const db = getDb();
	let resolvedProjectId = input.projectId ?? null;

	if (input.conversationId) {
		const conversation = await getOwnedConversation(input.conversationId, userId);
		if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');

		const conversationProjectId = conversation.projectId ?? null;
		if (input.projectId !== undefined) {
			const requestedProjectId = input.projectId ?? null;
			if (requestedProjectId !== conversationProjectId) {
				throw new Error('PROJECT_CONVERSATION_MISMATCH');
			}
			resolvedProjectId = requestedProjectId;
		} else {
			resolvedProjectId = conversationProjectId;
		}

		// Enforce one Canvas per conversation deterministically
		const [existingForConversation] = await db
			.select({ id: schema.canvases.id })
			.from(schema.canvases)
			.where(eq(schema.canvases.conversationId, input.conversationId))
			.limit(1);

		if (existingForConversation) {
			const existingDetail = await getCanvasWithDetails(existingForConversation.id, userId);
			if (existingDetail) return existingDetail;
		}
	}

	if (resolvedProjectId) {
		const project = await getOwnedProject(resolvedProjectId, userId);
		if (!project) throw new Error('PROJECT_NOT_FOUND');
	}

	const styleGuideline = input.styleGuideline || DEFAULT_STYLE_GUIDELINE;

	const [canvas] = await db
		.insert(schema.canvases)
		.values({
			userId,
			title: input.title,
			description: input.description ?? '',
			projectId: resolvedProjectId,
			conversationId: input.conversationId ?? null,
			styleGuideline,
			revision: 1
		})
		.onConflictDoNothing({ target: schema.canvases.conversationId })
		.returning();

	if (!canvas) {
		if (input.conversationId) {
			const [existing] = await db
				.select({ id: schema.canvases.id })
				.from(schema.canvases)
				.where(eq(schema.canvases.conversationId, input.conversationId))
				.limit(1);
			if (existing) {
				const detail = await getCanvasWithDetails(existing.id, userId);
				if (detail) return detail;
			}
		}
		throw new Error('CANVAS_CREATION_FAILED');
	}

	return (await getCanvasWithDetails(canvas.id, userId))!;
}

export async function updateCanvasGuideline(
	canvasId: string,
	userId: string,
	guideline: StyleGuideline
): Promise<CanvasDetail> {
	const db = getDb();
	const [updated] = await db
		.update(schema.canvases)
		.set({
			styleGuideline: guideline,
			revision: sql`${schema.canvases.revision} + 1`,
			updatedAt: new Date()
		})
		.where(and(eq(schema.canvases.id, canvasId), eq(schema.canvases.userId, userId)))
		.returning();

	if (!updated) throw new Error('CANVAS_NOT_FOUND');
	return (await getCanvasWithDetails(canvasId, userId))!;
}

export async function addCanvasScene(
	canvasId: string,
	userId: string,
	scene: {
		name: string;
		description?: string;
		viewport?: ViewportDevice;
		order?: number;
		positionX?: number;
		positionY?: number;
		html?: string;
		css?: string;
		js?: string;
	}
): Promise<{ canvas: CanvasDetail; sceneId: string }> {
	const db = getDb();
	const [canvas] = await db
		.select()
		.from(schema.canvases)
		.where(and(eq(schema.canvases.id, canvasId), eq(schema.canvases.userId, userId)));

	if (!canvas) throw new Error('CANVAS_NOT_FOUND');

	let order = scene.order;
	if (order === undefined) {
		const [maxOrder] = await db
			.select({ max: sql<number>`coalesce(max(${schema.canvasScenes.order}), -1)` })
			.from(schema.canvasScenes)
			.where(eq(schema.canvasScenes.canvasId, canvasId));
		order = (maxOrder?.max ?? -1) + 1;
	}
	const existingScenes = await db
		.select({
			viewport: schema.canvasScenes.viewport,
			positionX: schema.canvasScenes.positionX,
			positionY: schema.canvasScenes.positionY
		})
		.from(schema.canvasScenes)
		.where(eq(schema.canvasScenes.canvasId, canvasId));
	const viewport = (scene.viewport ?? 'desktop') as ViewportDevice;
	const requested =
		scene.positionX !== undefined && scene.positionY !== undefined
			? { viewport, positionX: scene.positionX, positionY: scene.positionY }
			: null;
	// Overlapping frames are unreadable, so a requested position that collides with an existing
	// frame is moved to the first free slot of the layout grid.
	const position =
		requested &&
		!existingScenes.some((existing) => sceneFramesOverlap(toPlacement(existing), requested))
			? { x: requested.positionX, y: requested.positionY }
			: findFreeScenePosition(existingScenes.map(toPlacement), viewport);

	const [createdScene] = await db
		.insert(schema.canvasScenes)
		.values({
			canvasId,
			name: scene.name,
			description: scene.description ?? '',
			viewport,
			order,
			positionX: position.x,
			positionY: position.y,
			html: scene.html ?? '',
			css: scene.css ?? '',
			js: scene.js ?? ''
		})
		.returning();

	await db
		.update(schema.canvases)
		.set({
			activeSceneId: createdScene.id,
			revision: sql`${schema.canvases.revision} + 1`,
			updatedAt: new Date()
		})
		.where(eq(schema.canvases.id, canvasId));

	const detail = (await getCanvasWithDetails(canvasId, userId))!;
	return { canvas: detail, sceneId: createdScene.id };
}

export async function updateCanvasScene(
	canvasId: string,
	sceneId: string,
	userId: string,
	updates: {
		name?: string;
		description?: string;
		viewport?: ViewportDevice;
		order?: number;
		positionX?: number;
		positionY?: number;
		html?: string;
		css?: string;
		js?: string;
	}
): Promise<CanvasDetail> {
	const db = getDb();
	const [canvas] = await db
		.select()
		.from(schema.canvases)
		.where(and(eq(schema.canvases.id, canvasId), eq(schema.canvases.userId, userId)));

	if (!canvas) throw new Error('CANVAS_NOT_FOUND');

	const [updatedScene] = await db
		.update(schema.canvasScenes)
		.set({
			...updates,
			updatedAt: new Date()
		})
		.where(and(eq(schema.canvasScenes.id, sceneId), eq(schema.canvasScenes.canvasId, canvasId)))
		.returning();

	if (!updatedScene) throw new Error('SCENE_NOT_FOUND');

	await db
		.update(schema.canvases)
		.set({
			revision: sql`${schema.canvases.revision} + 1`,
			updatedAt: new Date()
		})
		.where(eq(schema.canvases.id, canvasId));

	return (await getCanvasWithDetails(canvasId, userId))!;
}

export async function deleteCanvasScene(
	canvasId: string,
	sceneId: string,
	userId: string
): Promise<CanvasDetail> {
	const db = getDb();
	const [canvas] = await db
		.select()
		.from(schema.canvases)
		.where(and(eq(schema.canvases.id, canvasId), eq(schema.canvases.userId, userId)));

	if (!canvas) throw new Error('CANVAS_NOT_FOUND');

	const scenes = await db
		.select()
		.from(schema.canvasScenes)
		.where(eq(schema.canvasScenes.canvasId, canvasId))
		.orderBy(asc(schema.canvasScenes.order));

	const sceneToDelete = scenes.find((s) => s.id === sceneId);
	if (!sceneToDelete) {
		throw new Error('SCENE_NOT_FOUND');
	}

	if (scenes.length <= 1) {
		throw new Error('CANNOT_DELETE_LAST_SCENE');
	}

	const deleted = await db
		.delete(schema.canvasScenes)
		.where(and(eq(schema.canvasScenes.id, sceneId), eq(schema.canvasScenes.canvasId, canvasId)))
		.returning({ id: schema.canvasScenes.id });

	if (deleted.length === 0) {
		throw new Error('SCENE_NOT_FOUND');
	}

	// If the active scene was deleted, pick another
	let nextActiveId = canvas.activeSceneId;
	if (canvas.activeSceneId === sceneId) {
		const remaining = scenes.filter((s) => s.id !== sceneId);
		nextActiveId = remaining[0]?.id ?? null;
	}

	await db
		.update(schema.canvases)
		.set({
			activeSceneId: nextActiveId,
			revision: sql`${schema.canvases.revision} + 1`,
			updatedAt: new Date()
		})
		.where(eq(schema.canvases.id, canvasId));

	return (await getCanvasWithDetails(canvasId, userId))!;
}

export async function createCanvasConnection(
	canvasId: string,
	userId: string,
	connection: { sourceSceneId: string; targetSceneId: string }
): Promise<{ canvas: CanvasDetail; connection: CanvasConnection }> {
	const db = getDb();
	const [canvas] = await db
		.select()
		.from(schema.canvases)
		.where(and(eq(schema.canvases.id, canvasId), eq(schema.canvases.userId, userId)))
		.limit(1);

	if (!canvas) throw new Error('CANVAS_NOT_FOUND');
	if (connection.sourceSceneId === connection.targetSceneId) {
		throw new Error('CONNECTION_SELF_REFERENCE');
	}

	const [source, target] = await Promise.all([
		db
			.select({ id: schema.canvasScenes.id })
			.from(schema.canvasScenes)
			.where(
				and(
					eq(schema.canvasScenes.id, connection.sourceSceneId),
					eq(schema.canvasScenes.canvasId, canvasId)
				)
			)
			.limit(1),
		db
			.select({ id: schema.canvasScenes.id })
			.from(schema.canvasScenes)
			.where(
				and(
					eq(schema.canvasScenes.id, connection.targetSceneId),
					eq(schema.canvasScenes.canvasId, canvasId)
				)
			)
			.limit(1)
	]);

	if (!source[0] || !target[0]) throw new Error('SCENE_NOT_FOUND');

	const [existing] = await db
		.select({ id: schema.canvasConnections.id })
		.from(schema.canvasConnections)
		.where(
			and(
				eq(schema.canvasConnections.canvasId, canvasId),
				eq(schema.canvasConnections.sourceSceneId, connection.sourceSceneId),
				eq(schema.canvasConnections.targetSceneId, connection.targetSceneId)
			)
		)
		.limit(1);
	if (existing) throw new Error('CONNECTION_EXISTS');

	let created;
	try {
		[created] = await db
			.insert(schema.canvasConnections)
			.values({
				canvasId,
				sourceSceneId: connection.sourceSceneId,
				targetSceneId: connection.targetSceneId
			})
			.returning();
	} catch (error) {
		// The unique index also protects against two concurrent create requests.
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
			throw new Error('CONNECTION_EXISTS', { cause: error });
		}
		throw error;
	}

	if (!created) throw new Error('CONNECTION_CREATION_FAILED');

	await db
		.update(schema.canvases)
		.set({
			revision: sql`${schema.canvases.revision} + 1`,
			updatedAt: new Date()
		})
		.where(eq(schema.canvases.id, canvasId));

	const detail = (await getCanvasWithDetails(canvasId, userId))!;
	const createdConnection = detail.connections.find((item) => item.id === created.id);
	if (!createdConnection) throw new Error('CONNECTION_CREATION_FAILED');
	return { canvas: detail, connection: createdConnection };
}

export async function deleteCanvasConnection(
	canvasId: string,
	connectionId: string,
	userId: string
): Promise<CanvasDetail> {
	const db = getDb();
	const [canvas] = await db
		.select({ id: schema.canvases.id })
		.from(schema.canvases)
		.where(and(eq(schema.canvases.id, canvasId), eq(schema.canvases.userId, userId)))
		.limit(1);

	if (!canvas) throw new Error('CANVAS_NOT_FOUND');

	const deleted = await db
		.delete(schema.canvasConnections)
		.where(
			and(
				eq(schema.canvasConnections.id, connectionId),
				eq(schema.canvasConnections.canvasId, canvasId)
			)
		)
		.returning({ id: schema.canvasConnections.id });

	if (!deleted.length) throw new Error('CONNECTION_NOT_FOUND');

	await db
		.update(schema.canvases)
		.set({
			revision: sql`${schema.canvases.revision} + 1`,
			updatedAt: new Date()
		})
		.where(eq(schema.canvases.id, canvasId));

	return (await getCanvasWithDetails(canvasId, userId))!;
}
