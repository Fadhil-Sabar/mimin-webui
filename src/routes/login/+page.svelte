<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { authClient } from '$lib/client/auth';
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit() {
		error = '';
		if (!email.trim() || !password) {
			error = 'Email and password are required.';
			return;
		}
		busy = true;
		try {
			const { error: signInError } = await authClient.signIn.email({
				email: email.trim().toLowerCase(),
				password
			});
			if (signInError) {
				error = signInError.message ?? 'Could not sign in.';
				return;
			}
			window.location.href = '/';
		} catch {
			error = 'Could not reach the server.';
		} finally {
			busy = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			submit();
		}
	}
</script>

<svelte:head><title>Sign in | Mimin WebUI</title></svelte:head>

<AuthShell title="Welcome back" subtitle="Sign in to your workspace.">
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
			/></label
		>
		<label
			>Password<input
				type="password"
				bind:value={password}
				placeholder="••••••••"
				autocomplete="current-password"
				onkeydown={onKeydown}
			/></label
		>
		{#if error}<div class="auth-error" role="alert">{error}</div>{/if}
		<Button class="mt-[var(--space-1)] min-h-[44px] w-full" size="lg" type="submit" disabled={busy}
			>{busy ? 'Signing in...' : 'Sign in'}</Button
		>
	</form>
	<p class="auth-links"><a href={resolve('/forgot-password')}>Forgot your password?</a></p>
	<p class="auth-hint">
		Initial local account: <code>admin@mimin.local</code>. The password is configured with
		<code>SEED_PASSWORD</code> during bootstrap.
	</p>
</AuthShell>
