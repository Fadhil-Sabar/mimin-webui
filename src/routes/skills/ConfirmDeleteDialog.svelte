<script lang="ts">
	import { X } from '@lucide/svelte';
	import { focusModalPrimary, trapModalFocus } from './skills-focus';
	import type { Skill } from './skills-types';

	let {
		skill,
		deleting,
		onclose,
		onconfirm
	}: {
		skill: Skill;
		deleting: boolean;
		onclose: () => void;
		onconfirm: () => void;
	} = $props();

	let dialogElement = $state<HTMLDivElement>();

	$effect(() => {
		const element = dialogElement;
		if (element) void focusModalPrimary(element);
	});
</script>

<div
	class="modal-backdrop"
	role="presentation"
	tabindex="-1"
	onclick={(event) => !deleting && event.target === event.currentTarget && onclose()}
	onkeydown={(event) => {
		if (event.key === 'Escape' && !deleting) onclose();
	}}
>
	<div
		class="modal confirm-modal"
		role="dialog"
		aria-modal="true"
		aria-labelledby="delete-skill-title"
		tabindex="-1"
		bind:this={dialogElement}
		onkeydown={(event) => trapModalFocus(event, dialogElement)}
	>
		<div class="modal-head">
			<div>
				<h2 id="delete-skill-title">Delete skill?</h2>
			</div>
			<button class="icon-button" onclick={onclose} disabled={deleting} aria-label="Close dialog"
				><X size={18} /></button
			>
		</div>
		<p class="modal-text">
			Delete <strong>“{skill.name}”</strong>? Existing conversation turns keep their saved
			instructions, while future activations will no longer find this skill.
		</p>
		<div class="modal-actions">
			<button class="button" onclick={onclose} disabled={deleting} data-modal-primary
				>Keep skill</button
			><button class="button danger" onclick={onconfirm} disabled={deleting}
				>{deleting ? 'Deleting...' : 'Delete skill'}</button
			>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 20px;
		background: var(--overlay);
	}
	.modal {
		width: min(660px, 100%);
		max-height: min(850px, calc(100dvh - 40px));
		overflow: auto;
		padding: 24px;
		color: var(--text);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 12px;
		box-shadow: 0 20px 50px var(--shadow);
	}
	.confirm-modal {
		width: min(470px, 100%);
	}
	.modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.modal h2 {
		margin: 0;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: 1.3;
		letter-spacing: -0.015em;
	}
	.modal-text {
		margin: 18px 0 0;
		color: var(--text-body);
		font-size: var(--text-sm);
		line-height: 1.6;
	}
	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 22px;
	}
	.icon-button {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		padding: 0;
		color: var(--text-muted);
		background: transparent;
		border: 0;
		border-radius: 5px;
		transition: 0.15s ease;
	}
	.button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 38px;
		padding: 8px 13px;
		border-radius: 6px;
		border: 1px solid var(--border-strong);
		background: var(--surface);
		color: var(--text-body);
		font-family: var(--font-body);
		font-size: var(--text-sm);
		font-weight: 500;
		transition: 0.18s ease;
	}
	.button:hover:not(:disabled) {
		color: var(--text-strong);
		background: var(--surface-hover);
		border-color: var(--text-dim);
	}
	.button.danger {
		color: var(--danger-text);
		border-color: color-mix(in srgb, var(--danger-text) 30%, transparent);
		background: transparent;
	}
	.button.danger:hover:not(:disabled) {
		color: var(--danger-text);
		border-color: var(--danger-text);
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
	}
	.button:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	@media (max-width: 560px) {
		.modal {
			padding: 19px;
		}
	}
</style>
