<script lang="ts">
	import { Code2, Monitor, RotateCcw, Smartphone, Tablet, Trash2, X } from '@lucide/svelte';
	import { untrack } from 'svelte';
	import type { CanvasScene, ViewportDevice } from '$lib/canvas';
	import { VIEWPORT_SPECS } from '$lib/canvas';
	import CanvasPreviewViewport from './CanvasPreviewViewport.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	type Props = {
		open: boolean;
		scene: CanvasScene;
		sceneCount: number;
		ondeletescene: (sceneId: string) => Promise<void>;
		oneditcode: () => void;
	};

	let { open = $bindable(), scene, sceneCount, ondeletescene, oneditcode }: Props = $props();
	let previewViewport = $state<ViewportDevice>('desktop');
	let fit = $state(true);
	let deleting = $state(false);
	let deleteError = $state('');

	const previewSession = $derived(open ? `${scene.id}:${scene.viewport}` : '');
	$effect(() => {
		if (!previewSession) return;
		untrack(() => {
			previewViewport = scene.viewport;
			fit = true;
			deleteError = '';
		});
	});

	let previewInstance = $state(0);

	function restartPreview() {
		previewInstance += 1;
	}

	async function handleDeleteActiveScene() {
		if (deleting || sceneCount <= 1) return;
		if (!confirm(`Delete scene "${scene.name}"?`)) return;
		deleting = true;
		deleteError = '';
		try {
			await ondeletescene(scene.id);
			open = false;
		} catch (error) {
			deleteError = error instanceof Error ? error.message : 'Unable to delete scene.';
		} finally {
			deleting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		showCloseButton={false}
		class="preview-dialog flex! h-[min(96dvh,960px)] max-h-[96dvh] w-[min(96vw,1300px)]! max-w-[min(96vw,1300px)]! min-w-0 flex-col gap-0 overflow-hidden rounded-xl bg-[var(--surface)] p-0 leading-[normal] shadow-[0_24px_70px_var(--shadow)] ring-0"
	>
		<Dialog.Title class="sr-only">Interactive preview of {scene.name}</Dialog.Title>
		<Dialog.Description class="sr-only"
			>Preview the scene at different device sizes.</Dialog.Description
		>
		<div class="preview-dialog-bar">
			<strong title={scene.name}>{scene.name}</strong>
			<span class="viewport-size"
				>{VIEWPORT_SPECS[previewViewport].width} × {VIEWPORT_SPECS[previewViewport].height}</span
			>
			<div class="preview-device-switcher" role="group" aria-label="Preview size">
				<button
					type="button"
					class:active={previewViewport === 'mobile'}
					aria-label="Mobile"
					aria-pressed={previewViewport === 'mobile'}
					title="Mobile"
					onclick={() => (previewViewport = 'mobile')}><Smartphone size={16} /></button
				>
				<button
					type="button"
					class:active={previewViewport === 'tablet'}
					aria-label="Tablet"
					aria-pressed={previewViewport === 'tablet'}
					title="Tablet"
					onclick={() => (previewViewport = 'tablet')}><Tablet size={16} /></button
				>
				<button
					type="button"
					class:active={previewViewport === 'desktop'}
					aria-label="Desktop"
					aria-pressed={previewViewport === 'desktop'}
					title="Desktop"
					onclick={() => (previewViewport = 'desktop')}><Monitor size={16} /></button
				>
			</div>
			<div class="preview-scale-switcher" role="group" aria-label="Preview scale">
				<button type="button" class:active={fit} aria-pressed={fit} onclick={() => (fit = true)}
					>Fit</button
				>
				<button type="button" class:active={!fit} aria-pressed={!fit} onclick={() => (fit = false)}
					>100%</button
				>
			</div>
			<button class="icon-btn" onclick={() => (open = false)} aria-label="Close preview"
				><X size={16} /></button
			>
		</div>
		<div class="preview-body">
			{#key `${scene.id}:${previewViewport}:${previewInstance}`}
				<CanvasPreviewViewport
					html={scene.html}
					css={scene.css}
					js={scene.js}
					title={scene.name}
					viewport={previewViewport}
					{fit}
				/>
			{/key}
		</div>
		<div class="preview-dialog-actions">
			{#if deleteError}<p class="delete-error" role="alert">{deleteError}</p>{/if}
			<Button variant="outline" onclick={restartPreview} aria-label="Restart preview"
				><RotateCcw size={13} /> Restart preview</Button
			>
			<Button
				variant="outline"
				onclick={handleDeleteActiveScene}
				disabled={sceneCount <= 1 || deleting}><Trash2 size={13} /> Delete scene</Button
			>
			<Button
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
		min-width: 0;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.preview-dialog-bar > strong {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.viewport-size {
		flex: 0 0 auto;
		color: var(--text-muted);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
	}
	.preview-device-switcher,
	.preview-scale-switcher {
		display: flex;
		flex: 0 0 auto;
		gap: 2px;
		padding: 2px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-2);
	}
	.preview-dialog-bar .preview-device-switcher {
		margin-left: auto;
	}
	.preview-device-switcher button,
	.preview-scale-switcher button {
		display: grid;
		place-items: center;
		min-width: 29px;
		height: 27px;
		padding: 0 6px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--text-label-sm);
		cursor: pointer;
	}
	.preview-device-switcher button:hover,
	.preview-device-switcher button.active,
	.preview-scale-switcher button:hover,
	.preview-scale-switcher button.active {
		background: var(--surface);
		color: var(--text-strong);
	}
	.preview-device-switcher button:focus-visible,
	.preview-scale-switcher button:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.preview-body {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 120px;
		overflow: hidden;
		padding: var(--space-4);
		background: var(--bg);
	}
	.preview-dialog-actions {
		display: flex;
		flex: 0 0 auto;
		flex-wrap: wrap;
		gap: var(--space-2);
		justify-content: flex-end;
		border-top: 1px solid var(--border);
		padding: 10px 14px;
	}
	.delete-error {
		margin: 0 auto 0 0;
		align-self: center;
		color: var(--danger-text);
		font-size: var(--text-label-sm);
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
	}
	.icon-btn:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.icon-btn:hover {
		background: var(--surface-hover);
		color: var(--text-strong);
		border-color: var(--border-strong);
	}
	@media (max-width: 680px) {
		.preview-dialog-bar {
			flex-wrap: wrap;
			gap: var(--space-2);
		}
		.preview-dialog-bar > strong {
			flex: 1 1 100%;
		}
		.preview-dialog-bar .preview-device-switcher {
			margin-left: 0;
		}
		.preview-body {
			padding: var(--space-2);
		}
		.preview-dialog-actions > :global(button) {
			flex: 1 1 auto;
		}
	}
</style>
