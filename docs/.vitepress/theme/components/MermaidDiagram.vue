<template>
  <div ref="container" class="mermaid" v-html="svg"></div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import mermaid from 'mermaid';

const props = defineProps<{
  code: string;
}>();

const container = ref<HTMLElement | null>(null);
const svg = ref('');

const renderDiagram = async () => {
  await nextTick();
  const id = `mermaid-${Math.random().toString(36).slice(2)}`;
  const result = await mermaid.render(
    id,
    decodeURIComponent(props.code),
    container.value ?? undefined,
  );
  svg.value = result.svg;
};

onMounted(async () => {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
  });

  await renderDiagram();

  const observer = new MutationObserver(async () => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
    });
    await renderDiagram();
  });

  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

watch(() => props.code, renderDiagram);
</script>
