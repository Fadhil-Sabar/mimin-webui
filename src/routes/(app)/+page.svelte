<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Loader2, Send } from '@lucide/svelte';
	import ModelPicker, { type ModelOption } from '$lib/components/ModelPicker.svelte';
	import {
		loadModelsCached,
		MODELS_CHANGED_EVENT,
		modelsErrorMessage
	} from '$lib/client/models-cache';
	import {
		conversationsState,
		getLastUsedModel,
		resolveInitialModel,
		setLastUsedModel,
		type ConversationSummary
	} from '$lib/client/conversations.svelte';
	import {
		consumeNavigationHandoff,
		createNavigationHandoff,
		peekNavigationHandoff
	} from '$lib/client/navigation-handoff';
	import { clearHomeDraft, getHomeDraft, setHomeDraft } from '$lib/client/drafts';
	import { settingsModal } from '$lib/client/settings-modal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import Topbar from '$lib/components/Topbar.svelte';
	let prompt = $state('');
	let conversations = $state<ConversationSummary[]>([]);
	let models = $state<ModelOption[]>([]);
	let modelsLoading = $state(true);
	let modelLoadError = $state('');
	let selectedModel = $state('');
	let homeDraftLoaded = $state(false);

	$effect(() => {
		const value = prompt;
		if (!homeDraftLoaded) return;
		setHomeDraft(value);
	});
	let submitting = $state(false);
	function usePrompt(value: string) {
		prompt = value;
	}

	function modelRef(model: ModelOption) {
		return `${model.provider}/${model.id}`;
	}

	let configuredModels = $derived(
		models.filter((model) => model.configured || model.userConfigured)
	);

	async function loadModels(options: { force?: boolean } = {}) {
		modelsLoading = true;
		try {
			const data = await loadModelsCached<ModelOption>(options);
			models = data.models;
			modelLoadError = modelsErrorMessage(data);
			if (modelLoadError) toast('Some live models could not be loaded. Check Providers.');
			selectedModel = resolveInitialModel(configuredModels) ?? '';
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not load models');
		} finally {
			modelsLoading = false;
		}
	}

	async function submitPrompt() {
		if (submitting) return;
		const content = prompt.trim();
		if (!content) {
			toast('Write a prompt first');
			return;
		}
		if (!selectedModel) {
			toast(
				modelLoadError
					? 'Live models are unavailable. Check Providers.'
					: 'Configure a provider before starting a chat'
			);
			return;
		}
		submitting = true;
		setLastUsedModel(selectedModel);
		try {
			const response = await fetch('/api/conversations', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ model: selectedModel })
			});
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not start a conversation');
			const conversation = (await response.json()).conversation;
			if (conversation.model) {
				setLastUsedModel(conversation.model);
			}
			clearHomeDraft();
			createNavigationHandoff({ prompt: content, returnTo: `/chat?id=${conversation.id}` });
			window.location.href = `/chat?id=${encodeURIComponent(conversation.id)}`;
		} catch (error) {
			toast(error instanceof Error ? error.message : 'Could not start a conversation');
		} finally {
			submitting = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submitPrompt();
		}
	}

	onMount(async () => {
		const handoff = peekNavigationHandoff();
		if (handoff?.returnTo === '/') {
			prompt = handoff.prompt;
			consumeNavigationHandoff();
		} else {
			prompt = getHomeDraft();
		}
		homeDraftLoaded = true;
		await loadModels();
		try {
			const response = await fetch('/api/conversations');
			if (response.ok) {
				const data = await response.json();
				conversations = data.conversations ?? [];
				conversationsState.setItems(conversations);
				if (!getLastUsedModel() && conversations[0]?.model) {
					setLastUsedModel(conversations[0].model);
					if (configuredModels.some((m) => modelRef(m) === conversations[0].model)) {
						selectedModel = conversations[0].model;
					}
				}
			}
		} catch {
			/* ignore */
		}
	});

	$effect(() => {
		if (typeof window === 'undefined') return;
		const refreshModels = () => void loadModels({ force: true });
		window.addEventListener(MODELS_CHANGED_EVENT, refreshModels);
		return () => window.removeEventListener(MODELS_CHANGED_EVENT, refreshModels);
	});

	function openProviderSetup(event: MouseEvent) {
		event.preventDefault();
		settingsModal.show('models');
	}
