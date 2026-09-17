<script lang="ts">
	import { ArrowUp, Paperclip, Sparkles, Square, X } from '@lucide/svelte';
	import { onDestroy, untrack } from 'svelte';
	import ModelPicker, {
		type ModelOption,
		type ThinkingLevel
	} from '$lib/components/ModelPicker.svelte';
	import ToolPicker, { type ToolOption } from '$lib/components/ToolPicker.svelte';
	import SkillPicker from '$lib/components/SkillPicker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import type { Skill, SkillSummary } from '$lib/skills';
	import { CHAT_ATTACHMENT_ACCEPT, formatFileSize, isImageFile } from './chat-format';
	import type { Conversation } from './chat-types';

	type Props = {
		message?: string;
		attachments?: File[];
		running?: boolean;
		conversationLoading?: boolean;
		skillSaving?: boolean;
		toolsSaving?: boolean;
		modelSaving?: boolean;
		thinkingSaving?: boolean;
		hasActiveId?: boolean;
		conversation?: Conversation | null;
		models?: ModelOption[];
		modelsLoading?: boolean;
		modelLoadError?: string;
		configuredModels?: ModelOption[];
		thinkingLevels?: ThinkingLevel[];
		thinkingLevel?: string;
		skills?: Skill[];
		skillsLoading?: boolean;
		tools?: ToolOption[];
		toolsLoading?: boolean;
		suggestion?: SkillSummary | null;
		suggestionDismissed?: boolean;
		onattach: (files: File[] | FileList | null) => boolean;
		onremoveattachment: (index: number) => void;
		onsend: () => void;
		onstop: () => void;
		onremoveskill: () => void;
		onapplysuggestion: () => void;
		ondisksuggestion: () => void;
		onselectmodel: (model: string) => void;
		onselectthinkinglevel: (level: string) => void;
		ontoggleskill: (id: string, enabled: boolean) => void;
		ontoggletool: (name: string, enabled: boolean) => void;
	};

	let {
		message = $bindable(''),
		attachments = [],
		running = false,
		conversationLoading = false,
		skillSaving = false,
		toolsSaving = false,
		modelSaving = false,
		thinkingSaving = false,
		hasActiveId = false,
		conversation = null,
		models = [],
		modelsLoading = false,
		modelLoadError = '',
		configuredModels = [],
		thinkingLevels = [],
		thinkingLevel = 'off',
		skills = [],
		skillsLoading = false,
		tools = [],
		toolsLoading = false,
		suggestion = null,
		suggestionDismissed = false,
		onattach,
		onremoveattachment,
		onsend,
		onstop,
		onremoveskill,
		onapplysuggestion,
		ondisksuggestion,
		onselectmodel,
		onselectthinkinglevel,
		ontoggleskill,
		ontoggletool
	}: Props = $props();

	let fileInput = $state<HTMLInputElement | undefined>(undefined);

	/**
	 * Object URLs backing the thumbnails of images waiting to be sent. They are keyed
	 * by `File` identity and revoked as soon as their file leaves `attachments`.
	 */
	let previews = $state<{ file: File; url: string }[]>([]);

	$effect(() => {
		const files = attachments;
		const previous = untrack(() => previews);
		const next = files.filter(isImageFile).map(
			(file) =>
				previous.find((preview) => preview.file === file) ?? {
					file,
					url: URL.createObjectURL(file)
				}
		);
		for (const preview of previous) if (!next.includes(preview)) URL.revokeObjectURL(preview.url);
		previews = next;
	});

	onDestroy(() => {
		for (const preview of previews) URL.revokeObjectURL(preview.url);
	});

	function previewUrl(file: File) {
		return previews.find((preview) => preview.file === file)?.url;
	}

	function blocked() {
		return running || conversationLoading || skillSaving || toolsSaving || modelSaving;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			if (!blocked()) void onsend();
		}
	}

	/** Images pasted from the clipboard join the pending attachments like picked files. */
	function handlePaste(event: ClipboardEvent) {
		if (blocked()) return;
		const items = event.clipboardData?.items;
		if (!items) return;
		const files: File[] = [];
		for (let index = 0; index < items.length; index += 1) {
			const item = items[index];
			if (item.kind !== 'file') continue;
			const file = item.getAsFile();
			if (file) files.push(file);
		}
		if (files.length === 0) return;
		// Only swallow the paste when it actually carried files; text must paste normally.
		event.preventDefault();
		onattach(files);
	}
</script>

