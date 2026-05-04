<template>
  <Teleport to="body">
    <div v-if="preview" class="ams-image-preview" role="dialog" aria-modal="true" @click="close">
      <button
        class="ams-image-preview__close"
        type="button"
        aria-label="Close preview"
        @click="close"
      >
        x
      </button>
      <figure class="ams-image-preview__figure" @click.stop>
        <img :src="preview.src" :alt="preview.alt" />
        <figcaption v-if="preview.caption">{{ preview.caption }}</figcaption>
      </figure>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface PreviewState {
  src: string;
  alt: string;
  caption: string;
}

const preview = ref<PreviewState | null>(null);

function isPreviewableImage(element: Element): element is HTMLImageElement {
  return (
    element instanceof HTMLImageElement &&
    Boolean(element.closest('.vp-doc')) &&
    !element.closest('a') &&
    !element.classList.contains('no-preview')
  );
}

function isPreviewableMermaidSvg(element: Element): element is SVGSVGElement {
  return (
    element instanceof SVGSVGElement &&
    Boolean(element.closest('.vp-doc .mermaid')) &&
    !element.classList.contains('no-preview')
  );
}

function svgToDataUrl(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const serialized = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
}

function openImage(image: HTMLImageElement) {
  const caption = image.getAttribute('title') ?? image.getAttribute('alt') ?? '';

  preview.value = {
    src: image.currentSrc || image.src,
    alt: image.alt || caption || 'Preview image',
    caption,
  };
}

function openSvg(svg: SVGSVGElement) {
  const label =
    svg.getAttribute('aria-label') ??
    svg.querySelector('title')?.textContent?.trim() ??
    'Mermaid diagram';

  preview.value = {
    src: svgToDataUrl(svg),
    alt: label,
    caption: label,
  };
}

function close() {
  preview.value = null;
}

function handleClick(event: MouseEvent) {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const image = target.closest('img');
  if (image && isPreviewableImage(image)) {
    openImage(image);
    return;
  }

  const svg = target.closest('svg');
  if (svg && isPreviewableMermaidSvg(svg)) {
    openSvg(svg);
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close();
  }
}

onMounted(() => {
  document.addEventListener('click', handleClick);
  document.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick);
  document.removeEventListener('keydown', handleKeydown);
});
</script>
