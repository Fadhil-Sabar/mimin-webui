<script lang="ts">
	import { Check, Eye, EyeOff, Loader2, X } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import type { ConnectionField, SearchProviderType, WebSearchSettingsState } from './types';

	type Props = {
		field: ConnectionField;
		settings: WebSearchSettingsState;
		provider: SearchProviderType;
		apiKeyDraft: string;
		searchUrlDraft: string;
		showApiKey: boolean;
		saving: boolean;
		onclose: () => void;
		onsave: () => void;
		onremove: (field: ConnectionField) => void;
	};

	let {
		field,
		settings,
		provider,
		apiKeyDraft = $bindable(),
		searchUrlDraft = $bindable(),
		showApiKey = $bindable(),
		saving,
		onclose,
		onsave,
		onremove
	}: Props = $props();
</script>

<Dialog.Root
	open={true}
	onOpenChange={(open) => {
		if (!open) onclose();
	}}
>
	<Dialog.Content
		showCloseButton={false}
		aria-labelledby="search-connection-dialog-title"
		class="w-[min(420px,100%)] max-w-none! gap-0 rounded-xl border border-[var(--border-strong)] p-6 shadow-[0_20px_50px_var(--shadow)] ring-0"
	>
		<!-- `.modal` is kept on the form so the global `.modal h2/label/input/...`
		     rules still style the heading, label and URL input. Its own box is
		     neutralised so Dialog.Content is the only visible shell. -->
		<form
			class="modal search-connection-modal w-full! max-w-none! border-0! bg-transparent! p-0! shadow-none!"
			onsubmit={(event) => {
				event.preventDefault();
				onsave();
			}}
		>
			<div class="modal-head">
				<div>
					<h2 id="search-connection-dialog-title">
						{field === 'apiKey'
							? settings.apiKeyFromUser
								? 'Manage search API key'
								: 'Connect search API key'
							: settings.searchUrlFromUser
								? 'Manage search endpoint'
								: 'Connect search endpoint'}
					</h2>
					<p class="modal-description">
						{field === 'apiKey'
							? 'Add a key for the selected search provider. It is encrypted before storage.'
							: 'Add a custom endpoint without changing your selected search provider.'}
					</p>
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

			{#if field === 'apiKey'}
				<label for="search-api-key-modal">Search API key</label>
				<div class="input-with-button">
					<input
						id="search-api-key-modal"
						type={showApiKey ? 'text' : 'password'}
						bind:value={apiKeyDraft}
						placeholder={settings.apiKeyFromUser
							? `Configured (${settings.apiKey}) - enter new key to replace`
							: settings.apiKeyEnvConfigured
								? 'Server default configured - enter a key to override'
								: 'tvly-...'}
						autocomplete="off"
						spellcheck="false"
					/>
					<button
						type="button"
						class="toggle-eye-btn"
						onclick={() => (showApiKey = !showApiKey)}
						title={showApiKey ? 'Hide key' : 'Show key'}
						aria-label={showApiKey ? 'Hide key' : 'Show key'}
					>
						{#if showApiKey}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
					</button>
				</div>
				<p class="field-help">
					Stored securely with AES-256-GCM encryption. Blank values keep the existing key.
				</p>
			{:else}
				<label for="search-url-modal">Custom search endpoint / URL</label>
				<input
					id="search-url-modal"
					type="url"
					bind:value={searchUrlDraft}
					placeholder={provider === 'searxng'
						? 'https://searxng.example.com/search'
						: 'https://api.tavily.com/search or custom proxy URL'}
					autocomplete="off"
				/>
				<p class="field-help">
					Supports custom Tavily proxies, SearXNG endpoints, or GET URLs with
					<code class="mono">&#123;query&#125;</code>.
				</p>
			{/if}

			<div class="modal-actions">
				{#if (field === 'apiKey' && settings.apiKeyFromUser) || (field === 'searchUrl' && settings.searchUrlFromUser)}
					<Button
						type="button"
						variant="destructive"
						class="remove-connection"
						onclick={() => onremove(field)}
						disabled={saving}>Remove</Button
					>
				{/if}
				<Button type="button" variant="outline" onclick={onclose}>Cancel</Button>
				<Button type="submit" variant="default" disabled={saving}>
					{#if saving}<Loader2 size={15} class="spin" /> Saving...{:else}<Check size={15} /> Save connection{/if}
				</Button>
			</div>
		</form>
	</Dialog.Content>
</Dialog.Root>

<style>
	.field-help {
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text-dim);
		margin: 6px 0 0;
	}
	.field-help code.mono {
		font-family: var(--font-mono);
		font-size: var(--text-label-sm);
		line-height: var(--text-label-sm--line-height);
		letter-spacing: var(--text-label-sm--letter-spacing);
		color: var(--text-body);
		background: var(--surface-2);
		padding: 1px 4px;
		border-radius: 4px;
	}
	.modal-description {
		margin: -10px 0 0;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	:global(.remove-connection) {
		margin-right: auto;
	}

	.input-with-button {
		position: relative;
		display: flex;
		align-items: center;
	}
	.input-with-button input {
		width: 100%;
		padding-right: 40px;
	}
	.toggle-eye-btn {
		position: absolute;
		right: 10px;
		background: transparent;
		border: 0;
		color: var(--text-muted);
		display: grid;
		place-items: center;
		padding: 4px;
		border-radius: 4px;
	}
	.toggle-eye-btn:hover {
		color: var(--text-strong);
	}

	input[type='text'],
	input[type='password'],
	input[type='url'] {
		width: 100%;
		min-height: 40px;
		padding: 8px 12px;
		background: var(--surface);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		color: var(--text-strong);
		font-family: var(--font-body);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		outline: none;
		transition: border-color var(--duration-short3) var(--ease-standard);
	}
	input[type='text']:focus,
	input[type='password']:focus,
	input[type='url']:focus {
		border-color: var(--focus);
	}
</style>
