import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, ShoppingBag, TrendingUp, Users, Settings as SettingsIcon, 
  Trophy, Grid, Star, LogOut, Shield, Swords, Zap, RefreshCw, 
  MessageSquare, ChevronRight, Moon, Sun, Coins, HelpCircle, Heart,
  History as HistoryIcon, Clock, X, XCircle, Check, Camera, Upload, Image as ImageIcon, ChevronDown, ChevronUp
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDialog } from '../contexts/DialogContext';
import Layout from './Layout';
import QuizScreen from './QuizScreen';
import Leaderboard from './Leaderboard';
import Shop from './Shop';
import Settings from './Settings';
import SocialHub from './SocialHub';
import Events from './Events';
import MultiplayerHub from './MultiplayerHub';
import MultiplayerGame from './MultiplayerGame';
import AdminPanel from './AdminPanel';
import ScoreCard from './ScoreCard';
import History from './History';
import Chat from './Chat';
import Feedback from './Feedback';
import { db } from '../firebase/config';
import { ref, onValue, update } from 'firebase/database';
import { User, Topic } from '../types';
import { CLASSES, SUBJECTS } from '../constants';
import { translations } from '../translations';
import { cn } from '../lib/utils';

const DEFAULT_AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Buddy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Caspian',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Dora',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Erik',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&mouth=smile',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&top=longHair',
];

