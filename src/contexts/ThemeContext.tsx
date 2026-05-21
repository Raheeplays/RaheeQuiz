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
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [customization, setCustomization] = useState<Settings['customization']>();
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('theme_dark');
    return saved ? JSON.parse(saved) : false; // Default light now as requested but can toggle
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('sound_enabled');
    return saved ? JSON.parse(saved) : true;
  });

  const [vibrationEnabled, setVibrationEnabled] = useState(() => {
    const saved = localStorage.getItem('vibration_enabled');
    return saved ? JSON.parse(saved) : true;
  });
  
  const [activeSkin, setActiveSkin] = useState<keyof typeof SKINS>('rahee');

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
    const p = customization?.primaryColor || skin.primary;
    const a = customization?.accentColor || skin.accent;
    
    document.documentElement.style.setProperty('--primary-color', p);
    document.documentElement.style.setProperty('--accent-color', a);
  }, [activeSkin, customization]);

  return (
    <ThemeContext.Provider value={{ 
      isDark, 
      setIsDark,
      soundEnabled, 
      setSoundEnabled, 
      vibrationEnabled, 
      setVibrationEnabled, 
      activeSkin,
      customization
    }}>
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
