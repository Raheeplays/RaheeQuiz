import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue } from 'firebase/database';
import { SKINS } from '../types';

interface ThemeContextType {
  isDark: boolean;
  setIsDark: (val: boolean) => void;
  soundEnabled: boolean;
  setSoundEnabled: (val: boolean) => void;
  activeSkin: keyof typeof SKINS;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme_dark');
    return saved ? JSON.parse(saved) : true; // Default dark
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('sound_enabled');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [activeSkin, setActiveSkin] = useState<keyof typeof SKINS>('rahee');

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
    const settingsRef = ref(db, 'settings/activeSkin');
    const unsub = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setActiveSkin(snapshot.val() as keyof typeof SKINS);
      }
    });
    return () => unsub();
  }, []);

  // Inject CSS variables for the skin
  useEffect(() => {
    const skin = SKINS[activeSkin] || SKINS['rahee'];
    document.documentElement.style.setProperty('--primary-color', skin.primary);
    document.documentElement.style.setProperty('--accent-color', skin.accent);
  }, [activeSkin]);

  return (
    <ThemeContext.Provider value={{ isDark, setIsDark, soundEnabled, setSoundEnabled, activeSkin }}>
      <div className={activeSkin}>
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