</script>

<svelte:head><title>Mimin WebUI | Home</title></svelte:head>
<Topbar />
<div class="home-wrap">
	<span class="workbench-label">Your workbench</span>
	<h1>Start with the work<br />in front of you.</h1>
	<p class="intro">
		Mimin keeps your conversation, model, and project context together while you think through the
		next step.
	</p>
	{#if !modelsLoading && !selectedModel}
		<a class="setup-callout" href={resolve('/settings')} onclick={openProviderSetup}
			>Connect a model before starting a chat <span>→</span></a
		>
	{/if}
	<div class="home-composer">
		<textarea
			bind:value={prompt}
			aria-label="Prompt"
			placeholder="Ask anything..."
			disabled={submitting}
			aria-busy={submitting}
			onkeydown={onKeydown}></textarea>
		<div class="composer-row">
			<ModelPicker
				models={configuredModels}
				value={selectedModel}
				loading={modelsLoading}
				disabled={submitting || configuredModels.length === 0}
				placeholder={modelLoadError ? 'Models unavailable' : 'Configure a provider'}
				onselect={(model) => {
					selectedModel = model;
					setLastUsedModel(model);
				}}
			/>
			<Button
				variant="default"
				size="icon-lg"
				class="ml-auto rounded-lg"
				disabled={submitting}
				aria-label={submitting ? 'Starting chat' : 'Send prompt'}
				title={submitting ? 'Starting chat' : 'Send prompt'}
				onclick={submitPrompt}
				>{#if submitting}<Loader2 size={16} class="animate-spin" aria-hidden="true" />{:else}<Send
						size={16}
						aria-hidden="true"
					/>{/if}</Button
			>
		</div>
	</div>
	<div class="example-row">
		<button onclick={() => usePrompt('Summarize project notes')}>Summarize project notes</button
		><button onclick={() => usePrompt('Design a clean API')}>Design a clean API</button><button
			onclick={() => usePrompt('Explore ideas')}>Explore ideas</button
		>
	</div>
</div>

<style>
	.home-wrap {
		max-width: 800px;
		margin: auto;
		padding: clamp(64px, 15vh, 150px) var(--space-6) 80px;
	}
	.home-wrap h1 {
		font-family: var(--font-body);
		font-size: var(--text-display-sm);
		line-height: var(--text-display-sm--line-height);
		letter-spacing: var(--text-display-sm--letter-spacing);
		color: var(--text-strong);
		margin: 0 0 14px;
	}
	.workbench-label {
		display: inline-flex;
		margin-bottom: var(--space-3);
		color: var(--text-muted);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		text-transform: uppercase;
	}
	.intro {
		max-width: 500px;
		color: var(--text-muted);
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		margin: 0 0 var(--space-6);
	}
	.setup-callout {
		display: flex;
		align-items: center;
		justify-content: space-between;
		max-width: 640px;
		margin: 0 0 var(--space-4);
		padding: 10px 14px;
		color: var(--text-body);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		text-decoration: none;
		transition:
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.setup-callout:hover {
		background: var(--surface-hover);
		border-color: var(--border-strong);
	}
	.home-composer {
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		padding: var(--space-4);
		box-shadow: 0 10px 30px var(--shadow-soft);
	}
	.home-composer textarea {
		display: block;
		width: 100%;
		min-height: 78px;
		border: 0;
		resize: none;
		font-family: inherit;
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		background: transparent;
	}
	.composer-row {
		display: flex;
		align-items: center;
		gap: 7px;
		border-top: 1px solid var(--border);
		padding-top: var(--space-3);
	}
	.example-row {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-top: 18px;
	}
	.example-row button {
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-muted);
		border-radius: 999px;
		padding: 7px 11px;
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
	}
	.example-row button:hover {
		color: var(--text-body);
		background: var(--surface-hover);
	}
	@media (max-width: 760px) {
		.home-wrap {
			padding: clamp(var(--space-7), 10vh, 84px) 18px 60px;
		}
		.home-wrap h1 {
			font-size: var(--text-headline-md);
			line-height: var(--text-headline-md--line-height);
			letter-spacing: var(--text-headline-md--letter-spacing);
		}
		.composer-row {
			flex-wrap: wrap;
		}
	}
</style>
