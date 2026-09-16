import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('modal and picker keyboard accessibility', () => {
	it('constrains project search to the server query limit', () => {
		const source = read('src/routes/projects/[id]/ProjectSearch.svelte');
		expect(source).toContain('maxlength="200"');
	});

	it('consumes provider handoff on settings entry and recreates it only on save', () => {
		const source = read('src/routes/settings/+page.svelte');
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
			'Delete chat confirm': 'src/routes/chat/DeleteChatDialog.svelte',
			'Delete skill confirm': 'src/routes/skills/ConfirmDeleteDialog.svelte',
			'Delete project confirm': 'src/routes/projects/[id]/ProjectDialogs.svelte',
			'Create project dialog': 'src/routes/projects/+page.svelte',
			'Skill editor': 'src/routes/skills/SkillEditorModal.svelte',
			'Provider form': 'src/routes/settings/ProviderFormModal.svelte',
			'Connection editor': 'src/routes/settings/web-search/ConnectionEditorModal.svelte'
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
			const source = read('src/routes/skills/ConfirmDeleteDialog.svelte');
			expect(source).toContain('<AlertDialog.Action variant="destructive"');
			expect(source).toContain('<AlertDialog.Cancel variant="outline"');
			expect(source.match(/<AlertDialog\.(Action|Cancel)/g)).toHaveLength(3);
		});

		// All three project dialogs are gated by one derived value, so only one can open.
		it('keeps the project dialogs mutually exclusive', () => {
			const dialogs = read('src/routes/projects/[id]/ProjectDialogs.svelte');
			expect(
				dialogs.match(/open=\{openDialog === '(edit|delete-project|delete-file)'\}/g)
			).toHaveLength(3);
		});

		it('returns focus to the create-project opener', () => {
			const source = read('src/routes/projects/+page.svelte');
			expect(source).toContain('createProjectTrigger?.focus()');
		});
	});
});
