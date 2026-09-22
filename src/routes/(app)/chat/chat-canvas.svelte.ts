import {
	fetchCanvas,
	createCanvasApi,
	updateCanvasApi,
	addCanvasSceneApi,
	updateCanvasSceneApi,
	deleteCanvasSceneApi,
	createCanvasConnectionApi,
	deleteCanvasConnectionApi
} from '$lib/client/api';
import type { CanvasDetail, CanvasScene, StyleGuideline, ViewportDevice } from '$lib/canvas';
import type { Conversation } from './chat-types';

/**
 * Canvas workspace state for the chat page: split-view layout, mobile tabs,
 * scene/connection CRUD against the canvas API, and refresh-on-agent-event.
 * One instance per page, created next to the chat stream and settings.
 */
export function createChatCanvas({
	getActiveId,
	getActiveConversation,
	notify
}: {
	getActiveId: () => string;
	getActiveConversation: () => Conversation | null;
	notify: (value: string) => void;
}) {
	let activeCanvas = $state<CanvasDetail | null>(null);
	let canvasLoading = $state(false);
	let canvasOpen = $state(false);
	let mobileTab = $state<'chat' | 'canvas'>('chat');
	let splitRatio = $state(50); // percentage for chat in split view
	let isDraggingSplit = $state(false);
	let splitEl: HTMLDivElement | undefined;

	function handleSplitPointerDown(event: PointerEvent) {
		if (!splitEl || !(event.currentTarget instanceof HTMLElement)) return;
		isDraggingSplit = true;
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handleSplitPointerMove(event: PointerEvent) {
		if (!isDraggingSplit || !splitEl) return;
		const bounds = splitEl.getBoundingClientRect();
		const availableWidth = bounds.width - 6;
		if (availableWidth <= 0) return;
		const localX = event.clientX - bounds.left - 3;
		splitRatio = Math.round(Math.max(20, Math.min(80, (localX / availableWidth) * 100)));
	}

	function handleSplitPointerUp(event: PointerEvent) {
		isDraggingSplit = false;
		if (
			event.currentTarget instanceof HTMLElement &&
			event.currentTarget.hasPointerCapture(event.pointerId)
		) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}

	// Tabs.Root speaks `string`; narrow it back to the union the panes are keyed on.
	function selectMobileTab(value: string) {
		if (value === 'chat' || value === 'canvas') mobileTab = value;
	}

	async function loadCanvasForConversation(canvasId?: string | null) {
		const targetId = canvasId ?? getActiveConversation()?.canvasId;
		if (!targetId) {
			activeCanvas = null;
			return;
		}
		canvasLoading = true;
		try {
			activeCanvas = await fetchCanvas(targetId);
		} catch (error) {
			console.error('Failed to load canvas:', error);
			activeCanvas = null;
		} finally {
			canvasLoading = false;
		}
	}

	async function handleToggleCanvas() {
		if (activeCanvas) {
			canvasOpen = !canvasOpen;
			if (canvasOpen && mobileTab === 'chat') mobileTab = 'canvas';
			return;
		}
		// If no canvas exists for this conversation yet, create one
		const activeId = getActiveId();
		if (!activeId) return;
		canvasLoading = true;
		try {
			const activeConversation = getActiveConversation();
			const created = await createCanvasApi({
				title: `${activeConversation?.title ?? 'Chat'} Mockup`,
				conversationId: activeId,
				projectId: activeConversation?.projectId ?? null
			});
			activeCanvas = created;
			canvasOpen = true;
			mobileTab = 'canvas';
			if (activeConversation) {
				activeConversation.canvasId = created.id;
			}
			notify('Canvas workspace created!');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not create canvas');
		} finally {
			canvasLoading = false;
		}
	}

	async function handleUpdateScene(
		sceneId: string,
		updates: Partial<CanvasScene>,
		options: { throwOnError?: boolean } = {}
	) {
		if (!activeCanvas) return;
		try {
			activeCanvas = await updateCanvasSceneApi(activeCanvas.id, sceneId, updates);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not update scene');
			if (options.throwOnError) throw error;
		}
	}

	async function handleCreateScene(scene: {
		name: string;
		viewport: ViewportDevice;
		positionX?: number;
		positionY?: number;
		html?: string;
		css?: string;
	}) {
		if (!activeCanvas) return;
		try {
			const res = await addCanvasSceneApi(activeCanvas.id, scene);
			activeCanvas = res.canvas;
			notify(`Scene "${scene.name}" created!`);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not create scene');
		}
	}

	async function handleDeleteScene(sceneId: string) {
		if (!activeCanvas) return;
		try {
			activeCanvas = await deleteCanvasSceneApi(activeCanvas.id, sceneId);
			notify('Scene deleted');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete scene');
		}
	}

	async function handleCreateConnection(sourceSceneId: string, targetSceneId: string) {
		if (!activeCanvas) return;
		try {
			activeCanvas = (
				await createCanvasConnectionApi(activeCanvas.id, { sourceSceneId, targetSceneId })
			).canvas;
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not create connection');
		}
	}

	async function handleDeleteConnection(connectionId: string) {
		if (!activeCanvas) return;
		try {
			activeCanvas = await deleteCanvasConnectionApi(activeCanvas.id, connectionId);
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not delete connection');
		}
	}

	async function handleUpdateGuideline(guideline: StyleGuideline) {
		if (!activeCanvas) return;
		try {
			activeCanvas = await updateCanvasApi(activeCanvas.id, { styleGuideline: guideline });
			notify('Style guideline updated');
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not update style guideline');
		}
	}

	function handleCanvasSseEvent(event: { type: string; [key: string]: unknown }) {
		if (!activeCanvas || !event.canvasId || event.canvasId !== activeCanvas.id) return;
		// Refresh canvas from server on any agent update
		void loadCanvasForConversation(activeCanvas.id);
	}

	return {
		get activeCanvas() {
			return activeCanvas;
		},
		get canvasLoading() {
			return canvasLoading;
		},
		get canvasOpen() {
			return canvasOpen;
		},
		get mobileTab() {
			return mobileTab;
		},
		get splitRatio() {
			return splitRatio;
		},
		set splitRatio(value: number) {
			splitRatio = value;
		},
		get splitEl() {
			return splitEl;
		},
		set splitEl(value: HTMLDivElement | undefined) {
			splitEl = value;
		},
		loadCanvasForConversation,
		handleToggleCanvas,
		handleUpdateScene,
		handleCreateScene,
		handleDeleteScene,
		handleCreateConnection,
		handleDeleteConnection,
		handleUpdateGuideline,
		handleCanvasSseEvent,
		handleSplitPointerDown,
		handleSplitPointerMove,
		handleSplitPointerUp,
		selectMobileTab
	};
}
