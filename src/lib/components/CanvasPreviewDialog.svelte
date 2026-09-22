<script lang="ts">
	import { Code2, Monitor, Smartphone, Tablet, Trash2, X } from '@lucide/svelte';
	import type { CanvasScene, ViewportDevice } from '$lib/canvas';
	import { VIEWPORT_SPECS } from '$lib/canvas';
	import CanvasPreview from './CanvasPreview.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	type Props = {
		open: boolean;
		scene: CanvasScene;
		sceneCount: number;
		onupdatescene: (sceneId: string, updates: Partial<CanvasScene>) => Promise<void>;
		ondeletescene: (sceneId: string) => Promise<void>;
		oneditcode: () => void;
	};

	let {
		open = $bindable(),
		scene,
		sceneCount,
		onupdatescene,
		ondeletescene,
		oneditcode
	}: Props = $props();

	let viewportSaving = $state(false);

	async function switchViewport(viewport: ViewportDevice) {
		if (viewportSaving || viewport === scene.viewport) return;
		viewportSaving = true;
		try {
			await onupdatescene(scene.id, { viewport });
		} finally {
			viewportSaving = false;
		}
	}

	async function handleDeleteActiveScene() {
		if (sceneCount <= 1) return;
		if (confirm(`Delete scene "${scene.name}"?`)) {
			await ondeletescene(scene.id);
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		aria-label="Interactive preview of {scene.name}"
		class="flex! max-h-[96vh] w-fit! max-w-[min(96vw,1300px)]! min-w-[min(320px,96vw)] flex-col gap-0 overflow-hidden rounded-xl bg-[var(--surface)] p-0 leading-[normal] shadow-[0_24px_70px_var(--shadow)] ring-0"
	>
		<div class="preview-dialog-bar">
			<strong>{scene.name}</strong><span
				>{VIEWPORT_SPECS[scene.viewport].width} × {VIEWPORT_SPECS[scene.viewport].height}</span
			>
			<div class="preview-device-switcher" role="group" aria-label="Ubah ukuran scene">
				<button
					type="button"
					class:active={scene.viewport === 'mobile'}
					aria-label="Mobile"
					aria-pressed={scene.viewport === 'mobile'}
					title="Mobile"
					disabled={viewportSaving}
					onclick={() => switchViewport('mobile')}><Smartphone size={16} /></button
				>
				<button
					type="button"
					class:active={scene.viewport === 'tablet'}
					aria-label="Tablet"
					aria-pressed={scene.viewport === 'tablet'}
					title="Tablet"
					disabled={viewportSaving}
					onclick={() => switchViewport('tablet')}><Tablet size={16} /></button
				>
				<button
					type="button"
					class:active={scene.viewport === 'desktop'}
					aria-label="Desktop"
					aria-pressed={scene.viewport === 'desktop'}
					title="Desktop"
					disabled={viewportSaving}
					onclick={() => switchViewport('desktop')}><Monitor size={16} /></button
				>
			</div>
			<button class="icon-btn" onclick={() => (open = false)} aria-label="Close preview"
				><X size={16} /></button
			>
		</div>
		<div class="preview-scroll">
			<div
				class="interactive-screen"
				style:width="{VIEWPORT_SPECS[scene.viewport].width}px"
				style:height="{VIEWPORT_SPECS[scene.viewport].height}px"
			>
				{#key `${scene.id}:${scene.viewport}`}
					<CanvasPreview html={scene.html} css={scene.css} js={scene.js} title={scene.name} />
				{/key}
			</div>
		</div>
		<div class="preview-dialog-actions">
			<Button variant="outline" onclick={handleDeleteActiveScene} disabled={sceneCount <= 1}
				><Trash2 size={13} /> Delete scene</Button
			><Button
				variant="outline"
				onclick={() => {
					open = false;
					oneditcode();
				}}><Code2 size={13} /> Edit code</Button
			>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.preview-dialog-bar {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.preview-dialog-bar span {
		color: var(--text-muted);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
	}
	.preview-dialog-bar > button {
		margin-left: auto;
	}
	.preview-device-switcher {
		display: flex;
		gap: 2px;
		margin-left: auto;
		padding: 2px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}
	.preview-device-switcher button {
		display: grid;
		place-items: center;
		width: 29px;
		height: 27px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}
	.preview-device-switcher button:hover,
	.preview-device-switcher button.active {
		background: var(--surface);
		color: var(--text-strong);
	}
	.preview-device-switcher button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.preview-scroll {
		overflow: auto;
		background: var(--bg);
		padding: var(--space-4);
	}
	.interactive-screen {
		max-width: none;
		background: white;
		margin: 0 auto;
		box-shadow: 0 4px 20px var(--shadow-softer);
	}
	.preview-dialog-actions {
		display: flex;
		gap: var(--space-2);
		justify-content: flex-end;
		border-top: 1px solid var(--border);
		padding: 10px 14px;
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
	@media (max-width: 560px) {
		.preview-dialog-bar {
			flex-wrap: wrap;
		}
		.preview-device-switcher {
			margin-left: 0;
		}
	}
</style>
