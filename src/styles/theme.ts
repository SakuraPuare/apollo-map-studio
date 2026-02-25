// VS Code-inspired design tokens

export const colors = {
  bgBase: '#1e1e1e',
  bgSidebar: '#252526',
  bgTitleBar: '#323233',
  bgActivityBar: '#333333',
  bgInput: '#3c3c3c',
  bgHover: '#2a2d2e',
  bgActive: '#37373d',
  bgDropdown: '#252526',

  border: '#3c3c3c',
  borderLight: '#4a4a4a',
  borderFocus: '#007acc',

  textPrimary: '#cccccc',
  textSecondary: '#858585',
  textBright: '#e0e0e0',
  textDisabled: '#5a5a5a',
  textInverse: '#ffffff',

  accent: '#007acc',
  accentHover: '#1177bb',
  accentActive: '#005fa3',

  danger: '#f14c4c',
  dangerBg: '#5a1d1d',
  warning: '#cca700',
  warningBg: '#4d3800',
  success: '#89d185',
  successBg: '#1e3a1e',
  info: '#3794ff',
  infoBg: '#1a3a5c',

  statusBarBg: '#007acc',
  statusBarBgEmpty: '#333333',
} as const

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const

export const typography = {
  fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  monoFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
  sizeXs: 11,
  sizeSm: 12,
  sizeBase: 13,
  sizeLg: 14,
  sizeXl: 16,
  weightNormal: 400,
  weightMedium: 500,
  weightSemibold: 600,
  lineHeight: 1.4,
} as const

export const radii = {
  sm: 3,
  md: 4,
  lg: 6,
  xl: 8,
} as const

export const shadows = {
  subtle: '0 1px 3px rgba(0,0,0,0.3)',
  medium: '0 4px 12px rgba(0,0,0,0.4)',
  large: '0 8px 24px rgba(0,0,0,0.5)',
  dialog: '0 12px 40px rgba(0,0,0,0.6)',
} as const

export const layout = {
  headerHeight: 48,
  toolbarWidth: 48,
  panelWidth: 300,
  statusBarHeight: 22,
  toolIconSize: 20,
  toolClickArea: 40,
  inputHeight: 28,
  dialogInputHeight: 32,
  buttonHeight: 32,
  dialogMaxWidth: 520,
} as const

export const transitions = {
  fast: '0.1s ease',
  normal: '0.15s ease',
  slow: '0.25s ease',
} as const
