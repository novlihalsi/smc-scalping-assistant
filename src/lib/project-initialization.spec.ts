import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('project initialization', () => {
	it('merges utility classes through the shadcn-svelte helper', () => {
		expect(cn('px-2', 'px-4', { hidden: false })).toBe('px-4');
	});
});
