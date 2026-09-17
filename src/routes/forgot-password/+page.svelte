<script lang="ts">
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/client/auth';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	let email = $state('');
	let error = $state('');
	let busy = $state(false);
	let sent = $state(false);

	async function submit() {
		error = '';
		const address = email.trim().toLowerCase();
		if (!address) {
			error = 'Enter the email address of your account.';
			return;
		}

		busy = true;
		try {
			const { error: requestError } = await authClient.requestPasswordReset({ email: address });
			if (requestError) {
				error = requestError.message ?? 'Could not request a reset link.';
				return;
			}
			sent = true;
		} catch {
			error = 'Could not reach the server. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Reset your password | Mimin WebUI</title></svelte:head>

<AuthShell
	title="Forgot your password?"
	subtitle="We can send a one-time link that lets you choose a new password."
>
	{#if sent}
		<div class="auth-notice" role="status">
			{#if data.mailConfigured}
				If that address belongs to an account, a reset link is on its way. The link expires in
				{data.expiresInMinutes} minutes and can be used once.
			{:else}
				If that address belongs to an account, a reset link has been created. This installation has
				no email delivery configured, so ask an administrator to hand you the link.
			{/if}
		</div>
	{:else}
		<form
			class="auth-form"
			aria-busy={busy}
			onsubmit={(event) => {
				event.preventDefault();
				submit();
			}}
		>
			<label
				>Email<input
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="email"
					disabled={busy}
				/></label
			>
			{#if error}<div class="auth-error" role="alert">{error}</div>{/if}
			<Button
				class="mt-[var(--space-1)] min-h-[44px] w-full"
				size="lg"
				type="submit"
				disabled={busy}>{busy ? 'Requesting...' : 'Request reset link'}</Button
			>
		</form>
	{/if}

	<p class="auth-links"><a href={resolve('/login')}>Back to sign in</a></p>
</AuthShell>
