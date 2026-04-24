import React from 'react';
import { motion } from 'motion/react';
import { X, Volume2, VolumeX, Globe, LogOut, Shield, Moon, Sun, MessageSquare, ChevronRight } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { translations } from '../translations';
import { db } from '../firebase/config';
import { ref, update } from 'firebase/database';

export default function Settings({ onClose, onShowFeedback }: { onClose: () => void, onShowFeedback: () => void }) {
  const { currentUser, setCurrentUser } = useUser();
  const { isDark, setIsDark, soundEnabled, setSoundEnabled } = useTheme();
  
  const lang = currentUser?.language || 'en';
  const t = translations[lang] || translations.en;

  const handleLanguageChange = async (newLang: 'en' | 'hi') => {
    if (!currentUser) return;
    await update(ref(db, `users/${currentUser.id}`), { language: newLang });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />
      <motion.div 
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="relative bg-white dark:bg-[#111] w-full max-w-sm rounded-[2.5rem] p-8 border border-black/5 dark:border-white/5 text-black dark:text-white"
      >
        <div className="flex items-center justify-between mb-8">
           <h3 className="text-2xl font-black uppercase tracking-tighter">{t.settings}</h3>
           <button onClick={onClose} className="p-2 bg-black/5 dark:bg-white/5 rounded-full text-black/40 dark:text-white/40"><X size={20} /></button>
        </div>

        <div className="space-y-3">
           {/* Sound */}
           <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl">
              <div className="flex items-center gap-4">
                 <div className={cn("p-3 rounded-xl", soundEnabled ? "bg-primary/20 text-primary" : "bg-black/10 dark:bg-white/5 text-black/40 dark:text-white/40")}>
                    {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
                 </div>
                 <div>
                    <p className="font-bold text-sm">{t.soundEffects}</p>
                    <p className="text-[10px] opacity-40 uppercase font-black">Enabled during gameplay</p>
                 </div>
              </div>
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={cn("w-12 h-6 rounded-full transition-all relative", soundEnabled ? "bg-primary" : "bg-black/10 dark:bg-white/10")}
              >
                <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white dark:bg-black transition-all", soundEnabled ? "left-7" : "left-1")} />
              </button>
           </div>

           {/* Appearance */}
           <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl">
              <div className="flex items-center gap-4">
                 <div className={cn("p-3 rounded-xl", isDark ? "bg-primary/20 text-primary" : "bg-primary/10 text-primary")}>
                    {isDark ? <Moon size={24} /> : <Sun size={24} />}
                 </div>
                 <div>
                    <p className="font-bold text-sm">{t.appearance}</p>
                    <p className="text-[10px] opacity-40 uppercase font-black">{isDark ? 'Dark Mode' : 'Light Mode'}</p>
                 </div>
              </div>
              <button 
                onClick={() => setIsDark(!isDark)}
                className={cn("w-12 h-6 rounded-full transition-all relative", isDark ? "bg-primary" : "bg-black/20 dark:bg-white/10")}
              >
                <div className={cn("absolute top-1 w-4 h-4 rounded-full bg-white dark:bg-black transition-all", isDark ? "left-7" : "left-1")} />
              </button>
           </div>

           {/* Language */}
           <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl">
              <div className="flex items-center gap-4">
                 <div className="p-3 rounded-xl bg-primary/20 text-primary">
                    <Globe size={24} />
                 </div>
                 <div>
                    <p className="font-bold text-sm">{t.language}</p>
                    <p className="text-[10px] opacity-40 uppercase font-black">Quizzes & Interface</p>
                 </div>
              </div>
              <select 
                value={lang} 
                onChange={(e) => handleLanguageChange(e.target.value as 'en' | 'hi')}
                className="bg-primary/10 border-none text-primary font-bold text-sm outline-none px-2 rounded-lg py-1 cursor-pointer"
              >
                <option value="en">EN</option>
                <option value="hi">HI</option>
              </select>
           </div>

           {/* Feedback */}
           <button 
             onClick={() => { onClose(); onShowFeedback(); }}
             className="w-full flex items-center justify-between p-4 bg-black/5 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl hover:bg-black/10 dark:hover:bg-white/5 transition-all text-left"
           >
              <div className="flex items-center gap-4">
                 <div className="p-3 rounded-xl bg-primary/20 text-primary">
                    <MessageSquare size={24} />
                 </div>
                 <div>
                    <p className="font-bold text-sm">Help & Feedback</p>
                    <p className="text-[10px] opacity-40 uppercase font-black">Report bags or suggest</p>
                 </div>
              </div>
              <ChevronRight size={20} className="text-black/20 dark:text-white/20" />
           </button>

           <div className="pt-4 space-y-3">
              <button onClick={() => setCurrentUser(null)} className="w-full flex items-center justify-center gap-3 p-5 rounded-2xl bg-red-500/10 text-red-500 font-black uppercase tracking-widest text-xs hover:bg-red-500/20 transition-all">
                 <LogOut size={20} />
                 Sign Out
              </button>
              <div className="flex items-center justify-center gap-1.5 text-black/20 dark:text-white/20 text-[10px] font-bold uppercase tracking-widest pt-4">
                 <Shield size={12} />
                 Secured by Rahee Enterprise
              </div>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
