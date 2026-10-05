<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { ArrowLeft, Eye, EyeOff, ExternalLink, Lock, Plus, RotateCcw, X } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import ProviderCard from '../ProviderCard.svelte';
	import ModelSelector from '../ModelSelector.svelte';
	import {
		consumeNavigationHandoff,
		createNavigationHandoff
	} from '$lib/client/navigation-handoff';
	import {
		isModelFree,
		PROTOCOLS,
		type CustomConfig,
		type ModelItem,
		type Protocol,
		type ProviderState
	} from '../provider-types';
	import { notifyModelsChanged } from '$lib/client/models-cache';

	type Props = {
		isDirty?: boolean;
		discard?: () => void;
	};

	// eslint-disable-next-line no-useless-assignment
	let { isDirty = $bindable(false), discard = $bindable() }: Props = $props();

	const PROVIDERS: Array<{ id: string; name: string; description: string; envVar: string }> = [
		{
			id: 'openai',
			name: 'OpenAI',
			description: 'GPT models via the OpenAI Responses API.',
			envVar: 'OPENAI_API_KEY'
		},
		{
			id: 'anthropic',
			name: 'Anthropic',
			description: 'Claude models via the Messages API.',
			envVar: 'ANTHROPIC_API_KEY'
		},
		{
			id: 'google',
			name: 'Google',
			description: 'Gemini models via the Generative Language API.',
			envVar: 'GOOGLE_API_KEY'
		}
	];

	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let saving = $state(false);
	let providers = $state<ProviderState[]>([]);
	let editing = $state<string | null>(null);
	let draftKey = $state('');
	let draftBaseUrl = $state('');
	let draftName = $state('');
	let draftProtocol = $state<Protocol>('openai-completions');
	let draftModels = $state('');
	let creatingCustom = $state(false);
	let discovering = $state(false);
	let modelsList = $state<ModelItem[]>([]);
	let modelFilter = $state('');
	let manualModelId = $state('');
	let textEditMode = $state(false);
	let showApiKey = $state(false);
	let returnTarget = $state<string | null>(null);
	let returnPrompt = $state('');
	let chatGpt = $state<{ connected: boolean; email: string | null; pending: boolean }>({
		connected: false,
		email: null,
		pending: false
	});
	let chatGptBusy = $state(false);
	let chatGptError = $state<string | null>(null);
	let chatGptStatus = $state('');
	let chatGptPollTimer: ReturnType<typeof setTimeout> | undefined;
	let chatGptDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
	let authWindow: Window | null = null;
	let chatGptFlowActive = $state(false);
	let chatGptDisposed = false;
	let chatGptModelIds = $state<string[]>([]);
	let chatGptModelIdDraft = $state('');
	let chatGptModelsLoading = $state(true);
	let chatGptModelsBusy = $state(false);
	let chatGptModelsError = $state<string | null>(null);

	let initialBaseUrl = $state('');
	let initialName = $state('');
	let initialProtocol = $state<Protocol>('openai-completions');
	let initialDraftModels = $state('');
	let initialModelsJson = $state('');

	let isEditorDirty = $derived(
		Boolean(
			editing &&
			(draftKey.trim() !== '' ||
				draftBaseUrl !== initialBaseUrl ||
				draftName !== initialName ||
				draftProtocol !== initialProtocol ||
				draftModels !== initialDraftModels ||
				JSON.stringify(modelsList) !== initialModelsJson)
		)
	);

	$effect(() => {
		isDirty = isEditorDirty;
	});

	$effect(() => {
		discard = () => {
			closeEditor();
		};
	});

	function closeEditor() {
		editing = null;
		creatingCustom = false;
		draftKey = '';
		draftBaseUrl = '';
		draftName = '';
		draftModels = '';
		modelsList = [];
	}

	function handleBack() {
		if (isEditorDirty) {
			if (!window.confirm('Discard unsaved changes?')) return;
		}
		closeEditor();
	}

	let connectedProviders = $derived(
		providers.filter(
			(p) => (p.configured || p.fromUser || p.customConfig) && p.provider !== 'chatgpt'
		)
	);
	let availableProviders = $derived(
		providers.filter(
			(p) => !p.configured && !p.fromUser && !p.customConfig && p.provider !== 'chatgpt'
		)
	);
	let currentEditingProvider = $derived(
		editing ? (providers.find((p) => p.provider === editing) ?? null) : null
	);
	let isCustomEditor = $derived(creatingCustom || Boolean(currentEditingProvider?.customConfig));
	let editorTitle = $derived(
		creatingCustom
			? draftName.trim() || 'New provider'
			: currentEditingProvider?.name || 'Provider settings'
	);

	function notify(message: string) {
		toast(message);
	}

	async function loadProviders() {
		const response = await fetch('/api/providers');
		if (!response.ok) throw new Error('Could not load providers');
		const data = await response.json();
		const builtIns = PROVIDERS.map((info) => {
			const stored = (data.providers ?? []).find(
				(p: { provider: string }) => p.provider === info.id
			);
			return {
				provider: info.id,
				name: info.name,
				description: info.description,
				envVar: info.envVar,
				apiKey: stored?.apiKey ?? null,
				baseUrl: stored?.baseUrl ?? null,
				fromUser: Boolean(stored?.fromUser),
				configured: Boolean(stored?.apiKey),
				customConfig: null
			};
		});
		const custom = (data.providers ?? [])
			.filter((provider: { customConfig?: CustomConfig }) => provider.customConfig)
			.map(
				(provider: {
					provider: string;
					apiKey: string | null;
					baseUrl: string | null;
					fromUser: boolean;
					customConfig: CustomConfig;
				}) => ({
					...provider,
					name: provider.customConfig.name,
					description: `${PROTOCOLS.find((item) => item.id === provider.customConfig.protocol)?.name ?? provider.customConfig.protocol} · ${provider.customConfig.models.length} model${provider.customConfig.models.length === 1 ? '' : 's'}`,
					envVar: null,
					configured: Boolean(provider.baseUrl)
				})
			);
		providers = [...builtIns, ...custom];
	}

	async function fetchProviders() {
		loading = true;
		loadError = null;
		try {
			await loadProviders();
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Could not load providers';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		const handoff = consumeNavigationHandoff();
		returnTarget = handoff?.returnTo === '/' ? '/' : null;
		returnPrompt = handoff?.returnTo === '/' ? handoff.prompt : '';
		await Promise.all([fetchProviders(), fetchChatGptStatus(), fetchChatGptModels()]);
		if (chatGpt.pending && !chatGptDisposed) startChatGptPolling();
	});

	onDestroy(() => {
		chatGptDisposed = true;
		stopChatGptPolling();
		chatGptFlowActive = false;
	});

	function stopChatGptPolling() {
		if (chatGptPollTimer) clearTimeout(chatGptPollTimer);
		if (chatGptDeadlineTimer) clearTimeout(chatGptDeadlineTimer);
		chatGptPollTimer = undefined;
		chatGptDeadlineTimer = undefined;
	}

	function errorMessage(
		payload: { error?: { message?: string }; message?: string },
		fallback: string
	) {
		return payload?.error?.message ?? payload?.message ?? fallback;
	}

	async function fetchChatGptModels() {
		chatGptModelsLoading = true;
		chatGptModelsError = null;
		try {
			const response = await fetch('/api/providers/chatgpt/models');
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(errorMessage(data, 'Could not load manual ChatGPT models'));
			chatGptModelIds = Array.isArray(data?.modelIds)
				? data.modelIds.filter((id: unknown): id is string => typeof id === 'string')
				: [];
		} catch (error) {
			chatGptModelsError =
				error instanceof Error ? error.message : 'Could not load manual ChatGPT models';
		} finally {
			chatGptModelsLoading = false;
		}
	}

	async function saveChatGptModels(modelIds: string[]) {
		if (chatGptModelsBusy) return;
		chatGptModelsBusy = true;
		chatGptModelsError = null;
		try {
			const response = await fetch('/api/providers/chatgpt/models', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ modelIds })
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(errorMessage(data, 'Could not save manual ChatGPT models'));
			chatGptModelIds = Array.isArray(data?.modelIds)
				? data.modelIds.filter((id: unknown): id is string => typeof id === 'string')
				: modelIds;
			chatGptModelIdDraft = '';
			notifyModelsChanged();
		} catch (error) {
			chatGptModelsError =
				error instanceof Error ? error.message : 'Could not save manual ChatGPT models';
		} finally {
			chatGptModelsBusy = false;
		}
	}

	function addChatGptModel() {
		const modelId = chatGptModelIdDraft.trim();
		if (!modelId) {
			chatGptModelsError = 'Enter a model ID.';
			return;
		}
		if (modelId.length > 200 || /\s/.test(modelId)) {
			chatGptModelsError = 'Model IDs must be at most 200 characters and contain no whitespace.';
			return;
		}
		if (chatGptModelIds.includes(modelId)) {
			chatGptModelsError = 'That model ID is already in the list.';
			return;
		}
		if (chatGptModelIds.length >= 100) {
			chatGptModelsError = 'You can add up to 100 manual model IDs.';
			return;
		}
		void saveChatGptModels([...chatGptModelIds, modelId]);
	}

	function removeChatGptModel(modelId: string) {
		void saveChatGptModels(chatGptModelIds.filter((id) => id !== modelId));
	}

	async function fetchChatGptStatus(): Promise<boolean> {
		try {
			const response = await fetch('/api/providers/chatgpt');
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(errorMessage(data, 'Could not check ChatGPT connection'));
			const account = data?.account && typeof data.account === 'object' ? data.account : null;
			chatGpt = {
				connected: data?.connected === true,
				email: typeof account?.email === 'string' ? account.email : null,
				pending:
					data?.pending === true || data?.status === 'pending' || data?.status === 'authorizing'
			};
			chatGptError = typeof data?.error === 'string' && data.error ? data.error : null;
			return chatGpt.connected;
		} catch (error) {
			if (!chatGptDisposed)
				chatGptError =
					error instanceof Error ? error.message : 'Could not check ChatGPT connection';
			return false;
		}
	}

	function scheduleChatGptPoll() {
		if (!chatGptFlowActive || chatGptDisposed) return;
		chatGptPollTimer = setTimeout(async () => {
			const connected = await fetchChatGptStatus();
			if (!chatGptFlowActive || chatGptDisposed) return;
			if (connected) {
				stopChatGptPolling();
				chatGptFlowActive = false;
				chatGptBusy = false;
				chatGptStatus = 'ChatGPT connected.';
				if (authWindow && !authWindow.closed) authWindow.close();
				await fetchProviders();
				notifyModelsChanged();
				return;
			}
			if (chatGptError || !chatGpt.pending) {
				stopChatGptPolling();
				chatGptFlowActive = false;
				chatGptBusy = false;
				chatGptStatus = '';
				return;
			}
			scheduleChatGptPoll();
		}, 2000);
	}

	function startChatGptPolling() {
		chatGptFlowActive = true;
		chatGptBusy = true;
		chatGptStatus = 'Waiting for sign-in to finish…';
		stopChatGptPolling();
		chatGptDeadlineTimer = setTimeout(
			() => {
				stopChatGptPolling();
				chatGptFlowActive = false;
				chatGptBusy = false;
				chatGpt.pending = false;
				chatGptStatus = '';
				chatGptError = 'Sign-in timed out. Try connecting again.';
			},
			5 * 60 * 1000
		);
		scheduleChatGptPoll();
	}

	async function connectChatGpt() {
		if (chatGptBusy) return;
		// Open synchronously from the click to avoid popup blockers while the API responds.
		authWindow = window.open('about:blank', '_blank');
		if (!authWindow) {
			chatGptError = 'Allow pop-ups for this site to continue with ChatGPT sign-in.';
			return;
		}
		authWindow.opener = null;
		chatGptBusy = true;
		chatGptError = null;
		chatGptStatus = 'Preparing secure sign-in…';
		try {
			const response = await fetch('/api/providers/chatgpt', { method: 'POST' });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(errorMessage(data, 'Could not start ChatGPT sign-in'));
			if (typeof data?.authorizationUrl !== 'string')
				throw new Error('The sign-in service returned an invalid authorization URL.');
			const authorization = new URL(data.authorizationUrl);
			if (authorization.protocol !== 'https:' || authorization.hostname !== 'auth.openai.com') {
				throw new Error('The sign-in service returned an untrusted authorization URL.');
			}
			authWindow.location.replace(authorization.href);
			chatGpt.pending = true;
			if (!chatGptDisposed) startChatGptPolling();
		} catch (error) {
			if (authWindow && !authWindow.closed) authWindow.close();
			authWindow = null;
			chatGptBusy = false;
			chatGpt.pending = false;
			chatGptError = error instanceof Error ? error.message : 'Could not start ChatGPT sign-in';
		}
	}

	async function disconnectChatGpt() {
		chatGptFlowActive = false;
		stopChatGptPolling();
		chatGptBusy = true;
		chatGptError = null;
		try {
			const response = await fetch('/api/providers/chatgpt', { method: 'DELETE' });
			const data = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(errorMessage(data, 'Could not disconnect ChatGPT'));
			if (authWindow && !authWindow.closed) authWindow.close();
			authWindow = null;
			chatGpt = { connected: false, email: null, pending: false };
			chatGptStatus =
				data.revocationConfirmed === false
					? 'Disconnected locally. Remote revocation was not confirmed; remove access in ChatGPT Settings.'
					: '';
			await fetchProviders();
			notifyModelsChanged();
		} catch (error) {
			chatGptError = error instanceof Error ? error.message : 'Could not disconnect ChatGPT';
		} finally {
			chatGptBusy = false;
		}
	}

	function openEditor(provider: string) {
		creatingCustom = false;
		editing = provider;
		const current = providers.find((p) => p.provider === provider);
		draftKey = '';
		draftBaseUrl = current?.baseUrl ?? '';
		draftName = current?.customConfig?.name ?? current?.name ?? '';
		draftProtocol = current?.customConfig?.protocol ?? 'openai-completions';
		modelFilter = '';
		manualModelId = '';
		textEditMode = false;
		showApiKey = false;
		const existingModels = current?.customConfig?.models ?? [];
		modelsList = existingModels.map((m) => ({
			id: m.id,
			name: m.name,
			contextWindow: m.contextWindow,
			maxTokens: m.maxTokens,
			reasoning: m.reasoning,
			vision: m.vision,
			isFree: isModelFree(m),
			checked: true
		}));
		draftModels = modelsList.map((m) => m.id).join('\n');

		initialBaseUrl = draftBaseUrl;
		initialName = draftName;
		initialProtocol = draftProtocol;
		initialDraftModels = draftModels;
		initialModelsJson = JSON.stringify(modelsList);
	}

	function openCustomEditor() {
		creatingCustom = true;
		editing = 'new';
		draftKey = '';
		draftBaseUrl = '';
		draftName = '';
		draftProtocol = 'openai-completions';
		draftModels = '';
		modelsList = [];
		modelFilter = '';
		manualModelId = '';
		textEditMode = false;
		showApiKey = false;

		initialBaseUrl = '';
		initialName = '';
		initialProtocol = 'openai-completions';
		initialDraftModels = '';
		initialModelsJson = '[]';
	}

	async function discoverModels() {
		if (!draftBaseUrl.trim()) {
			notify('Enter a base URL to fetch models');
			return;
		}
		discovering = true;
		try {
			const res = await fetch('/api/providers/discover', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					protocol: draftProtocol,
					baseUrl: draftBaseUrl.trim(),
					apiKey: draftKey.trim() || undefined,
					provider: creatingCustom ? undefined : (editing ?? undefined)
				})
			});
			if (!res.ok) {
				const err = await res.json();
				throw new Error(err.error?.message ?? 'Could not retrieve models');
			}
			const data = await res.json();
			if (!data.models || data.models.length === 0) {
				notify('No models found at endpoint');
			} else {
				const existingChecked = new Set(modelsList.filter((m) => m.checked).map((m) => m.id));
				const hadExisting = existingChecked.size > 0;
				const discovered: Array<{
					id: string;
					name?: string;
					contextWindow?: number;
					maxTokens?: number;
					reasoning?: boolean;
					vision?: boolean;
					isFree?: boolean;
				}> = data.models;

				const discoveredIds = new Set(discovered.map((m) => m.id));
				const manualRetained = modelsList.filter((m) => !discoveredIds.has(m.id) && m.checked);

				modelsList = [
					...discovered.map((m) => ({
						id: m.id,
						name: m.name,
						contextWindow: m.contextWindow,
						maxTokens: m.maxTokens,
						reasoning: m.reasoning,
						vision: m.vision,
						isFree: isModelFree(m),
						checked: hadExisting ? existingChecked.has(m.id) : true
					})),
					...manualRetained
				];
				textEditMode = false;
				notify(`Retrieved ${data.models.length} model${data.models.length === 1 ? '' : 's'}`);
			}
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not retrieve models');
		} finally {
			discovering = false;
		}
	}

	async function saveProvider() {
		if (!editing) return;
		const provider = editing;
		const current = providers.find((p) => p.provider === provider);
		const isCustom = creatingCustom || Boolean(current?.customConfig);
		if (!draftKey.trim() && !draftBaseUrl.trim() && !current?.fromUser) {
			notify('Enter an API key or a base URL');
			return;
		}
		saving = true;
		try {
			const body: Record<string, unknown> = {};
			if (draftKey.trim()) body.apiKey = draftKey.trim();
			if (draftBaseUrl.trim()) body.baseUrl = draftBaseUrl.trim();
			else if (current?.baseUrl) body.baseUrl = null;
			if (isCustom) {
				if (!draftName.trim() || !draftBaseUrl.trim()) {
					notify('Enter a provider name and base URL');
					return;
				}

				let finalModels: Array<{
					id: string;
					name?: string;
					contextWindow?: number;
					maxTokens?: number;
					reasoning?: boolean;
					vision?: boolean;
				}>;

				if (textEditMode) {
					const modelIds = [
						...new Set(
							draftModels
								.split(/[\n,]/)
								.map((id) => id.trim())
								.filter(Boolean)
						)
					];
					finalModels = modelIds.map((id) => ({ id }));
				} else if (modelsList.length > 0) {
					const checkedModels = modelsList.filter((m) => m.checked);
					if (checkedModels.length === 0) {
						notify('Select at least one model to enable');
						return;
					}
					finalModels = checkedModels.map((m) => ({
						id: m.id,
						...(m.name ? { name: m.name } : {}),
						...(m.contextWindow ? { contextWindow: m.contextWindow } : {}),
						...(m.maxTokens ? { maxTokens: m.maxTokens } : {}),
						...(typeof m.reasoning === 'boolean' ? { reasoning: m.reasoning } : {}),
						...(typeof m.vision === 'boolean' ? { vision: m.vision } : {})
					}));
				} else {
					finalModels = [];
				}

				body.customConfig = {
					name: draftName.trim(),
					protocol: draftProtocol,
					models: finalModels
				};
			}
			const response = await fetch(
				creatingCustom ? '/api/providers' : `/api/providers/${provider}`,
				{
					method: creatingCustom ? 'POST' : 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
				}
			);
			if (!response.ok)
				throw new Error((await response.json()).error?.message ?? 'Could not save provider');
			notify('Provider saved');
			notifyModelsChanged();
			editing = null;
			creatingCustom = false;
			await loadProviders();
			if (returnTarget) {
				createNavigationHandoff({ prompt: returnPrompt, returnTo: returnTarget });
				window.location.href = returnTarget;
			}
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not save provider');
		} finally {
			saving = false;
		}
	}

	async function removeProvider(provider: string) {
		if (!window.confirm('Remove this provider connection? This cannot be undone.')) return;
		try {
			const response = await fetch(`/api/providers/${provider}`, { method: 'DELETE' });
			if (!response.ok) throw new Error('Could not remove provider');
			notify('Provider key removed');
			notifyModelsChanged();
			await loadProviders();
		} catch (error) {
			notify(error instanceof Error ? error.message : 'Could not remove provider');
		}
	}
