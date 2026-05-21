import React from 'react';
import { Home, Users, Trophy, Calendar, ShoppingBag, Settings, MessageSquare, Menu } from 'lucide-react';
import { cn } from '../lib/utils';
import { useUser } from '../contexts/UserContext';
import { motion, AnimatePresence } from 'motion/react';
import { translations } from '../translations';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setShowSettings: (show: boolean) => void;
  setShowChat: (show: boolean) => void;
}

export default function Layout({ children, activeTab, setActiveTab, setShowSettings, setShowChat }: LayoutProps) {
  const { currentUser } = useUser();
  const lang = currentUser?.language || 'en';
  const t = translations[lang] || translations.en;

  const tabs = [
    { id: 'home', icon: Home, label: t.appName || 'Rahee Quiz' },
    { id: 'friends', icon: Users, label: t.friends },
    { id: 'leaderboard', icon: Trophy, label: t.leaderboard },
    { id: 'events', icon: Calendar, label: t.events || 'Events' },
    { id: 'shop', icon: ShoppingBag, label: t.shop },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-[#050505] text-black dark:text-white transition-colors duration-300">
      {/* Main Content Area with desktop constraints */}
      <div className="flex-1 overflow-y-auto pb-24 w-full lg:max-w-4xl lg:mx-auto lg:border-x lg:border-black/5 lg:dark:border-white/5 relative bg-white dark:bg-[#050505]">
        {children}
      </div>

      {/* Floating Action Buttons - Only on Home screen */}
      {activeTab === 'home' && (
        <div className="lg:max-w-4xl lg:mx-auto relative w-full">
          <div className="fixed bottom-24 left-4 lg:left-auto lg:ml-4 z-50">
            <button
              onClick={() => setShowChat(true)}
              className="w-12 h-12 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl flex items-center justify-center text-primary shadow-lg active:scale-90 transition-all backdrop-blur-md"
            >
              <MessageSquare size={24} />
            </button>
          </div>

          <div className="fixed bottom-24 right-4 lg:right-auto lg:mr-4 z-50" style={{ right: 'max(1rem, calc((100vw - 56rem) / 2 + 1rem))' }}>
            <button
              onClick={() => setShowSettings(true)}
              className="w-12 h-12 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl flex items-center justify-center text-primary shadow-lg active:scale-90 transition-all backdrop-blur-md"
            >
              <Settings size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-[#111] border-t border-black/5 dark:border-white/5 flex justify-center">
        <motion.div 
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          className="h-20 w-full lg:max-w-4xl px-4 flex items-center justify-between"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center gap-1 transition-all flex-1 py-2",
                activeTab === tab.id ? "text-primary scale-110" : "text-black/40 dark:text-white/40"
              )}
            >
              <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
              <span className={cn(
                "text-[10px] font-black uppercase tracking-wider text-center",
                activeTab === tab.id ? "opacity-100" : "opacity-60"
              )}>
                {tab.label}
              </span>
            </button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
