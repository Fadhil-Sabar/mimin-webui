<script lang="ts">
	import { Plus } from '@lucide/svelte';
	import { useSvelteFlow } from '@xyflow/svelte';
	import type { CanvasScene, ViewportDevice } from '$lib/canvas';
	import { findFreeScenePosition, type ScenePlacement } from '$lib/canvas';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	type Props = {
		open: boolean;
		scenes: CanvasScene[];
		activeSceneCss: string;
		oncreatescene: (scene: {
			name: string;
			viewport: ViewportDevice;
			positionX?: number;
			positionY?: number;
			html?: string;
			css?: string;
		}) => Promise<void>;
	};

	let { open = $bindable(), scenes, activeSceneCss, oncreatescene }: Props = $props();

	const flow = useSvelteFlow();
	let newSceneName = $state('');
	let newSceneViewport = $state<ViewportDevice>('desktop');
	let creating = $state(false);

	/** Current frame boxes; measured node heights keep the layout accurate for tall content. */
	function currentPlacements(): ScenePlacement[] {
		const measured = new Map(flow.getNodes().map((node) => [node.id, node.measured?.height]));
		return scenes.map((scene) => ({
			viewport: scene.viewport,
			positionX: scene.positionX,
			positionY: scene.positionY,
			frameHeight: measured.get(scene.id)
		}));
	}

	async function submitNewScene() {
		if (!newSceneName.trim() || creating) return;
		creating = true;
		try {
			const position = findFreeScenePosition(currentPlacements(), newSceneViewport);
			await oncreatescene({
				name: newSceneName.trim(),
				viewport: newSceneViewport,
				positionX: position.x,
				positionY: position.y,
				html: `<div class="container">\n  <h2>${newSceneName.trim()}</h2>\n  <p>New scene content...</p>\n</div>`,
				css: activeSceneCss
			});
			open = false;
			newSceneName = '';
		} finally {
			creating = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="w-[min(440px,90%)] max-w-none! gap-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-0 leading-[normal] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.2)] ring-0"
	>
		<div class="modal-header">
			<Dialog.Title level={3} class="text-headline-sm text-[var(--text-strong)]"
				>Create Scene Mockup</Dialog.Title
			>
			<button class="icon-btn" onclick={() => (open = false)} aria-label="Close dialog"
				><Plus style="transform: rotate(45deg)" size={14} /></button
			>
		</div>
		<div class="modal-body">
			<div class="form-group">
				<label for="scene-name" class="label">Scene Name</label>
				<input
					id="scene-name"
					type="text"
					class="text-input"
					bind:value={newSceneName}
					placeholder="e.g. Mobile Signup, Desktop Dashboard..."
				/>
			</div>
			<div class="form-group">
				<span class="label">Initial Viewport</span>
				<div class="viewport-radios">
					<label class="radio-label">
						<input type="radio" bind:group={newSceneViewport} value="mobile" />
						<span>Mobile (375px)</span>
					</label>
					<label class="radio-label">
						<input type="radio" bind:group={newSceneViewport} value="tablet" />
						<span>Tablet (768px)</span>
					</label>
					<label class="radio-label">
						<input type="radio" bind:group={newSceneViewport} value="desktop" />
						<span>Desktop (1200px)</span>
					</label>
				</div>
			</div>
		</div>
		<div class="modal-footer">
			<Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
			<Button
				variant="default"
				onclick={submitNewScene}
				disabled={creating || !newSceneName.trim()}
			>
				{creating ? 'Creating...' : 'Create Scene'}
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 18px;
		border-bottom: 1px solid var(--border);
	}
	.modal-body {
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.label {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
	}
	.text-input {
		border: 1px solid var(--input-border);
		border-radius: var(--radius-md);
		padding: var(--space-2) 10px;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		background: var(--surface);
		color: var(--text);
	}
	.text-input:focus {
		border-color: var(--border-strong);
		outline: 2px solid var(--focus);
		outline-offset: 1px;
	}
	.viewport-radios {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.radio-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		color: var(--text-body);
		cursor: pointer;
	}
	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) 18px;
		border-top: 1px solid var(--border);
		background: var(--surface-subtle);
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 0;
		cursor: pointer;
		color: var(--text-muted);
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.icon-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}
</style>
