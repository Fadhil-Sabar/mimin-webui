<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { authClient } from '$lib/client/auth';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	const MIN_PASSWORD_LENGTH = 8;

	let token = $derived(page.url.searchParams.get('token') ?? '');
	let callbackError = $derived(page.url.searchParams.get('error') ?? '');

	let password = $state('');
	let confirmation = $state('');
	let error = $state('');
	let busy = $state(false);
	let done = $state(false);

	let linkProblem = $derived(
		callbackError
			? 'This reset link is invalid or has expired. Request a new one to continue.'
			: token
				? ''
				: 'This page needs the link from your password reset email.'
	);

	async function submit() {
		error = '';
		if (password.length < MIN_PASSWORD_LENGTH) {
			error = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
			return;
		}
		if (password !== confirmation) {
			error = 'The two passwords do not match.';
			return;
		}

		busy = true;
		try {
			const { error: resetError } = await authClient.resetPassword({
				newPassword: password,
				token
			});
			if (resetError) {
				error =
					resetError.message ?? 'This reset link is invalid or has expired. Request a new one.';
				return;
			}
			done = true;
		} catch {
			error = 'Could not reach the server. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>Choose a new password | Mimin WebUI</title></svelte:head>

<AuthShell title="Choose a new password" subtitle="Pick something you have not used here before.">
	{#if done}
		<div class="auth-notice" role="status">
			Your password has been changed and every existing session was signed out. Sign in again with
			the new password.
		</div>
		<p class="auth-links"><a href={resolve('/login')}>Sign in</a></p>
	{:else if linkProblem}
		<div class="auth-error" role="alert">{linkProblem}</div>
		<p class="auth-links"><a href={resolve('/forgot-password')}>Request a new link</a></p>
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
				>New password<input
					type="password"
					bind:value={password}
					placeholder="••••••••"
					autocomplete="new-password"
					minlength={MIN_PASSWORD_LENGTH}
					disabled={busy}
				/></label
			>
			<label
				>Confirm password<input
					type="password"
					bind:value={confirmation}
					placeholder="••••••••"
					autocomplete="new-password"
					minlength={MIN_PASSWORD_LENGTH}
					disabled={busy}
				/></label
			>
			{#if error}<div class="auth-error" role="alert">{error}</div>{/if}
			<Button
				class="mt-[var(--space-1)] min-h-[44px] w-full"
				size="lg"
				type="submit"
				disabled={busy}>{busy ? 'Saving...' : 'Set new password'}</Button
			>
		</form>
		<p class="auth-links"><a href={resolve('/login')}>Back to sign in</a></p>
	{/if}
</AuthShell>
