<script setup lang="ts">
defineProps<{
  repo?: string;
}>();
</script>

<template>
  <a
    class="ams-repo-link"
    :href="repo ?? 'https://github.com/SakuraPuare/apollo-map-studio'"
    target="_blank"
    rel="noreferrer noopener"
  >
    <span aria-hidden="true">GitHub</span>
    <slot>apollo-map-studio</slot>
  </a>
</template>
