import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import { h } from 'vue';
import PageContributors from './components/PageContributors.vue';
import GitHubRepoLink from './components/GitHubRepoLink.vue';
import './styles.css';

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'doc-after': () => h(PageContributors),
      'home-features-after': () => h(PageContributors, { home: true }),
    }),
  enhanceApp({ app }) {
    app.component('GitHubRepoLink', GitHubRepoLink);
  },
} satisfies Theme;
