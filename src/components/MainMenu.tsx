import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, ShoppingBag, TrendingUp, Users, Settings as SettingsIcon, 
  Trophy, Grid, Star, LogOut, Shield, Swords, Zap, RefreshCw, 
  MessageSquare, ChevronRight, Moon, Sun, Coins, HelpCircle, 
  History as HistoryIcon, Clock, X, XCircle
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import Layout from './Layout';
import QuizScreen from './QuizScreen';
import Leaderboard from './Leaderboard';
import Shop from './Shop';
import Settings from './Settings';
import SocialHub from './SocialHub';
import MultiplayerHub from './MultiplayerHub';
import MultiplayerGame from './MultiplayerGame';
import AdminPanel from './AdminPanel';
import ScoreCard from './ScoreCard';
import History from './History';
import Chat from './Chat';
import { db } from '../firebase/config';
import { ref, onValue, update } from 'firebase/database';
import { User } from '../types';
import { translations } from '../translations';
import { cn } from '../lib/utils';

export default function MainMenu() {
  const { currentUser, setCurrentUser } = useUser();
  const { isDark, setIsDark } = useTheme();
  const [activeTab, setActiveTab] = useState<'home' | 'leaderboard' | 'shop' | 'friends' | 'admin' | 'event'>('home');
  const [showQuiz, setShowQuiz] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showRaheePass, setShowRaheePass] = useState(false);
  const [showTopicSelect, setShowTopicSelect] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMultiplayerHub, setShowMultiplayerHub] = useState(false);
  const [multiRoomId, setMultiRoomId] = useState<string | null>(null);
  const [isBotMatch, setIsBotMatch] = useState(false);
  const [rating, setRating] = useState(0);
  const [showScoreCard, setShowScoreCard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [totalQuizzesCount, setTotalQuizzesCount] = useState(0);

  useEffect(() => {
    const usersRef = ref(db, 'users');
    const unsubscribe = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setAllUsers(Object.values(data));
      }
    });

    const quizzesRef = ref(db, 'quizzes');
    onValue(quizzesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTotalQuizzesCount(Object.keys(data).length);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleStartQuiz = () => {
     setShowQuiz(true);
  };

  const resetProgress = async () => {
    if (!currentUser) return;
    if (confirm("Reset current round progress?")) {
        await update(ref(db, `users/${currentUser.id}`), {
          currentQuizIndex: 0
        });
    }
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
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-black font-black text-2xl shadow-[0_0_20px_rgba(var(--primary-color),0.3)]">
            {currentUser?.name?.[0].toUpperCase()}
          </div>
          <div>
            <h2 className="text-2xl font-black flex items-center gap-2">
              {currentUser?.name}
              {currentUser?.role === 'admin' && <Shield size={18} className="text-primary" />}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <button 
                onClick={toggleLanguage}
                className="px-2 py-0.5 bg-primary/10 text-primary text-[8px] font-black rounded uppercase tracking-widest border border-primary/20 hover:bg-primary hover:text-black transition-all"
              >
                {lang === 'en' ? 'English' : 'हिंदी'}
              </button>
              <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest leading-none">{t.rank} #{userRank}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 px-4 bg-white/5 rounded-xl border border-white/5 mr-2">
             <Coins size={16} className="text-primary italic" />
             <span className="text-sm font-black text-primary">{currentUser?.raheeCoins || 0}</span>
          </div>
          <button 
            onClick={() => setActiveTab('shop')}
            className="p-3 bg-primary/10 text-primary rounded-xl border border-primary/20 hover:bg-primary hover:text-black transition-colors"
          >
            <ShoppingBag size={20} />
          </button>
          <button 
            onClick={() => setIsDark(!isDark)}
            className="p-3 bg-white/5 rounded-xl text-white/40 hover:text-primary transition-colors"
          >
            {isDark ? <Sun size={20} /> : <Moon size={20} />}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleStartQuiz}
          className="relative aspect-auto sm:aspect-square h-24 sm:h-auto bg-primary rounded-[2rem] md:rounded-[2.5rem] p-6 flex flex-row sm:flex-col items-center justify-center gap-4 text-black shadow-[0_20px_40px_rgba(var(--primary-color),0.2)] active:scale-95 transition-all group overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Play size={80} fill="currentColor" />
          </div>
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-all z-10 shrink-0">
            <Play size={24} className="sm:w-10 sm:h-10" fill="currentColor" />
          </div>
          <div className="flex flex-col items-start sm:items-center z-10">
            <span className="font-black text-lg sm:text-xl uppercase tracking-tighter">
              {(currentUser?.currentQuizIndex || 0) > 0 ? (lang === 'en' ? 'Resume' : 'जारी रखें') : t.startQuiz}
            </span>
            {(currentUser?.currentQuizIndex || 0) > 0 && (
              <span className="text-[10px] font-black uppercase opacity-60">Round {currentUser?.currentRound}</span>
            )}
          </div>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowTopicSelect(true)}
          className="aspect-auto sm:aspect-square h-24 sm:h-auto bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/10 rounded-[2rem] md:rounded-[2.5rem] p-6 flex flex-row sm:flex-col items-center justify-center gap-4 active:scale-95 transition-all hover:bg-black/10 dark:hover:bg-white/5 group"
        >
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary group-hover:rotate-90 transition-all shrink-0">
            <Grid size={24} className="sm:w-10 sm:h-10" />
          </div>
          <span className="font-black text-lg sm:text-xl uppercase tracking-tighter text-black dark:text-white">{lang === 'en' ? 'New Topic' : 'नया विषय'}</span>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowMultiplayerHub(true)}
          className="aspect-auto sm:aspect-square h-24 sm:h-auto bg-primary/10 dark:bg-[#111] border border-primary/20 dark:border-white/10 rounded-[2rem] md:rounded-[2.5rem] p-6 flex flex-row sm:flex-col items-center justify-center gap-4 active:scale-95 transition-all hover:bg-primary/20 group"
        >
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-2xl flex items-center justify-center text-black shadow-lg shadow-primary/20 group-hover:scale-110 transition-all shrink-0">
            <Swords size={24} className="sm:w-10 sm:h-10" />
          </div>
          <span className="font-black text-lg sm:text-xl uppercase tracking-tighter text-black dark:text-white">{t.battleHub}</span>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setActiveTab('friends')}
          className="aspect-auto sm:aspect-square h-24 sm:h-auto bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/10 rounded-[2rem] md:rounded-[2.5rem] p-6 flex flex-row sm:flex-col items-center justify-center gap-4 active:scale-95 transition-all hover:bg-black/10 dark:hover:bg-white/5 group"
        >
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary group-hover:scale-110 transition-all shrink-0">
            <Users size={24} className="sm:w-10 sm:h-10" />
          </div>
          <span className="font-black text-lg sm:text-xl uppercase tracking-tighter text-black dark:text-white">{t.friends}</span>
        </motion.button>
      </div>

      {/* Stats Summary */}
      <div className="space-y-4">
        <h3 className="font-black text-sm uppercase tracking-widest text-white/20">{lang === 'en' ? 'Active Topic' : 'सक्रिय विषय'}</h3>
        <div className="bg-black/5 dark:bg-[#111] p-5 rounded-[2rem] border border-black/5 dark:border-white/5 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                 <HelpCircle size={24} />
              </div>
              <div>
                 <h4 className="font-bold text-black dark:text-white capitalize">{currentUser?.selectedTopicId || 'General'}</h4>
                 <p className="text-black/40 dark:text-white/40 text-xs">Round {currentUser?.currentRound || 1} • {currentUser?.currentQuizIndex || 0} Solved</p>
              </div>
           </div>
           <button 
             onClick={resetProgress}
             className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
           >
              <RefreshCw size={18} />
           </button>
        </div>
      </div>

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
        {activeTab === 'admin' && currentUser?.role === 'admin' && <AdminPanel />}
        
        {activeTab === 'event' && (
          <div className="flex flex-col items-center justify-center h-[70vh] text-center p-8">
             <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6">
                <TrendingUp size={48} className="text-primary/20" />
             </div>
             <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Events Coming Soon</h2>
             <p className="text-white/40 text-sm max-w-xs text-pretty italic">We are working hard to bring this feature to the community.</p>
          </div>
        )}
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
                    <div className="bg-black p-6 rounded-3xl shadow-xl">
                       <div className="flex justify-between items-center mb-1">
                          <span className="text-white/40 text-[8px] font-black uppercase tracking-widest">Total XP</span>
                          <div className="bg-yellow-500 text-black px-2 py-0.5 rounded text-[8px] font-black uppercase">Active</div>
                       </div>
                       <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-black text-white">{currentUser?.xp}</span>
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
                    <button onClick={() => setShowRaheePass(false)} className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl font-black uppercase tracking-widest text-[10px]">Close Pass</button>
                 </div>
             </motion.div>
          </div>
        )}
        {showQuiz && <QuizScreen onClose={() => setShowQuiz(false)} language={lang} />}
        {showSettings && <Settings onClose={() => setShowSettings(false)} onShowFeedback={() => setShowFeedback(true)} />}
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
        {multiRoomId && (
          <MultiplayerGame 
            roomId={multiRoomId} 
            isBot={isBotMatch} 
            onClose={() => setMultiRoomId(null)} 
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
