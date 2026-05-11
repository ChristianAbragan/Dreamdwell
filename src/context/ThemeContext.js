import React, { createContext, useState, useContext } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

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
