<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { ArrowUpRight, Folder, Loader2, Plus } from '@lucide/svelte';
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
	import { consumeNavigationHandoff, peekNavigationHandoff } from '$lib/client/navigation-handoff';
	import { startMessageTurn } from '$lib/client/api';
	import { clearHomeDraft, getHomeDraft, setHomeDraft } from '$lib/client/drafts';
	import { settingsModal } from '$lib/client/settings-modal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { expand, reveal } from '$lib/client/motion';
	import Topbar from '$lib/components/Topbar.svelte';
	let { data } = $props();
	let prompt = $state('');
	let conversations = $state<ConversationSummary[]>([]);
	let models = $state<ModelOption[]>([]);
	let modelsLoading = $state(true);
	let modelLoadError = $state('');
	let selectedModel = $state('');
	let homeDraftLoaded = $state(false);
	let projects = $state<Array<{ id: string; name: string }>>([]);
	let skills = $state<Array<{ id: string; name: string; projectId: string | null }>>([]);
	let selectedProjectId = $state('');
	let selectedSkillId = $state('');
	let attachments = $state<File[]>([]);
	let eligibleSkills = $derived(
		skills.filter((skill) => !skill.projectId || skill.projectId === selectedProjectId)
	);

	$effect(() => {
		const value = prompt;
		if (!homeDraftLoaded) return;
		setHomeDraft(value, data.user?.id);
	});
	let submitting = $state(false);
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
		if (!content && attachments.length === 0) {
			toast('Write a prompt or attach a file first');
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
				body: JSON.stringify({
					model: selectedModel,
					...(selectedProjectId ? { projectId: selectedProjectId } : {}),
					...(selectedSkillId ? { skillId: selectedSkillId } : {})
				})
			});
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not start a conversation');
			const conversation = (await response.json()).conversation;
			if (conversation.model) {
				setLastUsedModel(conversation.model);
			}
			await startMessageTurn(conversation.id, content, selectedModel, attachments);
			clearHomeDraft(data.user?.id);
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
			prompt = getHomeDraft(data.user?.id);
		}
		homeDraftLoaded = true;
		await loadModels();
		void Promise.all([
			fetch('/api/projects').then((response) => (response.ok ? response.json() : null)),
			fetch('/api/skills').then((response) => (response.ok ? response.json() : null))
		])
			.then(([projectData, skillData]) => {
				projects = projectData?.projects ?? [];
				skills = skillData?.skills ?? [];
			})
			.catch(() => {});
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
	<div class="home-mark" aria-hidden="true">m</div>
	<h1>Where shall we start?</h1>
	{#if !modelsLoading && !selectedModel}
		<a class="setup-callout" href={resolve('/settings')} onclick={openProviderSetup}
			>Connect a model to start chatting <span>→</span></a
		>
	{/if}
	<div class="home-composer">
		<textarea
			bind:value={prompt}
			aria-label="Prompt"
			placeholder="Ask anything, or start an idea..."
			disabled={submitting}
			aria-busy={submitting}
			onkeydown={onKeydown}></textarea>
		{#if attachments.length}
			<div class="attachment-list" aria-label="Selected attachments" transition:expand>
				{#each attachments as file, index (file)}
					<span in:reveal={{ y: 4, duration: 180 }}
						>{file.name}
						<button
							type="button"
							aria-label={`Remove ${file.name}`}
							onclick={() => (attachments = attachments.filter((_, i) => i !== index))}>×</button
						></span
					>
				{/each}
			</div>
		{/if}
		<div class="composer-row">
			<label class="attach-input" title="Attach files" aria-label="Attach files">
				<Plus size={24} />
				<input
					type="file"
					multiple
					disabled={submitting}
					onchange={(event) =>
						(attachments = Array.from(event.currentTarget.files ?? []).slice(0, 5))}
				/>
			</label>
			<div class="composer-divider"></div>
			<div class="context-controls">
				<Folder size={19} /><span>Context</span>
				<label class="composer-select"
					><span class="sr-only">Project</span>
					<select
						aria-label="Project"
						bind:value={selectedProjectId}
						disabled={submitting}
						onchange={() => (selectedSkillId = '')}
					>
						<option value="">No project</option>
						{#each projects as project (project.id)}<option value={project.id}
								>{project.name}</option
							>{/each}
					</select>
				</label>
				<label class="composer-select"
					><span class="sr-only">Skill</span>
					<select aria-label="Skill" bind:value={selectedSkillId} disabled={submitting}>
						<option value="">No skill</option>
						{#each eligibleSkills as skill (skill.id)}<option value={skill.id}>{skill.name}</option
							>{/each}
					</select>
				</label>
			</div>
			<div class="model-slot">
				<ModelPicker
					models={configuredModels}
					value={selectedModel}
					loading={modelsLoading}
					disabled={submitting || configuredModels.length === 0}
					placeholder={modelLoadError ? 'Models unavailable' : 'Choose a model'}
					onselect={(model) => {
						selectedModel = model;
						setLastUsedModel(model);
					}}
				/>
			</div>
			<Button
				variant="default"
				size="icon-lg"
				class="send-button"
				disabled={submitting}
				aria-label={submitting ? 'Starting chat' : 'Send prompt'}
				title={submitting ? 'Starting chat' : 'Send prompt'}
				onclick={submitPrompt}
				>{#if submitting}<Loader2
						size={20}
						class="animate-spin"
						aria-hidden="true"
					/>{:else}<ArrowUpRight size={22} aria-hidden="true" />{/if}</Button
			>
		</div>
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
	.composer-select,
	.attach-input {
		display: grid;
		gap: 2px;
		color: var(--text-muted);
		font-size: var(--text-body-sm);
	}
	.composer-select select {
		max-width: 130px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text-body);
		padding: 5px;
	}
	.attach-input input {
		max-width: 145px;
		font-size: 11px;
	}
	.attachment-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: var(--space-3);
	}
	.attachment-list span {
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: 3px 6px;
		font-size: var(--text-body-sm);
	}
	.attachment-list button {
		margin-left: 4px;
		color: var(--text-muted);
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
	.home-wrap {
		width: min(100%, 1100px);
		max-width: 1100px;
		padding: clamp(110px, 17vh, 185px) 28px 70px;
		text-align: center;
	}
	.home-mark {
		margin: 0 auto 42px;
		color: var(--text-strong);
		font-size: 45px;
		font-weight: 600;
		letter-spacing: -0.08em;
		line-height: 1;
	}
	.home-wrap h1 {
		margin: 0 0 42px;
		font-size: clamp(38px, 4vw, 56px);
		line-height: 1.12;
		letter-spacing: -0.055em;
		font-weight: 400;
	}
	.home-composer {
		width: 100%;
		min-height: 250px;
		display: flex;
		flex-direction: column;
		padding: 28px 32px 24px;
		text-align: left;
		border-color: var(--border-strong);
		border-radius: 20px;
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
	}
	.home-composer textarea {
		flex: 1;
		min-height: 120px;
		font-size: 20px;
		line-height: 1.45;
	}
	.composer-row {
		gap: 14px;
		padding-top: 12px;
		border: 0;
	}
	.attach-input {
		width: 38px;
		height: 42px;
		display: grid;
		place-items: center;
		color: var(--text-strong);
		cursor: pointer;
	}
	.attach-input input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.composer-divider {
		height: 30px;
		width: 1px;
		background: var(--border-strong);
	}
	.context-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		color: var(--text-body);
	}
	.context-controls > span {
		font-size: 14px;
	}
	.composer-select {
		display: flex;
	}
	.composer-select select {
		max-width: 122px;
		padding: 5px 18px 5px 5px;
		border: 0;
		background: transparent;
		color: var(--text-body);
		font-size: 13px;
	}
	.model-slot {
		margin-left: auto;
	}
	:global(.send-button) {
		min-width: 58px;
		min-height: 58px;
		border-radius: 11px;
	}
	@media (max-width: 760px) {
		.home-wrap {
			padding: clamp(70px, 13vh, 130px) 18px 80px;
		}
		.home-mark {
			margin-bottom: 28px;
		}
		.home-wrap h1 {
			font-size: clamp(32px, 8vw, 46px);
			margin-bottom: 32px;
		}
		.home-composer {
			min-height: 245px;
			padding: 20px;
		}
		.home-composer textarea {
			min-height: 95px;
			font-size: 17px;
		}
		.composer-row {
			gap: 8px;
		}
		.context-controls {
			flex: 1 1 100%;
			order: 3;
			flex-wrap: wrap;
		}
		.model-slot {
			margin-left: auto;
		}
	}
</style>
