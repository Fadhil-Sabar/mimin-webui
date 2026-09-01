<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
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
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email, password })
			});
			const data = await response.json().catch(() => null);
			if (!response.ok) {
				error = data?.error?.message ?? 'Could not sign in.';
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
<div class="auth-page">
	<div class="auth-theme-toggle"><ThemeToggle /></div>
	<div class="auth-card">
		<div class="brand">
			<span class="brand-mark"><Sparkles size={14} /></span><span>mimin</span><span
				class="brand-muted">/ workbench</span
			>
		</div>
		<h1>Welcome back</h1>
		<p class="subtitle">Sign in to your workspace.</p>
		<form
			aria-busy={busy}
			onsubmit={(e) => {
				e.preventDefault();
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
			{#if error}<div class="form-error" role="alert">{error}</div>{/if}
			<button class="submit" type="submit" disabled={busy}
				>{busy ? 'Signing in...' : 'Sign in'}</button
			>
		</form>
		<p class="hint">
			Default local account: <code>admin@mimin.local</code> / <code>admin123</code>
		</p>
	</div>
</div>

<style>
	.auth-page {
		min-height: 100vh;
		display: grid;
		place-items: center;
		background: var(--bg);
		padding: 24px;
	}
	.auth-theme-toggle {
		position: fixed;
		top: 24px;
		right: 24px;
	}
	.auth-card {
		width: 100%;
		max-width: 360px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		padding: 36px 30px;
		box-shadow: 0 12px 34px var(--shadow-soft);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-display);
		font-size: var(--text-lg);
		margin-bottom: 26px;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		width: 23px;
		height: 23px;
		color: var(--accent-fg);
		background: var(--accent-bg);
		border-radius: 7px;
	}
	.brand-muted {
		color: var(--brand-muted);
		font-weight: 500;
		margin-left: -4px;
	}
	h1 {
		margin: 0 0 5px;
		font-family: var(--font-display);
		font-size: var(--text-xl);
		line-height: 1.1;
		letter-spacing: -0.02em;
	}
	.subtitle {
		margin: 0 0 24px;
		color: var(--text-muted);
		font-size: var(--text-sm);
	}
	label {
		display: block;
		margin-bottom: 14px;
		font-size: var(--text-sm);
		font-weight: 550;
		color: var(--text-body);
	}
	input {
		display: block;
		width: 100%;
		margin-top: 6px;
		min-height: 44px;
		padding: 10px 11px;
		border: 1px solid var(--input-border);
		border-radius: 7px;
		font-size: var(--text-base);
		outline: 0;
		background: var(--surface-subtle);
	}
	input:focus {
		border-color: var(--text);
		background: var(--surface);
	}
	.form-error {
		background: color-mix(in srgb, var(--danger-text) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--danger-text) 45%, transparent);
		color: var(--danger-text);
		border-radius: 6px;
		padding: 9px 11px;
		font-size: var(--text-sm);
		line-height: 1.45;
	}
	.submit {
		width: 100%;
		min-height: 44px;
		padding: 11px;
		border: 0;
		border-radius: 7px;
		background: var(--accent-bg);
		color: var(--accent-fg);
		font-size: var(--text-base);
		font-weight: 550;
	}
	.submit:hover {
		background: var(--accent-bg-hover);
	}
	.submit:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.hint {
		margin: 18px 0 0;
		color: var(--text-dim);
		font-size: var(--text-xs);
		text-align: center;
	}
	.hint code {
		background: var(--surface-3);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1px 5px;
		color: var(--text-muted);
	}
</style>
