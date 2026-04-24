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
    { id: 'home', icon: Home, label: t.appName || 'Home' },
    { id: 'friends', icon: Users, label: t.friends },
    { id: 'leaderboard', icon: Trophy, label: t.leaderboard },
    { id: 'shop', icon: ShoppingBag, label: t.shop },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-black text-white relative">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto pb-24">
        {children}
      </div>

      {/* Floating Action Buttons - Only on Home screen */}
      {activeTab === 'home' && (
        <>
          <div className="fixed bottom-24 left-4 z-50">
            <button
              onClick={() => setShowChat(true)}
              className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-primary shadow-lg active:scale-90 transition-all backdrop-blur-md"
            >
              <MessageSquare size={24} />
            </button>
          </div>

          <div className="fixed bottom-24 right-4 z-50">
            <button
              onClick={() => setShowSettings(true)}
              className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-primary shadow-lg active:scale-90 transition-all backdrop-blur-md"
            >
              <Settings size={24} />
            </button>
          </div>
        </>
      )}

      {/* Bottom Tab Bar */}
      <motion.div 
        initial={{ y: 80 }}
        animate={{ y: 0 }}
        className="fixed bottom-0 left-0 right-0 h-20 bg-[#111] border-t border-white/5 px-4 flex items-center justify-between z-40"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-col items-center gap-1 transition-all",
              activeTab === tab.id ? "text-[#32befa] scale-110" : "text-white/40"
            )}
          >
            <tab.icon size={24} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
          </button>
        ))}
      </motion.div>
    </div>
  );
}
