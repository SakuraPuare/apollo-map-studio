// protobufjs is a CJS module; Vite pre-bundles it and provides a synthetic default.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – CJS interop
import protobuf from 'protobufjs'

import type { Root, Type } from 'protobufjs'

// Cache loaded roots to avoid re-loading
const rootCache = new Map<string, Root>()

/**
 * Load a .proto file from /proto/ public directory.
 * Handles import resolution by fetching relative paths.
 */
export async function loadProtoRoot(protoFile: string): Promise<Root> {
  if (rootCache.has(protoFile)) {
    return rootCache.get(protoFile)!
  }

  // protobuf.Root is the constructor; use the runtime value directly.
  const RootCtor: typeof Root = protobuf.Root
  const root: Root = new RootCtor()

  // Override the fetch mechanism to resolve paths relative to /proto/
  root.resolvePath = (_origin: string, target: string) => {
    // Strip any leading path prefixes, just use the filename
    const fileName = target.split('/').pop() ?? target
    return `/proto/${fileName}`
  }

  await root.load(`/proto/${protoFile}`, { keepCase: false })
  root.resolveAll()

  rootCache.set(protoFile, root)
  return root
}

/**
 * Get the Map type from the map.proto
 */
export async function getMapType(): Promise<Type> {
  const root = await loadProtoRoot('map.proto')
  return root.lookupType('apollo.hdmap.Map')
}

/**
 * Get the Graph type from topo_graph.proto
 */
export async function getGraphType(): Promise<Type> {
  const root = await loadProtoRoot('topo_graph.proto')
  return root.lookupType('apollo.routing.Graph')
}
