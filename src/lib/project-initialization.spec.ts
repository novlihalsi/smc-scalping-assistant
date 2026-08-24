import { describe, expect, it } from 'vitest';

import { buttonVariants } from '$lib/components/ui/button';
import { cn } from './utils';

describe('project initialization', () => {
	it('loads the shadcn-svelte utility and registry component', () => {
		expect(cn('px-2', 'px-4', { hidden: false })).toBe('px-4');
		expect(buttonVariants({ variant: 'outline', size: 'sm' })).toContain('border-border');
	});
});
