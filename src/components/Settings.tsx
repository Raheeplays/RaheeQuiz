import React from 'react';
import { motion } from 'motion/react';
import { X, Volume2, VolumeX, Globe, LogOut, Shield, Moon, Sun, MessageSquare, ChevronRight, Zap, History, EyeOff, AlertTriangle, Music } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDialog } from '../contexts/DialogContext';
import { cn } from '../lib/utils';
import { translations } from '../translations';
import { db } from '../firebase/config';
import { ref, update, remove, push, set, onValue } from 'firebase/database';

export default function Settings({ 
  onClose, 
  onShowFeedback, 
  onShowHistory,
  activeQuizId,
  activeQuizText
}: { 
  onClose: () => void, 
  onShowFeedback: () => void, 
  onShowHistory: () => void,
  activeQuizId?: string,
  activeQuizText?: string
}) {
  const { currentUser, logout, settings } = useUser();
  const { isDark, setIsDark, soundEnabled, setSoundEnabled, vibrationEnabled, setVibrationEnabled } = useTheme();
  const { confirm, alert } = useDialog();
  
  const lang = currentUser?.language || 'en';
  const t = translations[lang] || translations.en;

  const handleLanguageChange = async (newLang: 'en' | 'hi') => {
    if (!currentUser) return;
    await update(ref(db, `users/${currentUser.id}`), { language: newLang });
  };

  const handleReportQuestion = async () => {
    if (!currentUser || !activeQuizId) return;
    
    const isConfirm = await confirm({
      title: lang === 'hi' ? 'प्रश्न रिपोर्ट करें' : 'Report Question',
      description: lang === 'hi' 
        ? 'क्या आप इस प्रश्न को अनुपयुक्त के रूप में रिपोर्ट करना चाहते हैं?'
        : 'Are you sure you want to report this quiz/question as inappropriate?',
      type: 'confirm'
    });
    
    if (!isConfirm) return;

    try {
      const reportRef = push(ref(db, 'reports'));
      await set(reportRef, {
        id: reportRef.key,
        quizId: activeQuizId,
        quizText: activeQuizText || '',
        userId: currentUser.id,
        userName: currentUser.name || 'Anonymous',
        userUsername: currentUser.username || '',
        timestamp: Date.now(),
        status: 'pending' // pending, approved, resolved, dismissed
      });
      
      await alert({
        title: lang === 'hi' ? 'धन्यवाद' : 'Report Submitted',
        description: lang === 'hi'
          ? 'रिपोर्ट के लिए धन्यवाद! हमारी टीम इसकी समीक्षा करेगी।'
          : 'Thank you! Your report has been submitted for review.',
        type: 'success'
      });
      onClose();
    } catch (err: any) {
      await alert({
        title: 'Error',
        description: err.message || 'Failed to submit report',
        type: 'error'
      });
    }
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

                 {/* Search Privacy Toggle */}
                 <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-2xl">
                    <div className="flex items-center gap-3">
                       <div className={cn("p-1.5 rounded-lg bg-white dark:bg-black shadow-sm", currentUser?.privacyEnabled ? "text-primary" : "text-black/20 dark:text-white/20")}>
                          <EyeOff size={16} />
                       </div>
                       <div>
                          <p className="font-black text-[10px] uppercase tracking-tight">
                            {lang === 'hi' ? 'गोपनीयता मोड' : 'Privacy Mode'}
                          </p>
                          <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase">
                            {lang === 'hi' ? 'सटीक खोज ही संभव' : 'Exact Search Only'}
                          </p>
                       </div>
                    </div>
                    <button 
                      onClick={async () => {
                        if (!currentUser) return;
                        await update(ref(db, `users/${currentUser.id}`), {
                          privacyEnabled: !currentUser.privacyEnabled
                        });
                      }}
                      className={cn("w-8 h-4 rounded-full transition-all relative", currentUser?.privacyEnabled ? "bg-primary" : "bg-black/10 dark:bg-white/10")}
                    >
                      <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-black transition-all", currentUser?.privacyEnabled ? "left-4.5" : "left-0.5")} />
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

                  {/* Background Music Toggle */}
                  <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-2xl">
                     <div className="flex items-center gap-3">
                        <div className={cn("p-1.5 rounded-lg bg-white dark:bg-black shadow-sm", (currentUser?.bgmEnabled !== false) ? "text-primary" : "text-black/20 dark:text-white/20")}>
                           {(currentUser?.bgmEnabled !== false) ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </div>
                        <div>
                           <p className="font-black text-[10px] uppercase tracking-tight">
                              {lang === 'hi' ? 'पृष्ठभूमि संगीत' : 'Background Music'}
                           </p>
                           <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase">
                              {lang === 'hi' ? 'शांत संगीत' : 'Ambient Harmony'}
                           </p>
                        </div>
                     </div>
                     <button 
                       onClick={async () => {
                         if (!currentUser) return;
                         const updatedBgm = !(currentUser.bgmEnabled !== false);
                         await update(ref(db, `users/${currentUser.id}`), {
                           bgmEnabled: updatedBgm
                         });
                       }}
                       className={cn("w-8 h-4 rounded-full transition-all relative", (currentUser?.bgmEnabled !== false) ? "bg-primary" : "bg-black/10 dark:bg-white/10")}
                     >
                       <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-black transition-all", (currentUser?.bgmEnabled !== false) ? "left-4.5" : "left-0.5")} />
                     </button>
                  </div>

                  {/* Custom Studio Audio Mixer panel for players */}
                  {(currentUser?.bgmEnabled !== false) && (
                    <div className="p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl space-y-3.5 text-left">
                       <p className="font-black text-[10px] uppercase tracking-wider text-primary flex items-center gap-1.5 justify-between">
                         <span>🎼 {lang === 'hi' ? 'आपका पर्सनल स्टूडियो मिक्सर' : 'Personal Studio Mixer'}</span>
                         <span className="font-mono text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                           {currentUser?.bgmBpm !== undefined ? currentUser.bgmBpm : (settings?.bgmBpm !== undefined ? settings.bgmBpm : 95)} BPM
                         </span>
                       </p>

                       {/* Synth Slider */}
                       <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/50 dark:text-white/50">
                            <span>✨ {lang === 'hi' ? 'सिंथ पैड' : 'Synth Ambient Pad'}</span>
                            <span className="font-mono text-primary font-bold">
                              {Math.round((currentUser?.bgmVolumeSynth !== undefined ? currentUser.bgmVolumeSynth : (settings?.bgmVolumeSynth !== undefined ? settings.bgmVolumeSynth : 0.7)) * 100)}%
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentUser?.bgmVolumeSynth !== undefined ? currentUser.bgmVolumeSynth : (settings?.bgmVolumeSynth !== undefined ? settings.bgmVolumeSynth : 0.7)}
                            onChange={async (e) => {
                              if (!currentUser) return;
                              const val = parseFloat(e.target.value);
                              await update(ref(db, `users/${currentUser.id}`), { bgmVolumeSynth: val });
                            }}
                            className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                          />
                       </div>

                       {/* Flute Slider */}
                       <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/50 dark:text-white/50">
                            <span>🌾 {lang === 'hi' ? 'भारतीय बांसुरी' : 'Indian Woodwind Flute'}</span>
                            <span className="font-mono text-primary font-bold">
                              {Math.round((currentUser?.bgmVolumeFlute !== undefined ? currentUser.bgmVolumeFlute : (settings?.bgmVolumeFlute !== undefined ? settings.bgmVolumeFlute : 0.4)) * 100)}%
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentUser?.bgmVolumeFlute !== undefined ? currentUser.bgmVolumeFlute : (settings?.bgmVolumeFlute !== undefined ? settings.bgmVolumeFlute : 0.4)}
                            onChange={async (e) => {
                              if (!currentUser) return;
                              const val = parseFloat(e.target.value);
                              await update(ref(db, `users/${currentUser.id}`), { bgmVolumeFlute: val });
                            }}
                            className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                          />
                       </div>

                       {/* Piano Slider */}
                       <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/50 dark:text-white/50">
                            <span>🎹 {lang === 'hi' ? 'पियानो धुन' : 'Peaceful Grand Piano'}</span>
                            <span className="font-mono text-primary font-bold">
                              {Math.round((currentUser?.bgmVolumePiano !== undefined ? currentUser.bgmVolumePiano : (settings?.bgmVolumePiano !== undefined ? settings.bgmVolumePiano : 0.5)) * 100)}%
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentUser?.bgmVolumePiano !== undefined ? currentUser.bgmVolumePiano : (settings?.bgmVolumePiano !== undefined ? settings.bgmVolumePiano : 0.5)}
                            onChange={async (e) => {
                              if (!currentUser) return;
                              const val = parseFloat(e.target.value);
                              await update(ref(db, `users/${currentUser.id}`), { bgmVolumePiano: val });
                            }}
                            className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                          />
                       </div>

                       {/* Guitar Slider */}
                       <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/50 dark:text-white/50">
                            <span>🎸 {lang === 'hi' ? 'शास्त्रीय गिटार' : 'Nylon Classical Guitar'}</span>
                            <span className="font-mono text-primary font-bold">
                              {Math.round((currentUser?.bgmVolumeGuitar !== undefined ? currentUser.bgmVolumeGuitar : (settings?.bgmVolumeGuitar !== undefined ? settings.bgmVolumeGuitar : 0.5)) * 100)}%
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentUser?.bgmVolumeGuitar !== undefined ? currentUser.bgmVolumeGuitar : (settings?.bgmVolumeGuitar !== undefined ? settings.bgmVolumeGuitar : 0.5)}
                            onChange={async (e) => {
                              if (!currentUser) return;
                              const val = parseFloat(e.target.value);
                              await update(ref(db, `users/${currentUser.id}`), { bgmVolumeGuitar: val });
                            }}
                            className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                          />
                       </div>

                       {/* Beats Slider */}
                       <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/50 dark:text-white/50">
                            <span>🥁 {lang === 'hi' ? 'लो-फाई बीट्स' : 'Lofi Chill Drum Beats'}</span>
                            <span className="font-mono text-primary font-bold">
                              {Math.round((currentUser?.bgmVolumeBeats !== undefined ? currentUser.bgmVolumeBeats : (settings?.bgmVolumeBeats !== undefined ? settings.bgmVolumeBeats : 0.25)) * 100)}%
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentUser?.bgmVolumeBeats !== undefined ? currentUser.bgmVolumeBeats : (settings?.bgmVolumeBeats !== undefined ? settings.bgmVolumeBeats : 0.25)}
                            onChange={async (e) => {
                              if (!currentUser) return;
                              const val = parseFloat(e.target.value);
                              await update(ref(db, `users/${currentUser.id}`), { bgmVolumeBeats: val });
                            }}
                            className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                          />
                       </div>

                       {/* Speed/BPM Slider */}
                       <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/50 dark:text-white/50">
                            <span>⏱️ {lang === 'hi' ? 'संगीत की गति' : 'Music Tempo Speed'}</span>
                            <span className="font-mono text-primary font-bold">
                              {currentUser?.bgmBpm !== undefined ? currentUser.bgmBpm : (settings?.bgmBpm !== undefined ? settings.bgmBpm : 95)} BPM
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="60"
                            max="160"
                            step="5"
                            value={currentUser?.bgmBpm !== undefined ? currentUser.bgmBpm : (settings?.bgmBpm !== undefined ? settings.bgmBpm : 95)}
                            onChange={async (e) => {
                              if (!currentUser) return;
                              const val = parseInt(e.target.value, 10);
                              await update(ref(db, `users/${currentUser.id}`), { bgmBpm: val });
                            }}
                            className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                          />
                       </div>

                       {/* Violin Slider */}
                       <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/50 dark:text-white/50">
                            <span>🎻 {lang === 'hi' ? 'वायलिन तार' : 'Bowed Violin Strings'}</span>
                            <span className="font-mono text-primary font-bold">
                              {Math.round((currentUser?.bgmVolumeViolin !== undefined ? currentUser.bgmVolumeViolin : (settings?.bgmVolumeViolin !== undefined ? settings.bgmVolumeViolin : 0.4)) * 100)}%
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentUser?.bgmVolumeViolin !== undefined ? currentUser.bgmVolumeViolin : (settings?.bgmVolumeViolin !== undefined ? settings.bgmVolumeViolin : 0.4)}
                            onChange={async (e) => {
                              if (!currentUser) return;
                              const val = parseFloat(e.target.value);
                              await update(ref(db, `users/${currentUser.id}`), { bgmVolumeViolin: val });
                            }}
                            className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                          />
                       </div>

                       {/* Harp Slider */}
                       <div className="space-y-1">
                          <div className="flex justify-between items-center text-[8px] font-black uppercase text-black/50 dark:text-white/50">
                            <span>👼 {lang === 'hi' ? 'वीणा राग' : 'Ethereal Concert Harp'}</span>
                            <span className="font-mono text-primary font-bold">
                              {Math.round((currentUser?.bgmVolumeHarp !== undefined ? currentUser.bgmVolumeHarp : (settings?.bgmVolumeHarp !== undefined ? settings.bgmVolumeHarp : 0.4)) * 100)}%
                            </span>
                          </div>
                          <input 
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={currentUser?.bgmVolumeHarp !== undefined ? currentUser.bgmVolumeHarp : (settings?.bgmVolumeHarp !== undefined ? settings.bgmVolumeHarp : 0.4)}
                            onChange={async (e) => {
                              if (!currentUser) return;
                              const val = parseFloat(e.target.value);
                              await update(ref(db, `users/${currentUser.id}`), { bgmVolumeHarp: val });
                            }}
                            className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                          />
                       </div>

                       {/* Personal Master MIDI Preset Choice */}
                       {(settings?.bgmPreset === 'custom_midi') && (
                         <div className="space-y-1 pt-1.5 border-t border-black/5 dark:border-white/5">
                           <label className="text-[8px] font-black uppercase tracking-wider text-primary">
                             🎼 {lang === 'hi' ? 'पसंदीदा शास्त्रीय रचना' : 'Personal Score Preset'}
                           </label>
                           <select 
                             value={currentUser?.midiPresetName || settings?.midiPresetName || 'satie'}
                             onChange={async (e) => {
                               if (!currentUser) return;
                               await update(ref(db, `users/${currentUser.id}`), { midiPresetName: e.target.value });
                             }}
                             className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-black dark:text-white focus:border-primary outline-none cursor-pointer uppercase"
                           >
                             <option value="satie">🌸 Satie - Gymnopédie No.1</option>
                             <option value="bach">🎹 Bach - Prelude in C</option>
                             <option value="beethoven">🌙 Beethoven - Moonlight Sonata</option>
                             <option value="raga">🌾 Meditative Indian Raga</option>
                           </select>
                         </div>
                       )}
                    </div>
                  )}

                  {/* Ambient Theme Toggle */}
                  <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-2xl">
                     <div className="flex items-center gap-3">
                        <div className={cn("p-1.5 rounded-lg bg-white dark:bg-black shadow-sm", currentUser?.ambientModeEnabled ? "text-primary" : "text-black/20 dark:text-white/20")}>
                           <Sun size={16} />
                        </div>
                        <div>
                           <p className="font-black text-[10px] uppercase tracking-tight">
                              {lang === 'hi' ? 'परिवेश थीम मोड' : 'Ambient Light Mode'}
                           </p>
                           <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase">
                              {lang === 'hi' ? 'स्वचालित डार्क मोड' : 'Auto Light Sensor'}
                           </p>
                        </div>
                     </div>
                     <button 
                       onClick={async () => {
                         if (!currentUser) return;
                         const updatedAmbient = !currentUser.ambientModeEnabled;
                         await update(ref(db, `users/${currentUser.id}`), {
                           ambientModeEnabled: updatedAmbient
                         });
                       }}
                       className={cn("w-8 h-4 rounded-full transition-all relative", currentUser?.ambientModeEnabled ? "bg-primary" : "bg-black/10 dark:bg-white/10")}
                     >
                       <div className={cn("absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-black transition-all", currentUser?.ambientModeEnabled ? "left-4.5" : "left-0.5")} />
                     </button>
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
              {activeQuizId && (
                 <div className="space-y-1.5 pt-1 pb-2">
                    <p className="text-[9px] font-black text-black/20 dark:text-white/20 uppercase tracking-[0.2em] ml-4">
                       {lang === 'hi' ? 'गेमप्ले क्रियाएं' : 'Gameplay Actions'}
                    </p>
                    <button 
                      onClick={handleReportQuestion}
                      className="w-full flex items-center justify-between p-3 bg-red-500/10 dark:bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl border border-red-500/20 transition-all active:scale-[0.98] cursor-pointer"
                    >
                       <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-lg bg-red-500 text-white shadow-sm">
                             <AlertTriangle size={14} />
                          </div>
                          <div className="text-left">
                             <p className="font-black text-[10px] uppercase tracking-tight">
                                {lang === 'hi' ? 'सवाल की रिपोर्ट' : 'Report Quiz'}
                             </p>
                             <p className="text-[7px] font-bold opacity-60 uppercase">
                                {lang === 'hi' ? 'अनुपयुक्त सामग्री' : 'Inappropriate Content'}
                             </p>
                          </div>
                       </div>
                       <ChevronRight size={14} className="opacity-40" />
                    </button>
                 </div>
              )}

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
                    await logout();
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
