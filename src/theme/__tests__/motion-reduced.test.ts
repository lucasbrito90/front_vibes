import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guard: player visual polish disables infinite motion under reduced-motion.
 */
describe('motion.css — prefers-reduced-motion', () => {
  const css = readFileSync(resolve(__dirname, '../motion.css'), 'utf8');

  it('disables player ambient, drift, and preparing animations', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.player-bg--image');
    expect(css).toContain('.player-wrap--playing .player-ambient');
    expect(css).toContain('.player-control-btn--preparing');
    expect(css).toContain('.mini-player-dot--preparing');
    expect(css).toMatch(/\.player-bg[\s\S]*animation:\s*player-bg-enter\s+0\.001ms/);
  });
});
