import DefaultTheme from 'vitepress/theme';
import { NolebaseGitChangelogPlugin } from '@nolebase/vitepress-plugin-git-changelog/client';
import '@nolebase/vitepress-plugin-git-changelog/client/style.css';
import type { Theme } from 'vitepress';
import GitHubRepoLink from './components/GitHubRepoLink.vue';
import MermaidDiagram from './components/MermaidDiagram.vue';
import './styles.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.use(NolebaseGitChangelogPlugin);
    app.component('GitHubRepoLink', GitHubRepoLink);
    app.component('MermaidDiagram', MermaidDiagram);
  },
} satisfies Theme;
