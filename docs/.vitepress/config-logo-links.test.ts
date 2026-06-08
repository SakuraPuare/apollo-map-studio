import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserConfig } from 'vitepress';

type LocaleThemeConfig = {
  themeConfig: {
    logoLink: string;
  };
};

type DocsConfig = UserConfig & {
  locales: {
    root: LocaleThemeConfig;
    en: LocaleThemeConfig;
  };
};

const originalVitePressBase = process.env.VITEPRESS_BASE;

async function loadDocsConfigWithBase(vitePressBase: string | undefined): Promise<DocsConfig> {
  vi.resetModules();

  if (vitePressBase === undefined) {
    delete process.env.VITEPRESS_BASE;
  } else {
    process.env.VITEPRESS_BASE = vitePressBase;
  }

  const { default: config } = await import('./config');
  return config as DocsConfig;
}

afterEach(() => {
  vi.resetModules();

  if (originalVitePressBase === undefined) {
    delete process.env.VITEPRESS_BASE;
  } else {
    process.env.VITEPRESS_BASE = originalVitePressBase;
  }
});

describe('VitePress locale logo links', () => {
  it('fails docs builds on dead links', async () => {
    const config = await loadDocsConfigWithBase(undefined);

    expect(config.ignoreDeadLinks).toBe(false);
  });

  it.each([
    {
      name: 'default root deployment',
      vitePressBase: undefined,
      rootLogoLink: '/',
      englishLogoLink: '/en/',
    },
    {
      name: 'sub-path deployment with a trailing slash',
      vitePressBase: '/apollo-map-studio/',
      rootLogoLink: '/apollo-map-studio/',
      englishLogoLink: '/apollo-map-studio/en/',
    },
    {
      name: 'sub-path deployment without a trailing slash',
      vitePressBase: '/apollo-map-studio',
      rootLogoLink: '/apollo-map-studio/',
      englishLogoLink: '/apollo-map-studio/en/',
    },
  ])(
    'keeps locale logo links base-prefixed for $name',
    async ({ vitePressBase, rootLogoLink, englishLogoLink }) => {
      const config = await loadDocsConfigWithBase(vitePressBase);

      expect(config.locales.root.themeConfig.logoLink).toBe(rootLogoLink);
      expect(config.locales.en.themeConfig.logoLink).toBe(englishLogoLink);
    },
  );
});
