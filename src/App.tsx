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
import { AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

function AppContent() {
  const { currentUser, loading } = useUser();
  const { isDark } = useTheme();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (showSplash) {
    return <Splash />;
  }

  const containerClass = cn(
    "min-h-screen transition-colors duration-300 font-sans selection:bg-primary selection:text-black",
    isDark ? "dark bg-black text-white" : "bg-white text-black"
  );

  if (loading) {
    return (
      <div className={containerClass}>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={containerClass}>
        <Auth />
      </div>
    );
  }

  if (currentUser.status === 'pending') {
    return (
      <div className={containerClass}>
        <WaitingRoom />
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <NotificationManager />
      <MainMenu />
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
