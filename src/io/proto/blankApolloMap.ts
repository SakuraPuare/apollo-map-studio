import type { ApolloMapBounds } from '@/store/apolloMapStore';

export function createBlankApolloMap(projString: string): Record<string, unknown> {
  return {
    header: {
      projection: {
        proj: projString,
      },
    },
  };
}

export function setApolloMapBounds(
  map: Record<string, unknown>,
  bounds: ApolloMapBounds | null,
): void {
  if (!bounds) return;

  const header = (map.header as Record<string, unknown> | undefined) ?? {};
  map.header = header;

  const [[left, bottom], [right, top]] = bounds;
  header.left = left;
  header.bottom = bottom;
  header.right = right;
  header.top = top;
}
