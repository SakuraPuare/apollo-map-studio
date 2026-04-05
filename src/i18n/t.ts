import i18n from './index'

/** Module-level translator for non-React callers (event handlers, draw modes, etc.) */
export function t(key: string, params?: Record<string, string | number>): string {
  return i18n.t(key, params)
}
