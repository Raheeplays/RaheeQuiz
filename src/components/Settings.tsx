import React from 'react';
import { motion } from 'motion/react';
import { X, Volume2, VolumeX, Globe, LogOut, Shield, Moon, Sun, MessageSquare, ChevronRight, Zap, History } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';
import { translations } from '../translations';
import { db, auth } from '../firebase/config';
import { ref, update, remove } from 'firebase/database';

export default function Settings({ onClose, onShowFeedback, onShowHistory }: { onClose: () => void, onShowFeedback: () => void, onShowHistory: () => void }) {
  const { currentUser, setCurrentUser } = useUser();
  const { isDark, setIsDark, soundEnabled, setSoundEnabled, vibrationEnabled, setVibrationEnabled } = useTheme();
  
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
        className="relative bg-white dark:bg-[#0a0a0a] w-full max-w-[340px] rounded-[2rem] p-6 border border-black/10 dark:border-white/10 text-black dark:text-white flex flex-col max-h-[85vh] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between mb-8 shrink-0">
           <div>
              <h3 className="text-2xl font-black uppercase tracking-tighter">{t.settings}</h3>
              <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mt-1">Configure your experience</p>
           </div>
           <button onClick={onClose} className="p-2 bg-black/5 dark:bg-white/5 rounded-full text-black/40 dark:text-white/40 hover:text-red-500 transition-colors"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 space-y-3 custom-scrollbar min-h-0">
           {/* Account Section */}
           <div className="space-y-1.5">
              <p className="text-[9px] font-black text-black/20 dark:text-white/20 uppercase tracking-[0.2em] ml-4">Account</p>
              <div className="bg-black/5 dark:bg-white/5 p-3 rounded-2xl border border-black/5 dark:border-white/5 flex items-center gap-3">
                 <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary text-lg font-black">
                    {currentUser?.name?.[0] || '?'}
                 </div>
                 <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-black dark:text-white truncate uppercase">{currentUser?.name}</p>
                    <p className="text-[9px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest truncate">@{currentUser?.username || 'no_username'}</p>
                 </div>
              </div>
           </div>

           <div className="space-y-1.5">
              <p className="text-[9px] font-black text-black/20 dark:text-white/20 uppercase tracking-[0.2em] ml-4">Preferences</p>
              <div className="grid grid-cols-1 gap-1.5">
                 {/* Sound */}
                 <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-2xl">
                    <div className="flex items-center gap-3">
                       <div className={cn("p-1.5 rounded-lg bg-white dark:bg-black shadow-sm", soundEnabled ? "text-primary" : "text-black/20 dark:text-white/20")}>
                          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                       </div>
                       <div>
                          <p className="font-black text-[10px] uppercase tracking-tight">{t.soundEffects}</p>
                          <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase">Audio Engine</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      className={cn("w-8 h-4 rounded-full transition-all relative", soundEnabled ? "bg-primary" : "bg-black/10 dark:bg-white/10")}
                    >
                      <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-black transition-all", soundEnabled ? "left-4.5" : "left-0.5")} />
                    </button>
                 </div>

                 {/* Vibration */}
                 <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-2xl">
                    <div className="flex items-center gap-3">
                       <div className={cn("p-1.5 rounded-lg bg-white dark:bg-black shadow-sm", vibrationEnabled ? "text-primary" : "text-black/20 dark:text-white/20")}>
                          <Zap size={16} />
                       </div>
                       <div>
                          <p className="font-black text-[10px] uppercase tracking-tight">Haptics</p>
                          <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase">Tactile support</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => setVibrationEnabled(!vibrationEnabled)}
                      className={cn("w-8 h-4 rounded-full transition-all relative", vibrationEnabled ? "bg-primary" : "bg-black/10 dark:bg-white/10")}
                    >
                      <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-black transition-all", vibrationEnabled ? "left-4.5" : "left-0.5")} />
                    </button>
                 </div>

                 {/* Appearance */}
                 <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-2xl">
                    <div className="flex items-center gap-3">
                       <div className={cn("p-1.5 rounded-lg bg-white dark:bg-black shadow-sm text-primary")}>
                          {isDark ? <Moon size={16} /> : <Sun size={16} />}
                       </div>
                       <div>
                          <p className="font-black text-[10px] uppercase tracking-tight">{t.appearance}</p>
                          <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase">Visual Theme</p>
                       </div>
                    </div>
                    <button 
                      onClick={() => setIsDark(!isDark)}
                      className={cn("w-8 h-4 rounded-full transition-all relative", isDark ? "bg-primary" : "bg-black/10 dark:bg-white/10")}
                    >
                      <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-black transition-all", isDark ? "left-4.5" : "left-0.5")} />
                    </button>
                 </div>

                 {/* Language */}
                 <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-2xl">
                    <div className="flex items-center gap-3">
                       <div className="p-1.5 rounded-lg bg-white dark:bg-black shadow-sm text-primary">
                          <Globe size={16} />
                       </div>
                       <div>
                          <p className="font-black text-[10px] uppercase tracking-tight">{t.language}</p>
                          <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase">Locale</p>
                       </div>
                    </div>
                    <select 
                      value={lang} 
                      onChange={(e) => handleLanguageChange(e.target.value as 'en' | 'hi')}
                      className="bg-primary/20 border-none text-primary font-black text-[10px] outline-none px-3 rounded-lg py-1.5 cursor-pointer uppercase tracking-widest"
                    >
                      <option value="en" className="bg-white dark:bg-black">EN</option>
                      <option value="hi" className="bg-white dark:bg-black">HI</option>
                    </select>
                 </div>

                 {/* Admin Auto Correct */}
                 {currentUser?.role === 'admin' && (
                   <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-white/5 rounded-2xl border border-primary/20">
                     <div className="flex items-center gap-4">
                       <div className={cn("p-2 rounded-xl bg-white dark:bg-black shadow-sm", currentUser.autoCorrectEnabled ? "text-primary" : "text-black/20 dark:text-white/20")}>
                         <Shield size={18} />
                       </div>
                       <div>
                          <p className="font-black text-xs uppercase tracking-tight text-primary">Auto Correct</p>
                          <p className="text-[9px] font-bold text-black/40 dark:text-white/40 uppercase">Admin override mode</p>
                       </div>
                     </div>
                     <button 
                       onClick={async () => {
                         await update(ref(db, `users/${currentUser.id}`), { 
                           autoCorrectEnabled: !currentUser.autoCorrectEnabled 
                         });
                       }}
                       className={cn("w-10 h-5 rounded-full transition-all relative", currentUser.autoCorrectEnabled ? "bg-primary" : "bg-black/10 dark:bg-white/10")}
                     >
                       <div className={cn("absolute top-1 w-3 h-3 rounded-full bg-white dark:bg-black transition-all", currentUser.autoCorrectEnabled ? "left-6" : "left-1")} />
                     </button>
                   </div>
                 )}
              </div>
           </div>

           <div className="space-y-1.5">
              <p className="text-[9px] font-black text-black/20 dark:text-white/20 uppercase tracking-[0.2em] ml-4">Journal & Help</p>
              <div className="grid grid-cols-2 gap-2">
                 {/* Quiz History */}
                 <button 
                   onClick={() => { onClose(); onShowHistory(); }}
                   className="flex flex-col gap-2 p-4 bg-black/5 dark:bg-white/5 rounded-2xl hover:bg-primary/10 transition-all border border-black/5 dark:border-white/5 text-left group"
                 >
                    <div className="p-1.5 rounded-lg bg-white dark:bg-black shadow-sm text-primary w-fit group-hover:scale-110 transition-transform">
                       <History size={16} />
                    </div>
                    <div>
                       <p className="font-black text-[10px] uppercase tracking-tight">Journal</p>
                       <p className="text-[7px] font-bold text-black/30 dark:text-white/30 uppercase mt-0.5">Past Runs</p>
                    </div>
                 </button>

                 {/* Feedback */}
                 <button 
                   onClick={() => { onClose(); onShowFeedback(); }}
                   className="flex flex-col gap-2 p-4 bg-black/5 dark:bg-white/5 rounded-2xl hover:bg-primary/10 transition-all border border-black/5 dark:border-white/5 text-left group"
                 >
                    <div className="p-1.5 rounded-lg bg-white dark:bg-black shadow-sm text-primary w-fit group-hover:scale-110 transition-transform">
                       <MessageSquare size={16} />
                    </div>
                    <div>
                       <p className="font-black text-[10px] uppercase tracking-tight">Support</p>
                       <p className="text-[7px] font-bold text-black/30 dark:text-white/30 uppercase mt-0.5">Feedback</p>
                    </div>
                 </button>
              </div>
           </div>

           <div className="pt-4 pb-1 space-y-2 shrink-0">
              <button 
                onClick={async () => {
                  try {
                    await auth.signOut();
                    onClose();
                  } catch (e) {}
                }} 
                className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-500 text-white font-black uppercase tracking-[0.2em] text-[9px] hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-red-500/10"
              >
                 <LogOut size={14} />
                 Sign Out
              </button>
              <p className="text-[7px] font-black text-black/10 dark:text-white/10 text-center uppercase tracking-widest">Rahee Quiz v4.2.0</p>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
