<script lang="ts">
	import { Sparkles } from '@lucide/svelte';
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
	<div class="auth-card">
		<div class="brand">
			<span class="brand-mark"><Sparkles size={14} /></span><span>solace</span><span
				class="brand-muted">/ agent</span
			>
		</div>
		<h1>Welcome back</h1>
		<p class="subtitle">Sign in to your workspace.</p>
		<form
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
			{#if error}<div class="form-error">{error}</div>{/if}
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
		background: #fafaf9;
		padding: 24px;
	}
	.auth-card {
		width: 100%;
		max-width: 360px;
		background: white;
		border: 1px solid #e2e2dd;
		border-radius: 12px;
		padding: 34px 30px;
		box-shadow: 0 12px 34px #0000000a;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.045em;
		margin-bottom: 26px;
	}
	.brand-mark {
		display: grid;
		place-items: center;
		width: 23px;
		height: 23px;
		color: white;
		background: #181818;
		border-radius: 7px;
	}
	.brand-muted {
		color: #a0a09a;
		font-weight: 500;
		margin-left: -4px;
	}
	h1 {
		margin: 0 0 5px;
		font-size: 24px;
		letter-spacing: -0.05em;
	}
	.subtitle {
		margin: 0 0 24px;
		color: #888;
		font-size: 13px;
	}
	label {
		display: block;
		margin-bottom: 14px;
		font-size: 12px;
		font-weight: 550;
		color: #555;
	}
	input {
		display: block;
		width: 100%;
		margin-top: 6px;
		padding: 10px 11px;
		border: 1px solid #d5d5d1;
		border-radius: 7px;
		font-size: 14px;
		outline: 0;
		background: #fdfdfc;
	}
	input:focus {
		border-color: #181818;
		background: white;
	}
	.form-error {
		background: #fdf3f2;
		border: 1px solid #f0cfcb;
		color: #8d2f26;
		border-radius: 6px;
		padding: 9px 11px;
		font-size: 12px;
		margin-bottom: 14px;
	}
	.submit {
		width: 100%;
		padding: 11px;
		border: 0;
		border-radius: 7px;
		background: #181818;
		color: white;
		font-size: 14px;
		font-weight: 550;
	}
	.submit:hover {
		background: #3a3a3a;
	}
	.submit:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.hint {
		margin: 18px 0 0;
		color: #999;
		font-size: 11px;
		text-align: center;
	}
	.hint code {
		background: #f3f3f0;
		border: 1px solid #e3e3df;
		border-radius: 4px;
		padding: 1px 5px;
		color: #666;
	}
</style>
