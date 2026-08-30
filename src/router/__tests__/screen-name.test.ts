import { describe, it, expect } from 'vitest';
import { routeTemplateToScreenName } from '@/router/screen-name';

describe('routeTemplateToScreenName', () => {
  it('never leaks a dynamic :id segment when it is the last path segment', () => {
    // Regression test: routes like "devices/:id" previously fell back to
    // to.path (the *resolved* URL, e.g. "/devices/42"), producing a span
    // name literally containing the ID ("screen.42Page") — a cardinality
    // explosion in Tempo. The fallback must read the route *template*
    // instead, where ":id" is still a literal placeholder, not a value.
    expect(routeTemplateToScreenName([{ path: 'devices/:id' }])).toBe('DevicesPage');
    expect(routeTemplateToScreenName([{ path: 'presets/:id' }])).toBe('PresetsPage');
    expect(routeTemplateToScreenName([{ path: 'devices/providers/:id' }])).toBe('ProvidersPage');
  });

  it('derives a PascalCase name from a static kebab-case segment', () => {
    expect(routeTemplateToScreenName([{ path: 'schedules/new' }])).toBe('NewPage');
    expect(routeTemplateToScreenName([{ path: 'sign-in' }])).toBe('SignInPage');
  });

  it('uses the last matched route in a nested route stack', () => {
    expect(
      routeTemplateToScreenName([{ path: '/' }, { path: 'vibes/:id/edit' }]),
    ).toBe('EditPage');
  });

  it('falls back to "RootPage" for an empty/root template', () => {
    expect(routeTemplateToScreenName([{ path: '' }])).toBe('RootPage');
  });

  it('falls back to "UnknownPage" when no route matched', () => {
    expect(routeTemplateToScreenName([])).toBe('UnknownPage');
  });
});
