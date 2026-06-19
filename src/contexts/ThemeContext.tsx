import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue } from 'firebase/database';
import { SKINS, Settings } from '../types';

interface ThemeContextType {
  isDark: boolean;
  setIsDark: (val: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  vibrationEnabled: boolean;
  setVibrationEnabled: (val: boolean) => void;
  activeSkin: keyof typeof SKINS;
  customization: Settings['customization'] | undefined;
  lastThemeChangedAt: number | null;
  layoutTheme: 'classic' | 'glass' | 'rahee-edition';
  setLayoutTheme: (theme: 'classic' | 'glass' | 'rahee-edition') => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [customization, setCustomization] = useState<Settings['customization']>();
  const [isDark, setIsDarkState] = useState(() => {
    const saved = localStorage.getItem('theme_dark');
    return saved ? JSON.parse(saved) : false; // Default light now as requested but can toggle
  });
  const [lastThemeChangedAt, setLastThemeChangedAt] = useState<number | null>(() => {
    const saved = localStorage.getItem('last_theme_changed_time');
    return saved ? Number(saved) : null;
  });

  const setIsDark = (val: boolean) => {
    setIsDarkState(val);
    const now = Date.now();
    setLastThemeChangedAt(now);
    localStorage.setItem('last_theme_changed_time', String(now));
  };

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('sound_enabled');
    return saved ? JSON.parse(saved) : true;
  });

  const [vibrationEnabled, setVibrationEnabled] = useState(() => {
    const saved = localStorage.getItem('vibration_enabled');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [activeSkin, setActiveSkin] = useState<keyof typeof SKINS>('rahee');

  const [layoutTheme, setLayoutThemeState] = useState<'classic' | 'glass' | 'rahee-edition'>(() => {
    const saved = localStorage.getItem('rahee_layout_theme');
    if (saved === 'cosmic' || saved === 'glass') return 'glass';
    if (saved === 'rahee-edition') return 'rahee-edition';
    return 'classic';
  });

  const setLayoutTheme = (theme: 'classic' | 'glass' | 'rahee-edition') => {
    setLayoutThemeState(theme);
    localStorage.setItem('rahee_layout_theme', theme);
  };

  useEffect(() => {
    // Remove any previous theme layout classes from DOM
    document.documentElement.classList.remove('theme-layout-classic', 'theme-layout-cyberpunk', 'theme-layout-warm', 'theme-layout-cosmic', 'theme-layout-glass', 'theme-layout-rahee-edition');
    document.body.classList.remove('theme-layout-classic', 'theme-layout-cyberpunk', 'theme-layout-warm', 'theme-layout-cosmic', 'theme-layout-glass', 'theme-layout-rahee-edition');

    // Add selected layout theme class
    document.documentElement.classList.add(`theme-layout-${layoutTheme}`);
    document.body.classList.add(`theme-layout-${layoutTheme}`);
  }, [layoutTheme]);

  useEffect(() => {
    const custRef = ref(db, 'settings/customization');
    const unsub = onValue(custRef, (s) => {
      if (s.exists()) {
        setCustomization(s.val());
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    localStorage.setItem('theme_dark', JSON.stringify(isDark));
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('sound_enabled', JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem('vibration_enabled', JSON.stringify(vibrationEnabled));
  }, [vibrationEnabled]);

  useEffect(() => {
    const settingsRef = ref(db, 'settings/activeSkin');
    const unsub = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setActiveSkin(snapshot.val() as keyof typeof SKINS);
      }
    });
    return () => unsub();
  }, []);

  // Inject CSS variables for the skin + customization overrides
  useEffect(() => {
    const skin = SKINS[activeSkin] || SKINS['rahee'];
    let p = customization?.primaryColor || skin.primary;
    let a = customization?.accentColor || skin.accent;
    
    // Theme-wise layout dynamic color override defaults
    if (layoutTheme === 'glass') {
      p = '#8b5cf6';
      a = '#ec4899';
    } else if (layoutTheme === 'rahee-edition') {
      p = '#02f2ff';
      a = '#ff00a0';
    }

    document.documentElement.style.setProperty('--primary-color', p);
    document.documentElement.style.setProperty('--accent-color', a);
  }, [activeSkin, customization, layoutTheme]);

  return (
    <ThemeContext.Provider value={{ 
      isDark, 
      setIsDark,
      soundEnabled, 
      setSoundEnabled, 
      vibrationEnabled, 
      setVibrationEnabled, 
      activeSkin,
      customization,
      lastThemeChangedAt,
      layoutTheme,
      setLayoutTheme
    }}>
      <div className={`${activeSkin} theme-layout-${layoutTheme} min-h-screen flex flex-col`}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
