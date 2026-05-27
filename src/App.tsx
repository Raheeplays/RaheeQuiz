import React, { useState, useEffect } from 'react';
import { UserProvider, useUser } from './contexts/UserContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { DialogProvider } from './contexts/DialogContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Splash from './components/Splash';
import Auth from './components/Auth';
import WaitingRoom from './components/WaitingRoom';
import MainMenu from './components/MainMenu';
import NotificationManager from './components/NotificationManager';
import UpdateBlocker from './components/UpdateBlocker';
import { AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { db } from './firebase/config';
import { ref, onValue } from 'firebase/database';
import { bgm } from './services/bgmService';

function AppContent() {
  const { currentUser, loading, settings } = useUser();
  const { isDark, setIsDark } = useTheme();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Resume background music on first user interaction (browser restriction bypass)
  useEffect(() => {
    const handleInteraction = () => {
      bgm.resumeOnInteraction();
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  // Sync background music playback status based on loaded user preferences
  useEffect(() => {
    if (!currentUser) {
      bgm.stop();
      return;
    }
    const globalBgm = settings?.bgmEnabled !== false;
    const userBgm = currentUser?.bgmEnabled !== false;
    const activePreset = currentUser?.bgmPreset || settings?.bgmPreset || 'synth';
    
    const mix = {
      synth: currentUser?.bgmVolumeSynth !== undefined ? currentUser.bgmVolumeSynth : (settings?.bgmVolumeSynth !== undefined ? settings.bgmVolumeSynth : 0.7),
      flute: currentUser?.bgmVolumeFlute !== undefined ? currentUser.bgmVolumeFlute : (settings?.bgmVolumeFlute !== undefined ? settings.bgmVolumeFlute : 0.4),
      piano: currentUser?.bgmVolumePiano !== undefined ? currentUser.bgmVolumePiano : (settings?.bgmVolumePiano !== undefined ? settings.bgmVolumePiano : 0.5),
      guitar: currentUser?.bgmVolumeGuitar !== undefined ? currentUser.bgmVolumeGuitar : (settings?.bgmVolumeGuitar !== undefined ? settings.bgmVolumeGuitar : 0.5),
      violin: currentUser?.bgmVolumeViolin !== undefined ? currentUser.bgmVolumeViolin : (settings?.bgmVolumeViolin !== undefined ? settings.bgmVolumeViolin : 0.4),
      harp: currentUser?.bgmVolumeHarp !== undefined ? currentUser.bgmVolumeHarp : (settings?.bgmVolumeHarp !== undefined ? settings.bgmVolumeHarp : 0.4),
      beats: currentUser?.bgmVolumeBeats !== undefined ? currentUser.bgmVolumeBeats : (settings?.bgmVolumeBeats !== undefined ? settings.bgmVolumeBeats : 0.25),
      bpm: currentUser?.bgmBpm !== undefined ? currentUser.bgmBpm : (settings?.bgmBpm !== undefined ? settings.bgmBpm : 95),
      midiPresetName: currentUser?.midiPresetName || settings?.midiPresetName || 'satie',
      midiUrlSynth: currentUser?.midiUrlSynth || settings?.midiUrlSynth || '',
      midiUrlFlute: currentUser?.midiUrlFlute || settings?.midiUrlFlute || '',
      midiUrlPiano: currentUser?.midiUrlPiano || settings?.midiUrlPiano || '',
      midiUrlGuitar: currentUser?.midiUrlGuitar || settings?.midiUrlGuitar || '',
      midiUrlViolin: currentUser?.midiUrlViolin || settings?.midiUrlViolin || '',
      midiUrlHarp: currentUser?.midiUrlHarp || settings?.midiUrlHarp || '',
    };

    bgm.updateState(globalBgm, userBgm, activePreset, settings?.bgmUrl, mix);
  }, [
    currentUser?.bgmEnabled, 
    currentUser?.bgmPreset, 
    currentUser?.bgmVolumeSynth,
    currentUser?.bgmVolumeFlute,
    currentUser?.bgmVolumePiano,
    currentUser?.bgmVolumeGuitar,
    currentUser?.bgmVolumeViolin,
    currentUser?.bgmVolumeHarp,
    currentUser?.bgmVolumeBeats,
    currentUser?.bgmBpm,
    currentUser?.midiPresetName,
    currentUser?.midiUrlSynth,
    currentUser?.midiUrlFlute,
    currentUser?.midiUrlPiano,
    currentUser?.midiUrlGuitar,
    currentUser?.midiUrlViolin,
    currentUser?.midiUrlHarp,
    settings?.bgmEnabled, 
    settings?.bgmPreset, 
    settings?.bgmUrl, 
    settings?.bgmVolumeSynth,
    settings?.bgmVolumeFlute,
    settings?.bgmVolumePiano,
    settings?.bgmVolumeGuitar,
    settings?.bgmVolumeViolin,
    settings?.bgmVolumeHarp,
    settings?.bgmVolumeBeats,
    settings?.bgmBpm,
    settings?.midiPresetName,
    settings?.midiUrlSynth,
    settings?.midiUrlFlute,
    settings?.midiUrlPiano,
    settings?.midiUrlGuitar,
    settings?.midiUrlViolin,
    settings?.midiUrlHarp,
    currentUser
  ]);

  // Ambient automatic light sensor theme mode subscription
  useEffect(() => {
    if (!currentUser || !currentUser.ambientModeEnabled || !currentUser.deviceUid) {
      return;
    }

    const deviceUid = currentUser.deviceUid;
    const sensorRef = ref(db, `UserDevices/${deviceUid}/Sensors/Light_Sensor_Live_Data`);
    
    const unsubscribe = onValue(sensorRef, (snapshot) => {
      if (snapshot.exists()) {
        const rawVal = snapshot.val();
        const lux = parseFloat(String(rawVal).replace(/[^\d.-]/g, ''));
        if (isNaN(lux)) return;
        
        // Determine the threshold: user-defined, then global-defined, else fallback to 0 (must be set by admin)
        const userThreshold = currentUser.ambientThreshold;
        const globalThreshold = settings?.ambientThreshold;
        const threshold = userThreshold !== undefined ? userThreshold : (globalThreshold !== undefined ? globalThreshold : 0);
        
        // If live lux < threshold, dark mode is applied. If >= threshold, light mode is applied
        const shouldBeDark = lux < threshold;
        setIsDark(shouldBeDark);
      }
    });

    return () => unsubscribe();
  }, [currentUser?.ambientModeEnabled, currentUser?.deviceUid, currentUser?.ambientThreshold, settings?.ambientThreshold, setIsDark]);

  if (showSplash) {
    return <Splash />;
  }

  const containerClass = cn(
    "min-h-screen transition-colors duration-300 font-sans selection:bg-primary selection:text-black",
    isDark ? "dark bg-black text-white" : "bg-white text-black"
  );

  return (
    <div className={containerClass}>
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : !currentUser ? (
        <Auth />
      ) : currentUser.status === 'pending' ? (
        <WaitingRoom />
      ) : (
        <UpdateBlocker>
          <NotificationManager />
          <MainMenu />
        </UpdateBlocker>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <DialogProvider>
        <UserProvider>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </UserProvider>
      </DialogProvider>
    </ThemeProvider>
  );
}
