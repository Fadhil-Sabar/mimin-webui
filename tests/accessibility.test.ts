import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('modal and picker keyboard accessibility', () => {
	it('uses native toggle buttons and prevents Space from double toggling tools', () => {
		const source = read('src/lib/components/ToolPicker.svelte');
		expect(source).toContain('aria-pressed={isEnabled}');
		expect(source).toContain("onkeydown={(event) => event.key === ' ' && event.preventDefault()}");
		expect(source).not.toContain('role="button"\n\t\t\t\t\t\t\ttabindex="0"');
	});

	it('uses native toggle buttons and prevents Space from double toggling skills', () => {
		const source = read('src/lib/components/SkillPicker.svelte');
		expect(source).toContain('aria-pressed={isEnabled}');
		expect(source).toContain("onkeydown={(event) => event.key === ' ' && event.preventDefault()}");
		expect(source).not.toContain('role="button"\n\t\t\t\t\t\t\ttabindex="0"');
	});

	it('provides reusable initial focus, trapping, and opener return for the create dialog', () => {
		const source = read('src/routes/projects/+page.svelte');
		expect(source).toContain('focusModalPrimary');
		expect(source).toContain('trapModalFocus');
		expect(source).toContain('createProjectTrigger?.focus()');
	});
});
