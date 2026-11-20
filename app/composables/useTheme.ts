export type ThemeMode = 'dark' | 'light';

export function useTheme() {
  const theme = useCookie<ThemeMode>('cf_b2b_theme', {
    default: () => 'dark',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  const isDark = computed(() => theme.value !== 'light');

  function setTheme(mode: ThemeMode): void {
    theme.value = mode;
  }

  function toggleTheme(): void {
    theme.value = isDark.value ? 'light' : 'dark';
  }

  return {
    theme,
    isDark,
    setTheme,
    toggleTheme,
  };
}