<div class="composer-container">
	<div class="chat-composer">
		{#if conversation?.activeSkill}
			<div class="skill-status">
				<span class="skill-badge">
					<Sparkles size={12} class="skill-badge-icon" aria-hidden="true" />
					<span class="skill-badge-name">{conversation.activeSkill.name}</span>
					<button
						type="button"
						class="skill-badge-remove"
						aria-label="Remove active skill"
						title="Remove active skill"
						disabled={conversationLoading || skillSaving || toolsSaving || modelSaving}
						onclick={() => onremoveskill()}
					>
						<X size={12} />
					</button>
				</span>
				<span class="skill-status-hint">Applies to future replies</span>
			</div>
		{/if}
		{#if suggestion && !suggestionDismissed}
			<div class="skill-suggestion-banner">
				<div class="skill-suggestion-content">
					<Sparkles size={13} class="skill-suggestion-icon" aria-hidden="true" />
					<span class="skill-suggestion-text">
						Suggested skill: <strong>{suggestion.name}</strong>
					</span>
				</div>
				<div class="skill-suggestion-actions">
					<button
						type="button"
						class="skill-suggestion-apply"
						disabled={conversationLoading || skillSaving || toolsSaving || modelSaving}
						onclick={() => onapplysuggestion()}
					>
						Use skill
					</button>
					<button
						type="button"
						class="skill-suggestion-dismiss"
						aria-label="Dismiss skill suggestion"
						title="Dismiss suggestion"
						onclick={() => ondisksuggestion()}
					>
						<X size={13} />
					</button>
				</div>
			</div>
		{/if}
		{#if attachments.length}
			<div class="attachment-list" aria-label="Files to attach">
				{#each attachments as file, index (file.name + file.size + index)}
					<div
						class="attachment-chip pending-attachment"
						class:image-attachment={isImageFile(file)}
					>
						{#if isImageFile(file) && previewUrl(file)}
							<img class="attachment-thumb" src={previewUrl(file)} alt={file.name} />
						{:else}
							<Paperclip size={13} aria-hidden="true" />
						{/if}
						<span>{file.name}</span><small>{formatFileSize(file.size)}</small>
						<button
							type="button"
							class="remove-attachment"
							aria-label={`Remove ${file.name}`}
							title={`Remove ${file.name}`}
							onclick={() => onremoveattachment(index)}><X size={13} /></button
						>
					</div>
				{/each}
			</div>
		{/if}
		<textarea
			bind:value={message}
			aria-label="Message Mimin"
			placeholder={running
				? 'Prepare your next message...'
				: 'Ask Mimin to think, write, or plan...'}
			onkeydown={handleKeydown}
			onpaste={handlePaste}></textarea>
		<div class="composer-row">
			<div class="composer-tools">
				<input
					bind:this={fileInput}
					type="file"
					multiple
					accept={CHAT_ATTACHMENT_ACCEPT}
					hidden
					onchange={(event) => {
						if (onattach(event.currentTarget.files)) event.currentTarget.value = '';
					}}
				/>
				<Button
					variant="secondary"
					class="gap-1.5 bg-[var(--surface-subtle)] px-[9px] py-[7px] text-[var(--text-muted)] hover:border-[var(--text-faint)] hover:text-[var(--text-strong)] max-[760px]:px-[8px] max-[760px]:py-[5px] max-[560px]:px-[7px] max-[560px]:py-[4px]"
					title="Attach files or images"
					disabled={running || conversationLoading || skillSaving || toolsSaving || modelSaving}
					onclick={() => fileInput?.click()}><Paperclip size={15} /> File</Button
				>
				<ModelPicker
					{models}
					value={conversation?.model ?? ''}
					loading={modelsLoading}
					disabled={running ||
						!hasActiveId ||
						conversationLoading ||
						modelSaving ||
						skillSaving ||
						toolsSaving ||
						configuredModels.length === 0}
					placeholder={configuredModels.length
						? 'Pick a model'
						: modelLoadError
							? 'Models unavailable'
							: 'Configure a provider'}
					onselect={onselectmodel}
				/>
				<select
					class="control thinking-level-control"
					value={thinkingLevel}
					disabled={running ||
						conversationLoading ||
						thinkingSaving ||
						skillSaving ||
						toolsSaving ||
						modelSaving ||
						!hasActiveId ||
						!conversation?.model}
					aria-label="Thinking level"
					title="Thinking level"
					onchange={(event) => onselectthinkinglevel(event.currentTarget.value)}
				>
					{#each thinkingLevels as level (level)}
						<option value={level}>
							{level === 'off' ? 'Thinking off' : `${level[0].toUpperCase()}${level.slice(1)}`}
						</option>
					{/each}
				</select>
				<SkillPicker
					{skills}
					activeSkillId={conversation?.activeSkill?.id}
					loading={skillsLoading}
					disabled={running ||
						!hasActiveId ||
						conversationLoading ||
						skillSaving ||
						toolsSaving ||
						modelSaving}
					ontoggle={ontoggleskill}
				/>
				<ToolPicker
					{tools}
					enabledTools={conversation?.enabledTools ?? []}
					loading={toolsLoading}
					disabled={running ||
						!hasActiveId ||
						conversationLoading ||
						skillSaving ||
						toolsSaving ||
						modelSaving}
					ontoggle={ontoggletool}
				/>
			</div>
			<Button
				variant={running ? 'destructive' : 'default'}
				size="icon"
				class="ml-auto size-[38px] self-end rounded-lg max-[760px]:size-[34px]"
				disabled={!running && (conversationLoading || skillSaving || toolsSaving || modelSaving)}
				aria-label={running ? 'Stop generation' : 'Send message'}
				title={running ? 'Stop generation' : 'Send message'}
				onclick={() => (running ? onstop() : onsend())}
				>{#if running}<Square size={13} />{:else}<ArrowUp size={16} />{/if}</Button
			>
		</div>
	</div>
</div>

<style>
	.skill-status {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3) 0;
	}
	.skill-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 3px var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
	}
	.skill-badge :global(svg.skill-badge-icon) {
		color: var(--accent-fg);
		flex-shrink: 0;
	}
	.skill-badge-name {
		max-width: 200px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.skill-badge-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 1px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color var(--duration-short3) var(--ease-standard),
			background var(--duration-short3) var(--ease-standard);
	}
	.skill-badge-remove:hover:not(:disabled) {
		color: var(--danger-text, #ef4444);
		background: var(--surface-hover);
	}
	.skill-badge-remove:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.skill-status-hint {
		color: var(--text-faint);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.skill-suggestion-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: var(--space-2) var(--space-3) 0;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		color: var(--text);
	}
	.skill-suggestion-content {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}
	.skill-suggestion-banner :global(svg.skill-suggestion-icon) {
		color: var(--accent-fg);
		flex-shrink: 0;
	}
	.skill-suggestion-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.skill-suggestion-text strong {
		color: var(--text-strong);
		font-weight: 500;
	}
	.skill-suggestion-actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
	}
	.skill-suggestion-apply {
		padding: 2px var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text-strong);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
		font-weight: 500;
		cursor: pointer;
		transition:
			background var(--duration-short3) var(--ease-standard),
			border-color var(--duration-short3) var(--ease-standard);
	}
	.skill-suggestion-apply:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--text-faint);
	}
	.skill-suggestion-apply:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.skill-suggestion-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 3px;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: color var(--duration-short3) var(--ease-standard);
	}
	.skill-suggestion-dismiss:hover {
		color: var(--text-strong);
	}
	.attachment-list {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 10px;
	}
	.attachment-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		max-width: 100%;
		padding: 6px var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		color: var(--text-body);
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.attachment-chip span {
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.attachment-chip small {
		color: var(--text-faint);
		white-space: nowrap;
	}
	.image-attachment {
		padding: var(--space-1) var(--space-2) var(--space-1) 5px;
	}
	.attachment-thumb {
		display: block;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
		object-fit: cover;
		flex-shrink: 0;
	}
	.remove-attachment {
		display: grid;
		place-items: center;
		padding: 1px;
		border: 0;
		background: transparent;
		color: var(--text-muted);
	}
	.remove-attachment:hover {
		color: var(--danger-text);
	}
	.composer-container {
		position: sticky;
		bottom: 0;
		margin-top: auto;
		padding-top: var(--space-5);
		padding-bottom: 20px;
		background: linear-gradient(to top, var(--bg) 80%, transparent);
		z-index: 15;
	}
	.chat-composer {
		position: relative;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		padding: var(--space-3);
		box-shadow: 0 10px 28px var(--shadow-faint);
	}
	.chat-composer > .attachment-list {
		margin: 0 0 var(--space-2);
	}
	.chat-composer textarea {
		width: 100%;
		min-height: 45px;
		border: 0;
		resize: none;
		font-family: inherit;
		font-size: var(--text-body-lg);
		line-height: var(--text-body-lg--line-height);
		letter-spacing: var(--text-body-lg--letter-spacing);
		background: transparent;
	}
	.chat-composer textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.composer-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-2);
		border-top: 1px solid var(--border);
		padding-top: 10px;
	}
	.composer-tools {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		flex: 1 1 auto;
		min-width: 0;
	}
	.control {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface-subtle);
		padding: 7px 9px;
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		transition:
			color var(--duration-short4) var(--ease-standard),
			background var(--duration-short4) var(--ease-standard),
			border-color var(--duration-short4) var(--ease-standard);
	}
	/* Only the native `<select>` still uses this: the file-picker control next to it
	 * is the shared `Button`, styled to match. */
	.control:hover {
		color: var(--text-strong);
		border-color: var(--text-faint);
	}
	.thinking-level-control {
		max-width: 138px;
		cursor: pointer;
	}
	.thinking-level-control:disabled {
		opacity: 0.72;
		cursor: not-allowed;
	}
	@media (max-width: 760px) {
		.composer-row {
			gap: 6px;
			padding-top: var(--space-2);
		}
		.composer-tools {
			gap: 5px;
		}
		.control {
			min-height: 34px;
			padding: 5px var(--space-2);
		}
		.thinking-level-control {
			max-width: 110px;
		}
	}
	@media (max-width: 560px) {
		.control {
			min-height: 32px;
			padding: var(--space-1) 7px;
		}
		.thinking-level-control {
			max-width: 95px;
		}
	}
</style>
