<script lang="ts">
	import { resolve } from '$app/paths';
	import { Download, FileJson, FileText, LayoutTemplate } from '@lucide/svelte';
	import Topbar from '$lib/components/Topbar.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu/index.js';
	import type { Conversation } from './chat-types';

	type Props = {
		conversation?: Conversation | null;
		canvasOpen?: boolean;
		hasCanvas?: boolean;
		canvasLoading?: boolean;
		ontogglecanvas?: () => void;
	};

	let {
		conversation = null,
		canvasOpen = false,
		hasCanvas = false,
		canvasLoading = false,
		ontogglecanvas
	}: Props = $props();
</script>

<Topbar
	breadcrumbs={[{ label: 'Chat' }, { label: conversation?.title ?? 'New session' }]}
	separator="chevron-right"
>
	{#snippet actions()}
		{#if conversation}
			<DropdownMenu>
				<DropdownMenuTrigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant="outline"
							size="sm"
							class="px-[9px] text-[var(--text-muted)]"
							title="Export"
							aria-label="Export"
						>
							<Download size={15} />
						</Button>
					{/snippet}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem>
						{#snippet child({ props })}
							<a
								{...props}
								href={resolve('/api/conversations/[id]/export?format=markdown', {
									id: conversation.id
								})}
								download
							>
								<FileText size={15} />
								Markdown
							</a>
						{/snippet}
					</DropdownMenuItem>
					<DropdownMenuItem>
						{#snippet child({ props })}
							<a
								{...props}
								href={resolve('/api/conversations/[id]/export?format=json', {
									id: conversation.id
								})}
								download
							>
								<FileJson size={15} />
								JSON
							</a>
						{/snippet}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		{/if}
	{/snippet}
	{#snippet trailingActions()}
		{#if ontogglecanvas}
			<Button
				variant="outline"
				size="sm"
				class="relative gap-1.5 px-[10px] text-[var(--text-muted)] {canvasOpen
					? 'border-[var(--border-strong)] bg-[var(--surface-3)] text-[var(--text-strong)]'
					: ''}"
				disabled={canvasLoading}
				title={canvasOpen ? 'Close Canvas' : hasCanvas ? 'Open Canvas' : 'Create Canvas'}
				aria-label="Toggle Canvas"
				onclick={ontogglecanvas}
			>
				<LayoutTemplate size={16} />
				<span class="canvas-btn-text">{canvasLoading ? 'Loading…' : 'Canvas'}</span>
				{#if hasCanvas}<span class="canvas-active-dot"></span>{/if}
			</Button>
		{/if}
	{/snippet}
</Topbar>

<style>
	.canvas-active-dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--status-ok-dot);
	}

	@media (max-width: 560px) {
		.canvas-btn-text {
			display: none;
		}
	}
</style>
