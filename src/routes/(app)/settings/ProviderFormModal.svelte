<script lang="ts">
	import { X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import ModelSelector from './ModelSelector.svelte';
	import { PROTOCOLS, type ModelItem, type Protocol, type ProviderState } from './provider-types';

	type Props = {
		creating: boolean;
		provider: ProviderState | null;
		saving: boolean;
		name: string;
		protocol: Protocol;
		baseUrl: string;
		apiKey: string;
		models: ModelItem[];
		filter: string;
		manualModelId: string;
		textEditMode: boolean;
		draftModels: string;
		discovering: boolean;
		onclose: () => void;
		onsave: () => void;
		ondiscover: () => void;
		onnotify: (message: string) => void;
	};

	let {
		creating,
		provider,
		saving,
		name = $bindable(),
		protocol = $bindable(),
		baseUrl = $bindable(),
		apiKey = $bindable(),
		models = $bindable(),
		filter = $bindable(),
		manualModelId = $bindable(),
		textEditMode = $bindable(),
		draftModels = $bindable(),
		discovering,
		onclose,
		onsave,
		ondiscover,
		onnotify
	}: Props = $props();

	let isCustom = $derived(creating || Boolean(provider?.customConfig));
	let title = $derived(creating ? 'Add custom provider' : (provider?.name ?? 'Provider'));
</script>

<Dialog.Root
	open={true}
	onOpenChange={(open) => {
		if (!open) onclose();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		aria-labelledby="provider-dialog-title"
		class="max-h-[90vh] w-[min(540px,100%)] max-w-none! gap-0 overflow-y-auto rounded-xl border border-[var(--border-strong)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0"
	>
		<!-- `.modal` is kept on the form so the global `.modal label/input/textarea/...`
		     rules still reach the fields and the nested ModelSelector. Its own box is
		     neutralised so Dialog.Content is the only visible shell. -->
		<form
			class="modal w-full! max-w-none! border-0! bg-transparent! p-0! shadow-none!"
			onsubmit={(event) => {
				event.preventDefault();
				onsave();
			}}
		>
			<div class="modal-head">
				<div>
					<h2 id="provider-dialog-title">{title}</h2>
				</div>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Close"
					title="Close dialog"
					onclick={onclose}><X size={18} /></Button
				>
			</div>
			{#if isCustom}
				<label
					>Provider name
					<input bind:value={name} placeholder="My local models" autocomplete="off" />
				</label>
				<label
					>API template
					<select bind:value={protocol}>
						{#each PROTOCOLS as preset (preset.id)}
							<option value={preset.id}>{preset.name} — {preset.description}</option>
						{/each}
					</select>
				</label>
			{/if}
			<label
				>Base URL {#if !isCustom}<span class="optional">optional</span>{/if}
				<input
					type="text"
					bind:value={baseUrl}
					placeholder="https://api.example.com/v1"
					autocomplete="off"
				/>
			</label>
			<label
				>API key {#if isCustom}<span class="optional">optional for keyless servers</span>{/if}
				<input type="password" bind:value={apiKey} placeholder="sk-..." autocomplete="off" />
			</label>
			{#if isCustom}
				<ModelSelector
					bind:models
					bind:filter
					bind:manualModelId
					bind:textEditMode
					bind:draftModels
					{discovering}
					{ondiscover}
					{onnotify}
				/>
			{/if}
			<div class="modal-actions">
				<Button type="button" variant="outline" onclick={onclose}>Cancel</Button>
				<Button type="submit" variant="default" disabled={saving}
					>{saving ? 'Saving...' : 'Save connection'}</Button
				>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<style>
	.modal select {
		display: block;
		width: 100%;
		min-height: 42px;
		margin-top: 6px;
		padding: 8px 11px;
		border: 1px solid var(--input-border);
		border-radius: 6px;
		outline: none;
		background: var(--surface);
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.modal select:focus {
		border-color: var(--focus);
	}
	.modal .optional {
		color: var(--text-faint);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 400;
		margin-left: 4px;
	}
</style>
