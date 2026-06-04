import type { Theme } from './hooks/useTheme';

export interface AppTheme {
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  inputBg: string;
  navBg: string;
  navBorder: string;
}

const dark: AppTheme = {
  bg: '#0f1117',
  surface: '#161b27',
  surface2: '#1e2536',
  border: '#2a3347',
  text: '#e2e8f0',
  textMuted: '#94a3b8',
  inputBg: '#0f1117',
  navBg: '#161b27',
  navBorder: '#2a3347',
};

const light: AppTheme = {
  bg: '#f6f8fa',
  surface: '#ffffff',
  surface2: '#f0f2f5',
  border: '#d0d7de',
  text: '#1f2328',
  textMuted: '#636e7b',
  inputBg: '#ffffff',
  navBg: '#ffffff',
  navBorder: '#d0d7de',
};

export const themes: Record<Theme, AppTheme> = { dark, light };
export function getTheme(t: Theme): AppTheme { return themes[t]; }