</script>

<div class="tab-pane">
	{#if loading}
		<div class="empty-state" role="status">Checking model connections...</div>
	{:else if loadError}
		<div class="load-error-card" role="alert">
			<div class="error-content">
				<span class="error-title">Failed to load providers</span>
				<p class="error-message">{loadError}</p>
			</div>
			<button type="button" class="retry-btn" onclick={fetchProviders}>
				<RotateCcw size={15} />
				<span>Retry</span>
			</button>
		</div>
	{:else if editing}
		<!-- Screen 08: In-Pane Provider Editor -->
		<div class="provider-editor">
			<div class="editor-header">
				<button type="button" class="back-button" onclick={handleBack}>
					<ArrowLeft size={16} />
					<span>Models & providers</span>
				</button>
				<h1 class="editor-title">{editorTitle}</h1>
				<p class="editor-subtitle">Connection settings</p>
			</div>

			<form
				class="editor-form"
				onsubmit={(e) => {
					e.preventDefault();
					saveProvider();
				}}
			>
				{#if isCustomEditor}
					<div class="form-field">
						<label for="provider-name-input">Provider name</label>
						<input
							id="provider-name-input"
							type="text"
							bind:value={draftName}
							placeholder="OpenCode Zen"
							autocomplete="off"
							required
						/>
					</div>

					<div class="form-field">
						<label for="provider-protocol-select">API template</label>
						<div class="select-wrapper">
							<select id="provider-protocol-select" bind:value={draftProtocol}>
								{#each PROTOCOLS as preset (preset.id)}
									<option value={preset.id}>
										{preset.name} · {preset.description}
									</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}

				<div class="form-field">
					<label for="provider-url-input">
						Base URL {#if !isCustomEditor}<span class="field-hint">optional</span>{/if}
					</label>
					<input
						id="provider-url-input"
						type="text"
						bind:value={draftBaseUrl}
						placeholder="https://opencode.ai/zen/v1"
						autocomplete="off"
					/>
				</div>

				<div class="form-field">
					<label for="provider-key-input">API key</label>
					<div class="input-with-action">
						<input
							id="provider-key-input"
							type={showApiKey ? 'text' : 'password'}
							bind:value={draftKey}
							placeholder="Enter API key"
							autocomplete="off"
						/>
						<button
							type="button"
							class="input-action-btn"
							onclick={() => (showApiKey = !showApiKey)}
							title={showApiKey ? 'Hide key' : 'Show key'}
							aria-label={showApiKey ? 'Hide key' : 'Show key'}
						>
							{#if showApiKey}
								<EyeOff size={16} />
							{:else}
								<Eye size={16} />
							{/if}
						</button>
					</div>
					<span class="field-hint-bottom">Optional for keyless servers.</span>
				</div>

				{#if isCustomEditor}
					<ModelSelector
						bind:models={modelsList}
						bind:filter={modelFilter}
						bind:manualModelId
						bind:textEditMode
						bind:draftModels
						{discovering}
						ondiscover={discoverModels}
						onnotify={notify}
					/>
				{/if}

				<div class="editor-actions">
					<button type="button" class="cancel-btn" onclick={handleBack}> Cancel </button>
					<button type="submit" class="save-btn" disabled={saving}>
						{saving ? 'Saving...' : 'Save connection'}
					</button>
				</div>
			</form>
		</div>
	{:else}
		<!-- Screen 07: Providers List -->
		<div class="providers-view">
			<div class="view-header">
				<div class="title-group">
					<h1 class="view-title">Models & providers</h1>
					<p class="view-subtitle">Choose the models available in your chats.</p>
				</div>
				<button type="button" class="add-provider-btn" onclick={openCustomEditor}>
					<Plus size={15} />
					<span>Add provider</span>
				</button>
			</div>

			<div class="sections-container">
				<section class="chatgpt-card" aria-labelledby="chatgpt-title">
					<div class="chatgpt-copy">
						<div class="chatgpt-heading">
							<div>
								<h2 id="chatgpt-title">ChatGPT</h2>
								<p>Use your eligible ChatGPT plan</p>
							</div>
						</div>
						{#if chatGpt.connected && chatGpt.email}
							<p class="chatgpt-email">Connected as <span>{chatGpt.email}</span></p>
						{/if}
						<p class="chatgpt-disclaimer">
							Sign-in runs locally on this computer. Your ChatGPT history is not imported.
						</p>
						{#if chatGpt.connected}
							<p class="chatgpt-disclaimer">
								<a
									href="https://chatgpt.com/settings/usage"
									target="_blank"
									rel="noopener noreferrer">Manage usage and access in ChatGPT Settings</a
								>
							</p>
						{/if}
						<div class="chatgpt-model-config" aria-labelledby="chatgpt-models-title">
							<h3 id="chatgpt-models-title">Manual model IDs</h3>
							<p class="chatgpt-disclaimer" id="chatgpt-models-warning">
								Manual model access is not verified. OpenAI may reject model IDs that are
								unavailable to your account.
							</p>
							<form
								class="chatgpt-model-form"
								onsubmit={(event) => {
									event.preventDefault();
									addChatGptModel();
								}}
							>
								<label class="sr-only" for="chatgpt-model-id">Model ID</label>
								<input
									id="chatgpt-model-id"
									type="text"
									bind:value={chatGptModelIdDraft}
									placeholder="e.g. gpt-6.1-sol"
									maxlength="200"
									pattern="\S+"
									autocomplete="off"
									aria-describedby="chatgpt-models-warning"
									disabled={chatGptModelsBusy || chatGptModelsLoading}
								/>
								<button
									type="submit"
									class="chatgpt-button secondary"
									aria-label="Add manual ChatGPT model ID"
									disabled={chatGptModelsBusy ||
										chatGptModelsLoading ||
										!chatGptModelIdDraft.trim()}>Add</button
								>
							</form>
							{#if chatGptModelsLoading}
								<p class="chatgpt-disclaimer" role="status">Loading manual models…</p>
							{:else if chatGptModelIds.length > 0}
								<ul class="chatgpt-model-list">
									{#each chatGptModelIds as modelId (modelId)}
										<li>
											<code>{modelId}</code><button
												type="button"
												class="chatgpt-remove-model"
												aria-label="Remove manual ChatGPT model {modelId}"
												onclick={() => removeChatGptModel(modelId)}
												disabled={chatGptModelsBusy}>Remove</button
											>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="chatgpt-disclaimer">No manual model IDs configured.</p>
							{/if}
							{#if chatGptModelsError}<p class="chatgpt-error" role="alert">
									{chatGptModelsError}
								</p>{/if}
						</div>
						{#if chatGptStatus}<p class="chatgpt-status" role="status">{chatGptStatus}</p>{/if}
						{#if chatGptError}<p class="chatgpt-error" role="alert">{chatGptError}</p>{/if}
					</div>
					<div class="chatgpt-actions">
						{#if chatGpt.connected}
							<button
								type="button"
								class="chatgpt-button secondary"
								onclick={disconnectChatGpt}
								disabled={chatGptBusy}>Disconnect</button
							>
						{:else if chatGptBusy || chatGpt.pending}
							<button
								type="button"
								class="chatgpt-button secondary"
								onclick={disconnectChatGpt}
								disabled={chatGptBusy && !chatGptFlowActive}><X size={14} /> Cancel</button
							>
						{:else}
							<button
								type="button"
								class="chatgpt-button"
								onclick={connectChatGpt}
								disabled={chatGptBusy}>Continue with ChatGPT <ExternalLink size={14} /></button
							>
						{/if}
					</div>
				</section>
				{#if connectedProviders.length > 0}
					<div class="provider-section">
						<h2 class="section-label">CONNECTED</h2>
						<div class="provider-list">
							{#each connectedProviders as provider (provider.provider)}
								<ProviderCard {provider} onmanage={openEditor} onremove={removeProvider} />
							{/each}
						</div>
					</div>
				{/if}

				{#if availableProviders.length > 0}
					<div class="provider-section">
						<h2 class="section-label">AVAILABLE</h2>
						<div class="provider-list">
							{#each availableProviders as provider (provider.provider)}
								<ProviderCard {provider} onmanage={openEditor} onremove={removeProvider} />
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<div class="footnote-bar">
				<Lock size={13} />
				<span>API keys are encrypted.</span>
			</div>
		</div>
	{/if}
</div>

<svelte:window onkeydown={(event) => event.key === 'Escape' && editing && handleBack()} />

<style>
	.tab-pane {
		padding: 28px 32px 36px;
		color: #ececee;
		font-family: var(--font-body);
	}
	.view-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
		padding-right: 40px;
	}
	.view-title {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.view-subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: #a1a1aa;
	}
	.add-provider-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		height: 36px;
		padding: 0 16px;
		background: #f4f4f5;
		border: 0;
		border-radius: 10px;
		color: #18181b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.add-provider-btn:hover {
		background: #e4e4e7;
	}
	.sections-container {
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.section-label {
		margin: 0 0 10px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: #71717a;
		text-transform: uppercase;
	}
	.provider-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.chatgpt-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		padding: 18px;
		border: 1px solid #34343a;
		border-radius: 14px;
		background: #1c1c1f;
	}
	.chatgpt-copy {
		min-width: 0;
	}
	.chatgpt-heading {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.chatgpt-heading h2 {
		margin: 0;
		color: #ececee;
		font-size: 15px;
		font-weight: 600;
	}
	.chatgpt-heading p,
	.chatgpt-email,
	.chatgpt-disclaimer,
	.chatgpt-status,
	.chatgpt-error {
		margin: 3px 0 0;
		font-size: 12px;
		color: #a1a1aa;
	}
	.chatgpt-email {
		margin: 12px 0 0;
	}
	.chatgpt-email span {
		color: #ececee;
	}
	.chatgpt-disclaimer {
		margin: 12px 0 0;
		max-width: 540px;
		line-height: 1.5;
	}
	.chatgpt-disclaimer a {
		color: #d4d4d8;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.chatgpt-status {
		color: #d4d4d8;
	}
	.chatgpt-error {
		color: #fca5a5;
	}
	.chatgpt-actions {
		flex: 0 0 auto;
	}
	.chatgpt-model-config {
		margin-top: 16px;
		max-width: 560px;
	}
	.chatgpt-model-config h3 {
		margin: 0;
		color: #d4d4d8;
		font-size: 12px;
		font-weight: 600;
	}
	.chatgpt-model-form {
		display: flex;
		gap: 8px;
		margin-top: 10px;
	}
	.chatgpt-model-form input {
		flex: 1;
		min-width: 0;
		height: 36px;
		padding: 0 10px;
		border: 1px solid #34343a;
		border-radius: 8px;
		background: #151517;
		color: #ececee;
		font: inherit;
		font-size: 12px;
	}
	.chatgpt-model-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 10px 0 0;
		padding: 0;
		list-style: none;
	}
	.chatgpt-model-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 7px 9px;
		border: 1px solid #2c2c30;
		border-radius: 8px;
		background: #19191c;
	}
	.chatgpt-model-list code {
		min-width: 0;
		overflow-wrap: anywhere;
		color: #d4d4d8;
		font-size: 12px;
	}
	.chatgpt-remove-model {
		flex: 0 0 auto;
		padding: 3px 6px;
		border: 0;
		background: transparent;
		color: #a1a1aa;
		font: inherit;
		font-size: 11px;
		cursor: pointer;
	}
	.chatgpt-remove-model:hover:not(:disabled) {
		color: #ececee;
	}
	.chatgpt-remove-model:disabled {
		opacity: 0.55;
		cursor: wait;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.chatgpt-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 36px;
		padding: 0 13px;
		border: 0;
		border-radius: 9px;
		background: #f4f4f5;
		color: #18181b;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
	}
	.chatgpt-button:hover:not(:disabled) {
		background: #e4e4e7;
	}
	.chatgpt-button.secondary {
		border: 1px solid #3b3b42;
		background: #252529;
		color: #ececee;
	}
	.chatgpt-button:focus-visible {
		outline: 2px solid #d4d4d8;
		outline-offset: 3px;
	}
	.chatgpt-button:disabled {
		opacity: 0.55;
		cursor: wait;
	}
	@media (max-width: 640px) {
		.chatgpt-card {
			align-items: flex-start;
			flex-direction: column;
		}
		.chatgpt-actions,
		.chatgpt-button {
			width: 100%;
		}
	}
	.empty-state {
		text-align: center;
		color: #71717a;
		font-size: 13px;
		padding: 48px 0;
	}
	.footnote-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 24px;
		color: #71717a;
		font-size: 12px;
	}

	/* In-Pane Editor Styles (Screen 08) */
	.provider-editor {
		display: flex;
		flex-direction: column;
		padding-right: 36px;
	}
	.editor-header {
		margin-bottom: 22px;
	}
	.back-button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: transparent;
		border: 0;
		color: #a1a1aa;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		padding: 0;
		margin-bottom: 12px;
		transition: color var(--duration-short2) var(--ease-standard);
	}
	.back-button:hover {
		color: #ececee;
	}
	.editor-title {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		color: #ececee;
		letter-spacing: -0.01em;
	}
	.editor-subtitle {
		margin: 4px 0 0;
		font-size: 13px;
		color: #71717a;
	}
	.editor-form {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.form-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.form-field label {
		font-size: 13px;
		font-weight: 500;
		color: #a1a1aa;
	}
	.field-hint {
		color: #71717a;
		font-weight: 400;
		margin-left: 4px;
	}
	.field-hint-bottom {
		font-size: 12px;
		color: #71717a;
		margin-top: 2px;
	}
	.form-field input[type='text'],
	.form-field input[type='password'],
	.select-wrapper select {
		width: 100%;
		height: 40px;
		padding: 0 12px;
		background: #151517;
		border: 1px solid #2c2c30;
		border-radius: 10px;
		color: #ececee;
		font-family: var(--font-body);
		font-size: 13px;
		outline: none;
		transition: border-color var(--duration-short2) var(--ease-standard);
	}
	.form-field input:focus,
	.select-wrapper select:focus {
		border-color: #3f3f45;
	}
	.form-field input::placeholder {
		color: #71717a;
	}
	.select-wrapper {
		position: relative;
	}
	.select-wrapper select {
		appearance: none;
		cursor: pointer;
		padding-right: 32px;
	}
	.select-wrapper::after {
		content: '';
		position: absolute;
		right: 14px;
		top: 50%;
		transform: translateY(-50%);
		width: 8px;
		height: 8px;
		border-right: 1.5px solid #a1a1aa;
		border-bottom: 1.5px solid #a1a1aa;
		transform: translateY(-65%) rotate(45deg);
		pointer-events: none;
	}
	.input-with-action {
		position: relative;
		display: flex;
		align-items: center;
	}
	.input-with-action input {
		padding-right: 40px;
	}
	.input-action-btn {
		position: absolute;
		right: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: transparent;
		border: 0;
		color: #71717a;
		cursor: pointer;
		transition: color var(--duration-short2) var(--ease-standard);
	}
	.input-action-btn:hover {
		color: #ececee;
	}
	.editor-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin-top: 16px;
		padding-top: 16px;
	}
	.cancel-btn {
		height: 38px;
		padding: 0 18px;
		background: #26262b;
		border: 1px solid #34343a;
		border-radius: 10px;
		color: #ececee;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition:
			background-color var(--duration-short2) var(--ease-standard),
			border-color var(--duration-short2) var(--ease-standard);
	}
	.cancel-btn:hover {
		background: #2f2f35;
		border-color: #404046;
	}
	.save-btn {
		height: 38px;
		padding: 0 18px;
		background: #f4f4f5;
		border: 0;
		border-radius: 10px;
		color: #18181b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background-color var(--duration-short2) var(--ease-standard);
	}
	.save-btn:hover:not(:disabled) {
		background: #e4e4e7;
	}
	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.load-error-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px;
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.25);
		border-radius: 12px;
		color: #ececee;
		margin-bottom: 20px;
	}
	.error-content {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.error-title {
		font-size: 14px;
		font-weight: 600;
		color: #f87171;
	}
	.error-message {
		margin: 0;
		font-size: 13px;
		color: #d4d4d8;
	}
	.retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: 8px;
		border: 1px solid #3f3f46;
		background: #27272a;
		color: #ececee;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: background var(--duration-short2) var(--ease-standard);
	}
	.retry-btn:hover {
		background: #3f3f46;
	}

	@media (max-width: 760px) {
		.tab-pane {
			padding: 16px;
		}
		.view-header {
			padding-right: 0;
		}
		.provider-editor {
			padding-right: 0;
		}
	}
</style>
