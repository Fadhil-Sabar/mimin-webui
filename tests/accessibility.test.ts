import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('modal and picker keyboard accessibility', () => {
	it('constrains project search to the server query limit', () => {
		const source = read('src/routes/(app)/projects/[id]/ProjectSearch.svelte');
		expect(source).toContain('maxlength="200"');
	});

	it('consumes provider handoff on settings entry and recreates it only on save', () => {
		const source = read('src/routes/(app)/settings/+page.svelte');
		expect(source).toContain('consumeNavigationHandoff');
		expect(source).toContain('createNavigationHandoff');
		expect(source).toContain(
			'createNavigationHandoff({ prompt: returnPrompt, returnTo: returnTarget })'
		);
	});

	it('uses native toggle buttons and prevents Space from double toggling tools', () => {
		const source = read('src/lib/components/ToolPicker.svelte');
		expect(source).toContain('aria-pressed={isEnabled}');
		expect(source).toContain('aria-modal="true"');
		expect(source).toContain('trapFocus');
		expect(source).toContain("onkeydown={(event) => event.key === ' ' && event.preventDefault()}");
		expect(source).not.toContain('role="button"\n\t\t\t\t\t\t\ttabindex="0"');
	});

	it('uses native toggle buttons and prevents Space from double toggling skills', () => {
		const source = read('src/lib/components/SkillPicker.svelte');
		expect(source).toContain('aria-pressed={isEnabled}');
		expect(source).toContain('aria-modal="true"');
		expect(source).toContain('trapFocus');
		expect(source).toContain("onkeydown={(event) => event.key === ' ' && event.preventDefault()}");
		expect(source).not.toContain('role="button"\n\t\t\t\t\t\t\ttabindex="0"');
	});

	// These dialogs are now shadcn primitives, so their behaviour (real
	// role="alertdialog", focus trap, focus restore, Escape/outside dismissal) is
	// supplied by bits-ui and verified in the browser rather than by unit test.
	// What we still own, and therefore assert, is the wiring: no hand-rolled shell
	// creeping back in, and no reliance on the deleted focus helpers.
	describe('shadcn dialog wiring', () => {
		const migrated = {
			'Shared confirm dialog': 'src/lib/components/ConfirmDialog.svelte',
			'Delete project confirm': 'src/routes/(app)/projects/[id]/ProjectDialogs.svelte',
			'Create project dialog': 'src/routes/(app)/projects/+page.svelte',
			'Skill editor': 'src/routes/(app)/skills/SkillEditorModal.svelte',
			'Provider form': 'src/routes/(app)/settings/ProviderFormModal.svelte',
			'Connection editor': 'src/routes/(app)/settings/web-search/ConnectionEditorModal.svelte'
		};

		for (const [name, path] of Object.entries(migrated)) {
			it(`${name} uses the shared primitives and no hand-rolled shell`, () => {
				const source = read(path);
				expect(source).not.toContain('modal-backdrop');
				expect(source).not.toContain('trapModalFocus');
				expect(source).not.toContain('focusModalPrimary');
				expect(source).not.toContain("from './skills-focus'");
				expect(source).toMatch(/\$lib\/components\/ui\/(alert-)?dialog\/index\.js/);
			});
		}

		// AlertDialog.Action/Cancel already apply buttonVariants, so a nested <Button>
		// has its variant overwritten via {...props} (tailwind-merge keeps the default).
		it('passes variants to the alert dialog actions instead of nesting a Button', () => {
			const source = read('src/lib/components/ConfirmDialog.svelte');
			expect(source).toContain("variant={destructive ? 'destructive' : 'default'}");
			expect(source).toContain('<AlertDialog.Cancel variant="outline"');
			expect(source.match(/<AlertDialog\.(Action|Cancel)/g)).toHaveLength(3);
		});

		// Every delete confirmation goes through ConfirmDialog, so the "don't close
		// while loading" dance exists once instead of four times.
		it('routes every delete confirmation through the shared ConfirmDialog', () => {
			for (const file of [
				'src/lib/components/RecentChats.svelte',
				'src/routes/(app)/chat/+page.svelte',
				'src/routes/(app)/skills/+page.svelte',
				'src/routes/(app)/projects/[id]/ProjectDialogs.svelte'
			]) {
				const source = read(file);
				expect(source, file).toContain('$lib/components/ConfirmDialog.svelte');
				expect(source, file).not.toContain('deleteViaAction');
			}
		});

		// All three project dialogs are gated by one derived value, so only one can open.
		it('keeps the project dialogs mutually exclusive', () => {
			const dialogs = read('src/routes/(app)/projects/[id]/ProjectDialogs.svelte');
			expect(
				dialogs.match(/open=\{openDialog === '(edit|delete-project|delete-file)'\}/g)
			).toHaveLength(3);
		});

		it('returns focus to the create-project opener', () => {
			const source = read('src/routes/(app)/projects/+page.svelte');
			expect(source).toContain('createProjectTrigger?.focus()');
		});
	});

	// The app shell used to be copy-pasted into every authenticated route. It now
	// lives in one component, and the sidebar's active item is derived from the URL
	// rather than hard-coded per page.
	describe('shared app shell', () => {
		it('keeps the app-shell grid and the sidebar markup in exactly one place', () => {
			const shell = read('src/lib/components/AppShell.svelte');
			expect(shell).toContain('class="app-shell"');

			const sidebar = read('src/lib/components/AppSidebar.svelte');
			expect(sidebar).toContain('class="sidebar"');
		});

		for (const file of [
			'src/routes/(app)/chat/+page.svelte',
			'src/routes/(app)/+page.svelte',
			'src/routes/(app)/projects/+page.svelte',
			'src/routes/(app)/projects/[id]/+page.svelte',
			'src/routes/(app)/settings/+page.svelte',
			'src/routes/(app)/settings/instructions/+page.svelte',
			'src/routes/(app)/settings/web-search/+page.svelte',
			'src/routes/(app)/settings/browser-extension/+page.svelte',
			'src/routes/(app)/settings/preferences/+page.svelte',
			'src/routes/(app)/skills/+page.svelte',
			'src/routes/(app)/admin/users/+page.svelte'
		]) {
			it(`${file} delegates to the shared shell`, () => {
				const source = read(file);
				expect(source, file).not.toContain('class="app-shell"');
				expect(source, file).not.toContain('<aside class="sidebar">');
				expect(source, file).not.toContain('class="nav-item active"');
			});
		}
	});

	describe('toasts and badges', () => {
		// Toasts were hand-rolled eight times over; Sonner replaces all of them.
		it('mounts the Sonner toaster exactly once and keeps no hand-rolled toast', () => {
			const layout = read('src/routes/+layout.svelte');
			expect(layout.match(/<Toaster \/>/g)).toHaveLength(1);

			const svelteFiles = [
				'src/routes/(app)/+page.svelte',
				'src/routes/(app)/chat/+page.svelte',
				'src/routes/(app)/projects/+page.svelte',
				'src/routes/(app)/projects/[id]/+page.svelte',
				'src/routes/(app)/settings/+page.svelte',
				'src/routes/(app)/skills/+page.svelte',
				'src/lib/components/RecentChats.svelte'
			];
			for (const file of svelteFiles) {
				const source = read(file);
				expect(source, file).not.toContain('class="toast"');
				expect(source, file).not.toContain('setLocalStatus');
				expect(source, `${file} should use svelte-sonner`).toContain("from 'svelte-sonner'");
			}
		});

		// `.badge` was defined in only two of the four files that used it, so six
		// badges rendered completely unstyled. Badge replaces the class outright.
		it('keeps the status pills on the Badge component', () => {
			for (const file of [
				'src/routes/(app)/settings/ProviderCard.svelte',
				'src/routes/(app)/settings/web-search/ConnectionCard.svelte',
				'src/routes/(app)/settings/web-search/StatusOverview.svelte',
				'src/routes/(app)/settings/browser-extension/+page.svelte'
			]) {
				const source = read(file);
				expect(source, file).not.toContain('class="badge');
				expect(source, file).not.toMatch(/^\s*\.badge\s*\{/m);
				expect(source, `${file} should use the Badge component`).toContain(
					'$lib/components/ui/badge/index.js'
				);
			}
		});
	});
});