export default function MainMenu() {
  const { currentUser, setCurrentUser } = useUser();
  const { isDark, setIsDark } = useTheme();
  const { alert } = useDialog();
  const [activeTab, setActiveTab] = useState<'home' | 'leaderboard' | 'shop' | 'friends' | 'admin' | 'event'>('home');
  const [showQuiz, setShowQuiz] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showRaheePass, setShowRaheePass] = useState(false);
  const [showTopicSelect, setShowTopicSelect] = useState(false);
  const [selectionPath, setSelectionPath] = useState<Topic[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMultiplayerHub, setShowMultiplayerHub] = useState(false);
  const [multiRoomId, setMultiRoomId] = useState<string | null>(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [isBotMatch, setIsBotMatch] = useState(false);
  const [isMatchMinimized, setIsMatchMinimized] = useState(false);
  const [rating, setRating] = useState(0);
  const [showScoreCard, setShowScoreCard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLivesModal, setShowLivesModal] = useState(false);
  const [refillTimeLeft, setRefillTimeLeft] = useState<number>(0);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);

  const REFILL_INTERVAL = 15 * 60 * 1000; // 15 minutes
  const MAX_LIVES = 16;

  // Streak & Refill Logic
  useEffect(() => {
    if (!currentUser) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const lastLogin = currentUser.lastLoginDate;

    // Daily Streak Logic
    if (lastLogin !== today) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let newStreak = currentUser.streak || 0;
      if (lastLogin === yesterdayStr) {
        newStreak += 1;
      } else if (lastLogin) {
        newStreak = 1; // Reset if missed a day
      } else {
        newStreak = 1; // First time
      }

      update(ref(db, `users/${currentUser.id}`), {
        lastLoginDate: today,
        streak: newStreak
      });
    }

    // Refill Timer
    const interval = setInterval(() => {
      if (!currentUser.lives?.enabled) return;
      
      const count = currentUser.lives?.count || 0;
      if (count >= MAX_LIVES) {
        setRefillTimeLeft(0);
        return;
      }

      const lastRefill = currentUser.lives?.lastRefill || Date.now();
      const elapsed = Date.now() - lastRefill;
      
      if (elapsed >= REFILL_INTERVAL) {
        const refillCount = Math.floor(elapsed / REFILL_INTERVAL);
        const nextCount = Math.min(MAX_LIVES, count + refillCount);
        update(ref(db, `users/${currentUser.id}/lives`), {
          count: nextCount,
          lastRefill: lastRefill + (refillCount * REFILL_INTERVAL)
        });
      } else {
        setRefillTimeLeft(REFILL_INTERVAL - elapsed);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentUser?.id, currentUser?.lastLoginDate, currentUser?.lives?.lastRefill]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [totalQuizzesCount, setTotalQuizzesCount] = useState(0);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 512 * 1024) { // 512KB limit
        alert({ title: 'File too large', description: 'Max 512KB allowed', type: 'error' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        await update(ref(db, `users/${currentUser?.id}`), {
          pendingAvatarUrl: base64String
        });
        await alert({ title: 'Uploaded!', description: 'Your profile picture is pending admin approval.', type: 'success' });
        setIsEditingAvatar(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectAvatar = async (url: string) => {
    if (!currentUser) return;
    await update(ref(db, `users/${currentUser.id}`), {
      avatarUrl: url,
      pendingAvatarUrl: null
    });
    setIsEditingAvatar(false);
  };

  useEffect(() => {
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setAllUsers(Object.values(data));
      }
    });

    const topicsRef = ref(db, 'topics');
    onValue(topicsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTopics(Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })));
      }
    });

    const quizzesRef = ref(db, 'quizzes');
    onValue(quizzesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTotalQuizzesCount(Object.keys(data).length);
      }
    });

    const handleStartMatch = (e: any) => {
      if (e.detail?.roomId) {
        setMultiRoomId(e.detail.roomId);
        setIsBotMatch(false);
      }
    };
    window.addEventListener('start-match', handleStartMatch);

    return () => {
      unsubscribe();
      window.removeEventListener('start-match', handleStartMatch);
    };
  }, []);

  const handleStartQuiz = () => {
     if (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic) {
        // If fixed topic but different from selected, force sync (should be handled at login/update)
        if (currentUser.selectedTopicId !== currentUser.fixedTopicId) {
           update(ref(db, `users/${currentUser.id}`), { selectedTopicId: currentUser.fixedTopicId });
        }
        setShowQuiz(true);
        return;
     }

     if (!currentUser?.selectedTopicId) {
        setShowTopicSelect(true);
        return;
     }
     setShowQuiz(true);
  };

  const getUserRank = (userId: string) => {
    const sortedUsers = [...allUsers].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const index = sortedUsers.findIndex(u => u.id === userId);
    return index !== -1 ? index + 1 : '-';
  };

  const toggleLanguage = async () => {
    if (!currentUser) return;
    const nextLang = currentUser.language === 'en' ? 'hi' : 'en';
    await update(ref(db, `users/${currentUser.id}`), { language: nextLang });
  };

  const getAllChildTopicIds = (topic: Topic): string[] => {
    let ids = [topic.id];
    if (topic.children) {
      Object.values(topic.children).forEach(child => {
        ids = [...ids, ...getAllChildTopicIds(child)];
      });
    }
    return ids;
  };

  const startSelectedQuiz = async (ids?: string[]) => {
    if (!currentUser) return;
    const targetIds = ids || selectedTopicIds;
    if (targetIds.length === 0) return;

    await update(ref(db, `users/${currentUser.id}`), {
      selectedTopicIds: targetIds,
      selectedTopicId: targetIds[0],
      currentQuizIndex: 0,
      currentRound: 1
    });
    setSelectedTopicIds([]);
    setShowTopicSelect(false);
    setShowQuiz(true);
  };

  const toggleTopicSelection = (topicId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedTopicIds(prev => 
      prev.includes(topicId) 
        ? prev.filter(id => id !== topicId) 
        : [...prev, topicId]
    );
  };

  const renderHome = () => {
    const userRank = getUserRank(currentUser?.id || '');
    const lang = currentUser?.language || 'en';
    const t = translations[lang] || translations.en;
    
    return (
    <div className="p-6 space-y-8">
      {/* Profile Summary */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center justify-between"
      >
        <div 
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-4 cursor-pointer group"
        >
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-black font-black text-2xl shadow-[0_0_20px_rgba(var(--primary-color),0.3)] group-hover:scale-110 transition-transform overflow-hidden border-2 border-primary">
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} className="w-full h-full object-cover" alt="Avatar" />
            ) : (
              currentUser?.name?.[0].toUpperCase()
            )}
          </div>
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2 text-black dark:text-white group-hover:text-primary transition-colors">
              {currentUser?.name}
              {currentUser?.role === 'admin' && <Shield size={18} className="text-primary" />}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <button 
                onClick={(e) => { e.stopPropagation(); toggleLanguage(); }}
                className="px-2 py-0.5 bg-primary/10 text-primary text-[8px] font-black rounded uppercase tracking-widest border border-primary/20 hover:bg-primary hover:text-black transition-all"
              >
                {lang === 'en' ? 'English' : 'हिंदी'}
              </button>
              <span className="text-black/30 dark:text-white/40 text-[10px] font-bold uppercase tracking-widest leading-none">{t.rank} #{userRank}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          {currentUser?.streak !== undefined && currentUser.streak > 0 && (
            <div className="flex items-center gap-2 px-3 bg-orange-500/10 dark:bg-orange-500/5 rounded-xl border border-orange-500/20">
               <Zap size={14} className="text-orange-500 fill-orange-500" />
               <span className="text-sm font-black text-orange-500">{currentUser.streak}</span>
            </div>
          )}
          {currentUser?.lives?.enabled && (
            <button 
              onClick={() => setShowLivesModal(true)}
              className="flex items-center gap-2 px-3 bg-red-500/10 dark:bg-red-500/5 rounded-xl border border-red-500/20 hover:scale-105 active:scale-95 transition-all"
            >
               <Heart size={14} className="text-red-500 fill-red-500" />
               <span className="text-sm font-black text-red-500">{currentUser.lives.count}</span>
            </button>
          )}
          <button 
            onClick={() => setActiveTab('shop')}
            className="flex items-center gap-2 px-3 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5"
          >
             <Coins size={14} className="text-primary italic" />
             <span className="text-sm font-black text-primary">{currentUser?.raheeCoins || 0}</span>
          </button>
          <button 
            onClick={() => setIsDark(!isDark)}
            className="p-3 bg-black/5 dark:bg-white/5 rounded-xl text-black/40 dark:text-white/40 hover:text-primary transition-colors border border-black/5 dark:border-white/5"
          >
            {isDark ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </motion.div>

      {/* Progress Bar */}
      <div className="bg-black/5 dark:bg-[#111] p-5 md:p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5">
        <div className="flex justify-between items-end mb-4">
          <div>
            <p className="text-black/30 dark:text-white/30 text-[10px] font-bold uppercase tracking-widest mb-1">{t.xp} Progress</p>
            <p className="text-xl md:text-3xl font-black text-black dark:text-white">{currentUser?.xp} <span className="text-primary">XP</span></p>
          </div>
          <p className="text-black/30 dark:text-white/30 text-[10px] font-bold">LVL {(currentUser?.rank || 0)}</p>
        </div>
        <div className="h-2 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${((currentUser?.xp || 0) % 1600) / 16}%` }}
            className="h-full bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary-color),0.5)]"
          />
        </div>
      </div>

      {/* Rahee Pass Card */}
      <motion.div 
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowRaheePass(true)}
        className="relative overflow-hidden bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 p-6 rounded-[2.5rem] cursor-pointer shadow-lg shadow-yellow-500/20 group"
      >
        <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:scale-125 transition-transform">
          <Star size={80} fill="black" />
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h3 className="text-black font-black text-2xl uppercase tracking-tighter">{t.raheePass}</h3>
            <p className="text-black/60 text-xs font-bold uppercase tracking-widest mt-1">Exclusive Rewards & Stats</p>
          </div>
          <div className="w-12 h-12 bg-black/10 rounded-2xl flex items-center justify-center text-black">
             <Trophy size={28} />
          </div>
        </div>
      </motion.div>

      {/* Main Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleStartQuiz}
          className="relative h-28 sm:h-32 bg-primary rounded-[2rem] p-4 flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 text-black shadow-[0_20px_40px_rgba(var(--primary-color),0.2)] active:scale-95 transition-all group overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Play size={40} className="sm:w-20 sm:h-20" fill="currentColor" />
          </div>
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-all z-10 shrink-0">
            <Play size={20} className="sm:w-8 sm:h-8" fill="currentColor" />
          </div>
          <div className="flex flex-col items-start sm:items-center z-10">
            <span className="font-black text-sm sm:text-base uppercase tracking-tighter text-center">
              {(currentUser?.currentQuizIndex || 0) > 0 ? (lang === 'en' ? 'Resume' : 'फिर से शुरू करें') : t.startQuiz}
            </span>
          </div>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            if (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic) {
                // Topic is fixed
                return;
            }
            setShowTopicSelect(true);
          }}
          className={cn(
             "h-28 sm:h-32 bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/10 rounded-[2rem] p-4 flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 active:scale-95 transition-all hover:bg-black/10 dark:hover:bg-white/5 group",
             (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic) && "opacity-50 grayscale cursor-not-allowed"
          )}
        >
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary group-hover:rotate-90 transition-all shrink-0">
            <Grid size={20} className="sm:w-8 sm:h-8" />
          </div>
          <span className="font-black text-sm sm:text-base uppercase tracking-tighter text-black dark:text-white text-center leading-tight">
            {lang === 'en' ? (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic ? 'Topic Locked' : 'New Topic') : (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic ? 'विषय लॉक है' : 'नया विषय')}
          </span>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowMultiplayerHub(true)}
          className="h-28 sm:h-32 bg-primary/10 dark:bg-[#111] border border-primary/20 dark:border-white/10 rounded-[2rem] p-4 flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-4 active:scale-95 transition-all hover:bg-primary/20 group"
        >
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-primary rounded-2xl flex items-center justify-center text-black shadow-lg shadow-primary/20 group-hover:scale-110 transition-all shrink-0">
            <Swords size={20} className="sm:w-8 sm:h-8" />
          </div>
          <span className="font-black text-sm sm:text-base uppercase tracking-tighter text-black dark:text-white text-center leading-tight">
            {t.battleHub}
          </span>
        </motion.button>
      </div>

      {/* Stats Summary */}
      {(currentUser?.currentRound && currentUser.currentRound > 1 || currentUser?.currentQuizIndex && currentUser.currentQuizIndex > 0) && (
        <div className="space-y-4">
          <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-black/20 dark:text-white/20 ml-2">
            {lang === 'en' ? 'Active Topic' : 'सक्रिय विषय'}
          </h3>
          <div className="bg-black/5 dark:bg-[#111] p-5 rounded-[2rem] border border-black/5 dark:border-white/5 flex items-center justify-between">
             <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                   <HelpCircle size={24} />
                </div>
                <div>
                   <h4 className="font-bold text-black dark:text-white capitalize flex items-center gap-1.5 flex-wrap">
                      {topics.find(t => t.id === currentUser?.selectedTopicId)?.name || (currentUser?.selectedTopicId ? 'Topic Not Found' : 'Select Topic')}
                      {currentUser?.selectedSubTopicId && (
                         <>
                            <ChevronRight size={10} className="text-black/20 dark:text-white/20" />
                            <span className="text-[#32befa]">
                               {topics.find(t => t.id === currentUser?.selectedTopicId)?.subTopics?.[currentUser.selectedSubTopicId]?.name}
                            </span>
                         </>
                      )}
                      {currentUser?.selectedSubSubTopicId && (
                         <>
                            <ChevronRight size={10} className="text-black/20 dark:text-white/20" />
                            <span className="text-yellow-500">
                               {topics.find(t => t.id === currentUser?.selectedTopicId)?.subTopics?.[currentUser.selectedSubTopicId!]?.subSubTopics?.[currentUser.selectedSubSubTopicId]?.name}
                            </span>
                         </>
                      )}
                   </h4>
                   <p className="text-black/40 dark:text-white/40 text-xs">Round {currentUser?.currentRound || 1} • {currentUser?.currentQuizIndex || 0} Solved</p>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Admin Quick Access */}
      {currentUser?.role === 'admin' && (
        <button 
          onClick={() => setActiveTab('admin')}
          className="w-full bg-primary/10 border border-primary/20 rounded-[2rem] p-6 flex items-center justify-between text-primary group hover:bg-primary hover:text-black transition-all"
        >
          <div className="flex items-center gap-4">
            <Shield size={32} />
            <div className="text-left">
              <p className="font-black text-lg uppercase tracking-tighter">ADMIN PANEL</p>
              <p className="opacity-60 text-xs font-bold uppercase tracking-widest">Management Systems Ready</p>
            </div>
          </div>
          <ChevronRight size={20} />
        </button>
      )}
    </div>
    );
  };

  const lang = currentUser?.language || 'en';
  const t = translations[lang] || translations.en;

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      setShowSettings={setShowSettings} 
      setShowChat={setShowChat}
    >
      <AnimatePresence mode="wait">
        {activeTab === 'home' && (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderHome()}
          </motion.div>
        )}
        {activeTab === 'leaderboard' && <Leaderboard />}
        {activeTab === 'shop' && <Shop onClose={() => setActiveTab('home')} language={lang} />}
        {activeTab === 'friends' && <SocialHub onClose={() => setActiveTab('home')} allUsers={allUsers} totalQuizzesCount={totalQuizzesCount} />}
        {activeTab === 'events' && <Events />}
        {activeTab === 'admin' && currentUser?.role === 'admin' && <AdminPanel />}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showRaheePass && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowRaheePass(false)}
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
             />
             <motion.div 
               initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
               className="relative bg-white dark:bg-[#050505] w-full max-w-sm rounded-[3rem] overflow-hidden border border-black/5 dark:border-white/5"
             >
                 <div className="bg-primary p-8 pt-12 text-black">
                    <button 
                      onClick={() => setShowRaheePass(false)}
                      className="absolute top-6 right-6 p-2 bg-black/10 rounded-full hover:bg-black/20"
                    >
                      <X size={20} />
                    </button>
                    <div className="space-y-1 mb-8">
                       <h2 className="text-black font-black text-4xl uppercase tracking-tighter leading-none">{t.raheePass}</h2>
                       <p className="text-black/60 font-black text-sm uppercase tracking-widest">{currentUser?.name}</p>
                    </div>
                    <div className="bg-white dark:bg-black p-6 rounded-3xl shadow-xl border border-black/5 dark:border-white/5">
                       <div className="flex justify-between items-center mb-1">
                          <span className="text-black/40 dark:text-white/40 text-[8px] font-black uppercase tracking-widest">Total XP</span>
                          <div className="bg-yellow-500 text-black px-2 py-0.5 rounded text-[8px] font-black uppercase">Active</div>
                       </div>
                       <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-black text-black dark:text-white">{currentUser?.xp}</span>
                       </div>
                    </div>
                 </div>
                 <div className="p-8 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                          <p className="text-black/20 dark:text-white/20 text-[8px] font-black uppercase mb-1 tracking-widest">{t.rank}</p>
                          <p className="font-black uppercase text-sm">#{getUserRank(currentUser?.id || '')}</p>
                       </div>
                       <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                          <p className="text-black/20 dark:text-white/20 text-[8px] font-black uppercase mb-1 tracking-widest">Round</p>
                          <p className="font-black uppercase text-sm">R-{currentUser?.currentRound || 1}</p>
                       </div>
                    </div>
                    
                    <div className="space-y-2">
                       <p className="text-[10px] font-black uppercase tracking-widest text-black/30 dark:text-white/30 ml-1">Topic Performance</p>
                       <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                          {[...topics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(topic => {
                             const stat = currentUser?.scores?.[topic.id];
                             const percentage = stat ? Math.round((stat.correct / stat.total) * 100) : 0;
                             if (!stat) return null;
                             return (
                                <div key={topic.id} className="bg-black/5 dark:bg-white/5 p-3 rounded-xl flex items-center justify-between border border-black/5 dark:border-white/5">
                                   <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                         <HelpCircle size={14} />
                                      </div>
                                      <div>
                                         <p className="text-[10px] font-black uppercase tracking-tight">{topic.name}</p>
                                         <p className="text-[10px] text-black/40 dark:text-white/40">{stat.correct}/{stat.total} Correct</p>
                                      </div>
                                   </div>
                                   <div className="text-right">
                                      <p className="text-xs font-black text-primary">{percentage}%</p>
                                   </div>
                                </div>
                             );
                          })}
                       </div>
                    </div>

                    <button onClick={() => setShowRaheePass(false)} className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl font-black uppercase tracking-widest text-[10px]">Close Pass</button>
                 </div>
             </motion.div>
          </div>
        )}

        {showProfile && (
           <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowProfile(false)}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              />
              <motion.div 
                initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="relative bg-white dark:bg-[#111] w-full max-w-md rounded-[3rem] overflow-hidden border border-black/5 dark:border-white/10 p-8"
              >
                 <div className="flex items-center gap-6 mb-8">
                    <div className="relative group/avatar">
                       <div className="w-24 h-24 bg-primary rounded-[2rem] flex items-center justify-center text-black font-black text-4xl shadow-xl shadow-primary/20 overflow-hidden border-2 border-primary">
                          {currentUser?.avatarUrl || currentUser?.pendingAvatarUrl ? (
                             <img 
                               src={currentUser.pendingAvatarUrl || currentUser.avatarUrl} 
                               className={cn("w-full h-full object-cover", currentUser?.pendingAvatarUrl && "opacity-50")} 
                               alt="Avatar" 
                             />
                          ) : (
                             currentUser?.name?.[0].toUpperCase()
                          )}
                          {currentUser?.pendingAvatarUrl && (
                             <div className="absolute inset-0 flex items-center justify-center">
                                <Clock size={24} className="text-white drop-shadow-lg animate-pulse" />
                             </div>
                          )}
                       </div>
                       <button 
                         onClick={() => setIsEditingAvatar(!isEditingAvatar)}
                         className="absolute -bottom-2 -right-2 w-10 h-10 bg-white dark:bg-black rounded-2xl flex items-center justify-center text-primary shadow-xl border border-black/5 dark:border-white/10 active:scale-90 transition-all hover:bg-primary hover:text-black"
                       >
                          <Camera size={18} />
                       </button>
                    </div>
                    <div>
                       <h2 className="text-3xl font-black text-black dark:text-white leading-none mb-1">{currentUser?.name}</h2>
                       <p className="text-primary font-black uppercase tracking-widest text-xs italic">LVL {currentUser?.rank || 0} ELITE PLAYER</p>
                       {currentUser?.pendingAvatarUrl && (
                          <p className="text-[8px] font-black uppercase tracking-widest text-yellow-500 mt-1 flex items-center gap-1">
                             <Clock size={10} /> Pending Verification
                          </p>
                       )}
                    </div>
                 </div>

                 <AnimatePresence>
                    {isEditingAvatar && (
                       <motion.div 
                         initial={{ height: 0, opacity: 0 }}
                         animate={{ height: 'auto', opacity: 1 }}
                         exit={{ height: 0, opacity: 0 }}
                         className="overflow-hidden mb-8"
                       >
                          <div className="bg-black/5 dark:bg-white/5 p-6 rounded-[2rem] border border-black/5 dark:border-white/5 space-y-6">
                             <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                   <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Select Avatar</p>
                                   <div className="flex items-center gap-4">
                                      {(currentUser?.avatarUrl || currentUser?.pendingAvatarUrl) && (
                                         <button 
                                           onClick={() => selectAvatar('')}
                                           className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 transition-all"
                                         >
                                            Remove
                                         </button>
                                      )}
                                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary cursor-pointer hover:underline transition-all">
                                         <Upload size={14} />
                                         Upload Custom
                                         <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                                      </label>
                                   </div>
                                </div>
                                <div className="grid grid-cols-4 gap-3">
                                   {DEFAULT_AVATARS.map((url, i) => (
                                      <button 
                                        key={i}
                                        onClick={() => selectAvatar(url)}
                                        className={cn(
                                          "aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 active:scale-95",
                                          currentUser?.avatarUrl === url ? "border-primary bg-primary/10" : "border-transparent bg-black/5 dark:bg-white/5"
                                        )}
                                      >
                                         <img src={url} alt={`Avatar ${i}`} className="w-full h-full object-cover" />
                                      </button>
                                   ))}
                                </div>
                             </div>
                          </div>
                       </motion.div>
                    )}
                 </AnimatePresence>

                 <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl text-center border border-black/5 dark:border-white/5">
                       <p className="text-black/30 dark:text-white/30 text-[8px] font-black uppercase tracking-widest mb-1">XP</p>
                       <p className="text-xl font-black text-primary">{currentUser?.xp}</p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl text-center border border-black/5 dark:border-white/5">
                       <p className="text-black/30 dark:text-white/30 text-[8px] font-black uppercase tracking-widest mb-1">Rank</p>
                       <p className="text-xl font-black text-black dark:text-white">#{getUserRank(currentUser?.id || '')}</p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl text-center border border-black/5 dark:border-white/5">
                       <p className="text-black/30 dark:text-white/30 text-[8px] font-black uppercase tracking-widest mb-1">Coins</p>
                       <p className="text-xl font-black text-yellow-500">{currentUser?.raheeCoins || 0}</p>
                    </div>
                 </div>

                 <div className="space-y-4 mb-8">
                    <h3 className="font-black text-[10px] uppercase tracking-widest text-black/20 dark:text-white/20 ml-2">Lifetime Statistics</h3>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="flex items-center gap-4 bg-black/5 dark:bg-white/5 p-5 rounded-3xl border border-black/5 dark:border-white/5">
                          <div className="w-10 h-10 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-500"><Zap size={20} /></div>
                          <div>
                             <p className="text-[8px] font-black text-black/30 dark:text-white/30 uppercase tracking-widest leading-none">Accuracy</p>
                             <p className="text-lg font-black text-black dark:text-white">
                                {Math.round((currentUser?.stats?.correctAnswers || 0) / (currentUser?.stats?.totalAttempted || 1) * 100)}%
                             </p>
                          </div>
                       </div>
                       <div className="flex items-center gap-4 bg-black/5 dark:bg-white/5 p-5 rounded-3xl border border-black/5 dark:border-white/5">
                          <div className="w-10 h-10 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-500"><TrendingUp size={20} /></div>
                          <div>
                             <p className="text-[8px] font-black text-black/30 dark:text-white/30 uppercase tracking-widest leading-none">Solved</p>
                             <p className="text-lg font-black text-black dark:text-white">
                                {currentUser?.stats?.totalAttempted || 0}
                             </p>
                          </div>
                       </div>
                    </div>
                 </div>

                 <div className="space-y-4 mb-8">
                    <h3 className="font-black text-[10px] uppercase tracking-widest text-black/20 dark:text-white/20 ml-2">Topic Knowledge</h3>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                       {[...topics].filter(t => currentUser?.scores?.[t.id]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(topic => {
                          const score = currentUser?.scores?.[topic.id];
                          const percent = Math.round((score?.correct || 0) / (score?.total || 1) * 100);
                          return (
                             <div key={topic.id} className="space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tight">
                                   <span className="text-black dark:text-white">{topic.name}</span>
                                   <span className="text-primary">{percent}%</span>
                                </div>
                                <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                   <motion.div 
                                     initial={{ width: 0 }}
                                     animate={{ width: `${percent}%` }}
                                     className="h-full bg-primary rounded-full"
                                   />
                                </div>
                             </div>
                          );
                       })}
                    </div>
                 </div>

                 <button 
                   onClick={() => setShowProfile(false)}
                   className="w-full bg-black dark:bg-white text-white dark:text-black py-5 rounded-3xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
                 >
                    Close Profile
                 </button>
              </motion.div>
           </div>
        )}

        {showTopicSelect && (
           <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowTopicSelect(false)}
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
              />
              <motion.div 
                initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="relative bg-white dark:bg-[#0a0a0a] w-full max-w-md rounded-[3rem] overflow-hidden border border-black/5 dark:border-white/10 flex flex-col max-h-[85vh]"
              >
                 <div className="p-8 border-b border-black/5 dark:border-white/10 shrink-0 text-center relative">
                    <h2 className="text-2xl font-black text-black dark:text-white uppercase tracking-tighter leading-none mb-1">
                       {selectionPath.length > 0 ? selectionPath[selectionPath.length - 1].name : 'Select Topic'}
                    </h2>
                    <p className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">
                       {selectionPath.length > 0 ? 'Select Specialization' : 'Choose your interest'}
                    </p>
                    {selectionPath.length > 0 && (
                       <button 
                         onClick={() => setSelectionPath(selectionPath.slice(0, -1))}
                         className="absolute left-6 top-1/2 -translate-y-1/2 p-2 bg-black/5 dark:bg-white/5 rounded-xl text-black/40 dark:text-white/40 hover:text-primary transition-colors"
                       >
                          <ChevronRight size={20} className="rotate-180" />
                       </button>
                    )}
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <div className="space-y-4">
                      {selectionPath.length > 0 && (
                         <button 
                           onClick={() => startSelectedQuiz(getAllChildTopicIds(selectionPath[selectionPath.length-1]))}
                           className="w-full p-4 bg-primary/10 text-primary border border-primary/20 rounded-3xl flex items-center justify-center gap-3 font-black uppercase tracking-widest text-[10px] hover:bg-primary/20 transition-all mb-2"
                         >
                            <Play size={16} fill="currentColor" />
                            Play Entire Topic & Sub-topics
                         </button>
                      )}
                       <div className="space-y-3">
                          {(() => {
                             const currentOptions = (selectionPath.length === 0 
                                ? topics 
                                : Object.values(selectionPath[selectionPath.length - 1].children || {})) as Topic[];
                             
                             const sortedOptions = [...currentOptions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                             if (sortedOptions.length === 0) {
                                return (
                                  <div className="py-12 text-center bg-black/5 dark:bg-white/5 rounded-[2rem] border border-dashed border-black/10 dark:border-white/10">
                                     <HelpCircle className="mx-auto mb-2 text-black/10 dark:text-white/10" size={32} />
                                     <p className="text-black/40 dark:text-white/40 font-bold italic tracking-tighter text-sm px-8">No further sub-topics.</p>
                                  </div>
                                );
                             }

                             return sortedOptions.map((topic, tIdx) => (
                                <motion.div 
                                   key={`${topic.id}-${tIdx}`}
                                   className="flex gap-2"
                                >
                                   <motion.button 
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => toggleTopicSelection(topic.id)}
                                      className={cn(
                                         "w-14 h-auto rounded-3xl flex items-center justify-center transition-all border shrink-0",
                                         selectedTopicIds.includes(topic.id)
                                            ? "bg-primary text-black border-primary"
                                            : "bg-black/5 dark:bg-white/5 text-black/20 dark:text-white/20 border-black/5 dark:border-white/5"
                                      )}
                                   >
                                      {selectedTopicIds.includes(topic.id) ? <Check size={20} strokeWidth={4} /> : <div className="w-5 h-5 rounded-md border-2 border-current opacity-20" />}
                                   </motion.button>

                                   <motion.button 
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={async () => {
                                         if (!currentUser) return;
                                         if (topic.children && Object.keys(topic.children).length > 0) {
                                            setSelectionPath([...selectionPath, topic]);
                                         } else {
                                            startSelectedQuiz([topic.id]);
                                         }
                                      }}
                                      className={cn(
                                         "flex-1 p-5 rounded-3xl flex items-center gap-4 transition-all border overflow-hidden",
                                         currentUser?.selectedTopicId === topic.id 
                                            ? "bg-primary/20 text-primary border-primary/20" 
                                            : "bg-black/5 dark:bg-white/5 text-black dark:text-white border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                                      )}
                                   >
                                      <div className={cn(
                                         "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shrink-0",
                                         currentUser?.selectedTopicId === topic.id ? "bg-primary text-black" : "bg-primary/20 text-primary"
                                      )}>
                                         <HelpCircle size={24} />
                                      </div>
                                      <div className="text-left overflow-hidden flex-1">
                                         <h4 className="font-black uppercase tracking-tighter text-lg leading-none mb-1 truncate">{topic.name}</h4>
                                         <div className="flex gap-1.5 items-center">
                                            <span className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">
                                               {topic.children && Object.keys(topic.children).length > 0 ? `${Object.keys(topic.children).length} Specialties` : 'Explore this topic'}
                                            </span>
                                         </div>
                                      </div>
                                      {topic.children && Object.keys(topic.children).length > 0 && <ChevronRight size={16} className="text-black/20 dark:text-white/20" />}
                                   </motion.button>
                                </motion.div>
                             ));
                          })()}
                       </div>
                    </div>
                 </div>

                 <div className="p-6 shrink-0 bg-white/50 dark:bg-[#0a0a0a]/50 backdrop-blur-md border-t border-black/5 dark:border-white/10">
                    {selectedTopicIds.length > 0 && (
                       <button 
                         onClick={() => startSelectedQuiz()}
                         className="w-full bg-primary text-black py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all mb-3 flex items-center justify-center gap-2"
                       >
                          <Play size={16} fill="currentColor" />
                          Start Mixed Mode ({selectedTopicIds.length})
                       </button>
                    )}
                    <button onClick={() => setShowTopicSelect(false)} className="w-full bg-[#32befa] text-black py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">Close</button>
                 </div>
              </motion.div>
           </div>
        )}

        {showQuiz && <QuizScreen onClose={() => setShowQuiz(false)} language={lang} topicIds={currentUser?.selectedTopicIds} />}
        {showSettings && <Settings onClose={() => setShowSettings(false)} onShowFeedback={() => setShowFeedback(true)} />}
        {showFeedback && <Feedback onClose={() => setShowFeedback(false)} />}
        
        {/* Lives Refill Modal */}
        <AnimatePresence>
          {showLivesModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
               <motion.div 
                 initial={{ opacity: 0 }} 
                 animate={{ opacity: 1 }} 
                 exit={{ opacity: 0 }}
                 onClick={() => setShowLivesModal(false)}
                 className="absolute inset-0 bg-black/90 backdrop-blur-xl"
               />
               <motion.div 
                 initial={{ scale: 0.9, y: 20, opacity: 0 }}
                 animate={{ scale: 1, y: 0, opacity: 1 }}
                 exit={{ scale: 0.9, y: 20, opacity: 0 }}
                 className="relative bg-white dark:bg-[#111] w-full max-w-sm rounded-[3rem] overflow-hidden border border-black/5 dark:border-white/10 p-8 text-center"
               >
                  <div className="w-24 h-24 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center text-red-500 mx-auto mb-6">
                     <Heart size={48} className="fill-red-500" />
                  </div>
                  
                  <h3 className="text-2xl font-black text-black dark:text-white uppercase tracking-tighter mb-2">Lives Refill</h3>
                  <p className="text-black/40 dark:text-white/40 font-bold text-xs uppercase tracking-widest mb-8 leading-relaxed">
                     Lives are used to play quizzes. You get 1 life back every 15 minutes.
                  </p>

                  <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/5 mb-8">
                     <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Current Balance</span>
                        <span className="text-xl font-black text-red-500">{currentUser?.lives?.count || 0}/{MAX_LIVES}</span>
                     </div>
                     
                     {(currentUser?.lives?.count || 0) < MAX_LIVES ? (
                        <div className="space-y-1">
                           <div className="flex justify-between items-end">
                              <span className="text-[8px] font-black uppercase tracking-widest text-black/20 dark:text-white/20">Next Refill In</span>
                              <span className="text-lg font-black text-black dark:text-white tabular-nums">
                                 {Math.floor(refillTimeLeft / 60000)}:{(Math.floor((refillTimeLeft % 60000) / 1000)).toString().padStart(2, '0')}
                              </span>
                           </div>
                           <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={false}
                                animate={{ width: `${(1 - refillTimeLeft / REFILL_INTERVAL) * 100}%` }}
                                className="h-full bg-red-500"
                              />
                           </div>
                        </div>
                     ) : (
                        <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">Maximum focus reached!</p>
                     )}
                  </div>

                  <div className="flex flex-col gap-3">
                     <button 
                       onClick={() => {
                          setShowLivesModal(false);
                          setActiveTab('shop');
                          // Use a shortcut to lives section in shop
                          setTimeout(() => {
                             const el = document.getElementById('shop-lives');
                             el?.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                       }}
                       className="w-full py-5 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        <ShoppingBag size={18} />
                        Buy More Lives
                   </button>
                   <button 
                     onClick={() => setShowLivesModal(false)}
                     className="w-full py-5 text-black/40 dark:text-white/40 font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all"
                   >
                      Maybe Later
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
        {showChat && <Chat onClose={() => setShowChat(false)} />}
        {showHistory && <History onClose={() => setShowHistory(false)} />}
        {showMultiplayerHub && (
          <MultiplayerHub 
            onClose={() => setShowMultiplayerHub(false)} 
            allUsers={allUsers}
            onStartMatch={(roomId, isBot) => {
              setMultiRoomId(roomId);
              setIsBotMatch(isBot);
              setShowMultiplayerHub(false);
            }}
          />
        )}
        {multiRoomId && !isMatchMinimized && (
          <MultiplayerGame 
            roomId={multiRoomId} 
            isBot={isBotMatch} 
            onClose={() => setMultiRoomId(null)} 
            onMinimize={() => setIsMatchMinimized(true)}
          />
        )}

        {/* Resumable Match Bubble */}
        {multiRoomId && isMatchMinimized && (
           <motion.div
             initial={{ scale: 0.5, opacity: 0, x: 50 }}
             animate={{ scale: 1, opacity: 1, x: 0 }}
             onClick={() => setIsMatchMinimized(false)}
             className="fixed bottom-24 right-6 z-[90] bg-primary text-black p-4 rounded-3xl shadow-2xl shadow-primary/40 cursor-pointer flex items-center gap-3 active:scale-95 transition-all border-4 border-black group"
           >
              <div className="w-10 h-10 bg-black/10 rounded-xl flex items-center justify-center animate-pulse">
                 <Swords size={20} />
              </div>
              <div className="pr-2">
                 <p className="text-[8px] font-black uppercase tracking-widest leading-none mb-1 opacity-60">Match Active</p>
                 <p className="text-xs font-black uppercase tracking-tighter">Resume Battle</p>
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full border-2 border-primary flex items-center justify-center text-[10px] font-black text-white">
                 !
              </div>
           </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
