<script lang="ts">
	import { modelId } from './chat-format';
	import type { Conversation } from './chat-types';

	type Props = {
		conversation?: Conversation | null;
		running?: boolean;
		activity?: string;
	};

	let { conversation = null, running = false, activity = '' }: Props = $props();
</script>

<div class="chat-title">
	<span class="ready" class:working={running}>
		<i></i>
		{running ? (activity ? `working · ${activity.toLowerCase()}` : 'working') : 'ready'}
	</span>
	<h1>{conversation?.title ?? 'New conversation'}</h1>
	<p>
		{conversation?.model ? modelId(conversation.model) : 'Pick a model'}{conversation &&
		conversation.enabledTools?.length
			? ` · ${conversation.enabledTools.join(', ')}`
			: ''}
	</p>
</div>

<style>
	.chat-title {
		padding: 24px 44px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.chat-title h1 {
		font-family: var(--font-body);
		font-size: var(--text-headline-sm);
		line-height: var(--text-headline-sm--line-height);
		letter-spacing: var(--text-headline-sm--letter-spacing);
		font-weight: 500;
		color: var(--text-strong);
		margin: 8px 0 4px;
	}
	.chat-title p {
		color: var(--text-muted);
		font-size: var(--text-body-md);
		line-height: var(--text-body-md--line-height);
		letter-spacing: var(--text-body-md--letter-spacing);
		margin: 0;
	}
	.ready {
		float: right;
		color: var(--status-ok-text);
		border: 1px solid color-mix(in srgb, var(--status-ok-dot) 35%, transparent);
		padding: 4px 7px;
		border-radius: 5px;
		font-size: var(--text-body-sm);
		line-height: var(--text-body-sm--line-height);
		letter-spacing: var(--text-body-sm--letter-spacing);
	}
	.ready i {
		display: inline-block;
		width: 6px;
		height: 6px;
		background: var(--status-ok-dot);
		border-radius: 50%;
		margin-right: 4px;
	}
	.ready.working {
		color: var(--status-working-text);
		border-color: color-mix(in srgb, var(--status-working-dot) 40%, transparent);
	}
	@media (max-width: 760px) {
		.chat-title {
			padding: 20px 16px;
		}
		.ready {
			float: none;
			display: inline-flex;
		}
	}
	@media (max-width: 420px) {
		.chat-title {
			padding-inline: 14px;
		}
	}
</style>
