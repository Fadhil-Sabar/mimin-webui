<script lang="ts">
	import { Check, Eye, EyeOff, Loader2, X } from '@lucide/svelte';
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

<div
	class="modal-backdrop"
	role="dialog"
	aria-modal="true"
	aria-labelledby="search-connection-dialog-title"
	tabindex="-1"
	onclick={(event) => event.target === event.currentTarget && onclose()}
	onkeydown={(event) => event.key === 'Escape' && onclose()}
>
	<form
		class="modal search-connection-modal"
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
			<button
				type="button"
				class="icon-button"
				aria-label="Close"
				title="Close dialog"
				onclick={onclose}><X size={18} /></button
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
				<button
					type="button"
					class="button danger remove-connection"
					onclick={() => onremove(field)}
					disabled={saving}>Remove</button
				>
			{/if}
			<button type="button" class="button" onclick={onclose}>Cancel</button>
			<button type="submit" class="button primary" disabled={saving}>
				{#if saving}<Loader2 size={15} class="spin" /> Saving...{:else}<Check size={15} /> Save connection{/if}
			</button>
		</div>
	</form>
</div>

<style>
	.field-help {
		font-size: var(--text-xs);
		color: var(--text-dim);
		margin: 6px 0 0;
		line-height: 1.4;
	}
	.modal-description {
		margin: -10px 0 0;
		color: var(--text-muted);
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	.remove-connection {
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
	input[type='password'] {
		width: 100%;
		min-height: 40px;
		padding: 8px 12px;
		background: var(--surface);
		border: 1px solid var(--input-border);
		border-radius: 6px;
		color: var(--text-strong);
		font-size: var(--text-sm);
		outline: none;
		transition: border-color 0.15s ease;
	}
	input[type='text']:focus,
	input[type='password']:focus {
		border-color: var(--focus);
	}
</style>
