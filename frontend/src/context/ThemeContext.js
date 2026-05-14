import React, { createContext, useCallback, useEffect, useState, useContext } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkModeState] = useState(() => {
    try {
      return localStorage.getItem('dreamdwellTheme') === 'dark';
    } catch (_error) {
      return false;
    }
  });

  const setIsDarkMode = useCallback((value) => {
    setIsDarkModeState((current) => {
      const next = typeof value === 'function' ? value(current) : value;
      try {
        localStorage.setItem('dreamdwellTheme', next ? 'dark' : 'light');
      } catch (_error) {
        // Ignore storage failures; the UI should still update for this session.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem('dreamdwellInterfaceSettings') || '{}');
      document.documentElement.dataset.density = `${settings.density || 'Comfortable'}`.toLowerCase();
      document.documentElement.dataset.textSize = `${settings.textSize || 'Medium'}`.toLowerCase();
    } catch (_error) {
      document.documentElement.dataset.density = 'comfortable';
      document.documentElement.dataset.textSize = 'medium';
    }
  }, []);

  const themes = {
    dark: {
      /* PP Neue Montreal — Dark */
      bg: '#282E37',
      card: '#424A57',
      accent: '#C9D4EC',
      accentDim: '#687284',
      highlight: '#99A3B9',
      text: '#F2F5FA',
      orb: '#C9D4EC',
    },
    light: {
      /* Neue Montreal — Light */
      bg: '#CDCFDB',
      card: '#F1F2F6',
      accent: '#878D96',
      accentDim: '#A4A9B2',
      highlight: '#929AAE',
      text: '#111318',
      orb: '#98A2AF',
    }
  };

  const theme = isDarkMode ? themes.dark : themes.light;

  return (
    <ThemeContext.Provider value={{ isDarkMode, setIsDarkMode, theme }}>
      <div 
        data-theme={isDarkMode ? 'dark' : 'light'}
        style={{ 
          backgroundColor: theme.bg, 
          color: theme.text, 
          minHeight: '100vh', 
          transition: 'all 0.5s ease',
          fontFamily: "'Space Grotesk', sans-serif"
        }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
