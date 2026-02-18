---
layout: home

hero:
  name: Apollo Map Studio
  text: Browser-based HD Map Editor
  tagline: Draw lanes, junctions, and signals visually. Export Apollo-compatible base_map.bin, sim_map.bin, and routing_map.bin — no C++ toolchain required.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Architecture
      link: /architecture/overview

features:
  - icon: 🗺️
    title: Full Apollo Element Support
    details: Draw lanes, junctions, crosswalks, signals, stop signs, speed bumps, clear areas, and parking spaces. All elements serialize to valid Apollo protobuf.

  - icon: 📐
    title: Real-time Geometry
    details: Lane boundaries are computed instantly using turf.js offset. Width, boundary type, and style update live as you edit properties.

  - icon: 📦
    title: Accurate Binary Export
    details: Produces all three Apollo .bin files. The sim_map downsampler and routing graph cost formulas are direct ports of the Apollo C++ source.

  - icon: 🔄
    title: Round-trip Import
    details: Load an existing base_map.bin, edit it, and re-export. The decoder restores all lane topology, geometry, and element relationships.

  - icon: ↩️
    title: Undo / Redo
    details: Full edit history powered by Zustand temporal middleware. Every map mutation is reversible.

  - icon: 📡
    title: Offline First
    details: Runs entirely in the browser. No tile server, no backend, no network required after the initial page load.
---
