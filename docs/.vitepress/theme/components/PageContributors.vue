<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

type Contributor = {
  name: string;
  email: string;
  avatar: string;
  link?: string;
};

defineProps<{
  home?: boolean;
}>();

const { page, lang } = useData();

const contributors = computed(() => (page.value.contributors ?? []) as Contributor[]);
const labels = computed(() => {
  const isZh = lang.value.startsWith('zh');
  return {
    title: isZh ? '本页编辑者' : 'Page editors',
    empty: isZh ? '本页暂无 Git 提交者记录' : 'No Git editor history for this page',
  };
});
</script>

<template>
  <section
    class="ams-contributors"
    :class="{ 'is-home': home }"
    aria-labelledby="ams-contributors-title"
  >
    <p id="ams-contributors-title" class="ams-contributors__title">{{ labels.title }}</p>
    <div v-if="contributors.length" class="ams-contributors__list">
      <a
        v-for="contributor in contributors"
        :key="contributor.email"
        class="ams-contributors__item"
        :href="contributor.link"
        :title="contributor.email"
        target="_blank"
        rel="noreferrer noopener"
      >
        <img
          class="ams-contributors__avatar"
          :src="contributor.avatar"
          :alt="contributor.name"
          loading="lazy"
        />
        <span class="ams-contributors__name">{{ contributor.name }}</span>
      </a>
    </div>
    <p v-else class="ams-contributors__empty">{{ labels.empty }}</p>
  </section>
</template>
