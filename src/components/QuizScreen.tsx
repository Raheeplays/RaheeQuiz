import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDialog } from '../contexts/DialogContext';
import { db } from '../firebase/config';
import { ref, onValue, set, get, push, update } from 'firebase/database';
import { Quiz, User, QuizHistory } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Volume2, VolumeX, MessageSquare, Globe, ChevronRight, Check, AlertCircle, Clock, Trophy, Settings as SettingsIcon, Zap, RefreshCw, Star, Shield, Send, Moon, Sun, Users, Lightbulb } from 'lucide-react';
import { cn } from '../lib/utils';
import WinnerLoserScreen from './WinnerLoserScreen';
import Settings from './Settings';
import RoundCard from './RoundCard';
import Dialog from './ui/Dialog';
import History from './History';
import Feedback from './Feedback';

import { Skeleton } from './ui/Skeleton';

export default function QuizScreen({ onClose, language: initialLanguage = 'en', eventId, topicIds: propTopicIds }: { onClose: () => void, language?: 'en' | 'hi', eventId?: string, topicIds?: string[] }) {
  const { currentUser, settings } = useUser();
  const [quizTimeLeft, setQuizTimeLeft] = useState(16);
  const { isDark, setIsDark, soundEnabled, vibrationEnabled, customization } = useTheme();

  // Sync initial timer with settings
  useEffect(() => {
    if (settings?.quizTimerSeconds && currentIndex === 0 && !isAnswered) {
      setQuizTimeLeft(settings.quizTimerSeconds);
    }
  }, [settings?.quizTimerSeconds]);
  const { confirm, alert } = useDialog();
  
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentIndex, setCurrentIndex] = useState(eventId ? 0 : (currentUser?.currentQuizIndex || 0));
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>(initialLanguage);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [pollResults, setPollResults] = useState<number[] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRoundComplete, setShowRoundComplete] = useState(false);
  const [roundStats, setRoundStats] = useState({ correct: 0, incorrect: 0, unattempted: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<QuizHistory[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [eventData, setEventData] = useState<any | null>(null);
  const [questionOrder, setQuestionOrder] = useState<'random' | 'sequential'>('random');
  
  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [showSpecialPin, setShowSpecialPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showSpecialChat, setShowSpecialChat] = useState(false);
  const [specialMessage, setSpecialMessage] = useState('');
  const [mySpecialMessages, setMySpecialMessages] = useState<any[]>([]);

  useEffect(() => {
    if (currentUser?.id) {
      onValue(ref(db, `specialMessages/${currentUser.id}`), s => {
        if (s.exists()) {
          setMySpecialMessages(Object.entries(s.val()).map(([id, val]: [string, any]) => ({ ...val, id })));
        } else {
          setMySpecialMessages([]);
        }
      });
    }
  }, [currentUser?.id]);

  // Track last played time when player quits the quiz screen to go back to main screen
  useEffect(() => {
    return () => {
      if (currentUser?.id) {
        const nowTimeStr = new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'medium'
        });
        update(ref(db, `users/${currentUser.id}`), {
          lastPlayedTime: nowTimeStr,
          lastPlayedDate: new Date().toISOString().split('T')[0]
         }).catch((e) => console.error("Failed to update lastPlayedTime on quiz exit:", e));
      }
    };
  }, [currentUser?.id]);

  // Quiz activity real-time simulation sync
  useEffect(() => {
    if (!currentUser?.id) return;

    const actQuizState = {
      activeTab: 'quiz',
      showQuiz: true,
      activeExamId: eventId || "",
      quizIndexVal: currentIndex,
      selectedOptionVal: selectedOption,
      isAnsweredVal: isAnswered,
      quizTimeLeftVal: quizTimeLeft,
      activeQuestionText: quizzes[currentIndex]?.question || '',
      activeQuestionOptions: quizzes[currentIndex]?.options || [],
      correctOptionIndex: quizzes[currentIndex]?.answer !== undefined ? quizzes[currentIndex]?.answer : null,
      isDarkObj: isDark,
      lastUpdated: Date.now()
    };

    const activeStateRef = ref(db, `users/${currentUser.id}/activeState`);
    set(activeStateRef, actQuizState).catch(err => console.error("Active state quiz sync failed:", err));
  }, [
    currentUser?.id,
    eventId,
    quizzes,
    currentIndex,
    selectedOption,
    isAnswered,
    quizTimeLeft,
    isDark
  ]);
  
  const targetTopicIdsRaw = eventId ? (propTopicIds || []) : (propTopicIds || (currentUser?.selectedTopicIds || (currentUser?.selectedNicheId ? [currentUser.selectedNicheId] : (currentUser?.selectedTopicId ? [currentUser.selectedTopicId] : []))));
  const targetTopicIdsStr = JSON.stringify(targetTopicIdsRaw);
  const targetTopicIds = React.useMemo(() => {
    try {
      return JSON.parse(targetTopicIdsStr);
    } catch {
      return [];
    }
  }, [targetTopicIdsStr]);

  useEffect(() => {
    // Fetch Global Question Order setting
    onValue(ref(db, 'customNotifications/questionOrder'), (snapshot) => {
      if (snapshot.exists()) {
        setQuestionOrder(snapshot.val());
      }
    });

    if (eventId) {
      const eventRef = ref(db, `events/${eventId}`);
      onValue(eventRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setEventData(data);
          
          if (data.type === 'exam') {
            const timeUntilEnd = Math.floor((data.endTime - Date.now()) / 1000);
            setTimeLeft(timeUntilEnd);
          } else if (data.hasTimer && timeLeft === null) {
            setTimeLeft(data.timerDuration * 60);
          }
        }
      });
    }
  }, [eventId]);

  const completeQuiz = async (finalAnswers?: any[]) => {
    if (eventId && currentUser) {
      const answersToSave = finalAnswers || history.map(h => ({
        quizId: h.quizId,
        userAnswerIndex: h.userAnswerIndex,
        isCorrect: h.isCorrect
      }));

      await update(ref(db, `events/${eventId}/results/${currentUser.id}`), {
        score: roundStats.correct,
        total: quizzes.length,
        completedAt: Date.now(),
        answers: answersToSave
      });
    }
    setShowResult(true);
  };

  useEffect(() => {
    if (!targetTopicIds || (Array.isArray(targetTopicIds) && targetTopicIds.length === 0)) {
      setLoading(false);
      return;
    }

    const fetchAllQuizzes = async () => {
      let combined: Quiz[] = [];
      const ids = Array.isArray(targetTopicIds) ? targetTopicIds : [targetTopicIds];
      
      for (const tid of ids) {
        const quizzesRef = ref(db, `topicQuizzes/${tid}`);
        const snap = await get(quizzesRef);
        if (snap.exists()) {
          combined = [...combined, ...Object.values(snap.val()) as Quiz[]];
        }
      }

      if (combined.length > 0) {
        if (questionOrder === 'random') {
          const seed = currentUser?.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
          const shuffled = [...combined].sort((a, b) => {
            const pseudoRandomA = Math.sin(seed + a.id.length) * 10000;
            const pseudoRandomB = Math.sin(seed + b.id.length) * 10000;
            return (pseudoRandomA - Math.floor(pseudoRandomA)) - (pseudoRandomB - Math.floor(pseudoRandomB));
          });
          setQuizzes(shuffled);
        } else {
          setQuizzes([...combined].sort((a, b) => a.id.localeCompare(b.id)));
        }
      } else {
        setQuizzes([]);
      }
      setLoading(false);
    };

    fetchAllQuizzes();
  }, [targetTopicIdsStr, questionOrder]);

  const QUESTIONS_PER_ROUND = 10;
  const absoluteIndex = ((currentUser?.currentRound || 1) - 1) * QUESTIONS_PER_ROUND + currentIndex + skippedCount;

  const livesActive = settings?.livesEnabledForAll && currentUser?.lives?.enabled;

  // Global Event Timer
  useEffect(() => {
    if (timeLeft !== null && timeLeft > 0 && !showRoundComplete && !showResult) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            completeQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft, showRoundComplete, showResult]);

  // Per-Question Timer
  useEffect(() => {
    if (settings?.quizTimerEnabled === false) return;
    
    if (!isAnswered && !showRoundComplete && !showResult && quizTimeLeft > 0 && !loading) {
      const timer = setInterval(() => {
        setQuizTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            handleAnswer(-1); // -1 means time out
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [quizTimeLeft, isAnswered, showRoundComplete, showResult, loading, settings?.quizTimerEnabled]);

  // Admin Auto Correct
  useEffect(() => {
    if (currentUser?.role === 'admin' && currentUser?.autoCorrectEnabled && !isAnswered && !loading && quizzes[absoluteIndex] && !showRoundComplete && !showResult) {
      const timer = setTimeout(() => {
        handleAnswer(quizzes[absoluteIndex].correctAnswerIndex);
      }, 1000); // Small delay for UX
      return () => clearTimeout(timer);
    }
  }, [currentIndex, absoluteIndex, isAnswered, loading, currentUser?.autoCorrectEnabled, showRoundComplete, showResult]);

  const handleSendSpecialMessage = async () => {
    if (!specialMessage.trim() || !currentUser) return;
    
    const msg = {
      userName: currentUser.name,
      text: specialMessage,
      timestamp: Date.now()
    };
    
    await push(ref(db, `specialMessages/${currentUser.id}`), msg);
    setSpecialMessage('');
  };

  const handleAnswer = async (index: number) => {
    if (isAnswered || !currentUser || !quizzes[absoluteIndex]) return;
    
    // Check for lives
    if (livesActive && (currentUser.lives?.count || 0) <= 0) {
      alert({ title: 'No Lives Left', description: 'Your lives will refill every 16 minutes. You can also get more from the shop.', type: 'error' });
      return;
    }

    setSelectedOption(index);
    setIsAnswered(true);

    const isCorrect = index === quizzes[absoluteIndex].correctAnswerIndex;
    const xpGain = isCorrect ? 100 : 0;
    
    // Play feedback
    if (soundEnabled) {
      const audio = new Audio(isCorrect 
        ? (customization?.correctSound || 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3')
        : (customization?.incorrectSound || 'https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3')
      );
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Audio playback failed', e));
    }
    
    if (vibrationEnabled && (customization?.vibrationEnabled !== false) && navigator.vibrate) {
      const duration = isCorrect 
        ? (customization?.correctVibration || 50) 
        : (customization?.incorrectVibration || 200);
      navigator.vibrate(duration);
    }

    // Update round stats
    setRoundStats(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      incorrect: prev.incorrect + (!isCorrect && index !== -1 ? 1 : 0),
      unattempted: prev.unattempted + (index === -1 ? 1 : 0)
    }));

    const globalHistoryRef = push(ref(db, 'history'));
    const historyId = globalHistoryRef.key || Date.now().toString();

    // Update local history
    const historyEntry: QuizHistory = {
      id: historyId,
      userId: currentUser.id,
      quizId: quizzes[absoluteIndex].id,
      userAnswerIndex: index,
      isCorrect,
      timestamp: Date.now(),
      language: language,
      theme: isDark ? 'dark' : 'light'
    };
    setHistory(prev => [...prev, historyEntry]);

    // Update User Stats in RTDB
    const newXp = (currentUser.xp || 0) + xpGain;
    const newDailyXp = (currentUser.dailyXP || 0) + xpGain;
    const newWeeklyXp = (currentUser.weeklyXP || 0) + xpGain;
    const newRank = Math.floor(newXp / 1600) + 1;
    const newIndex = currentIndex + 1;

    // Push to global history collection
    await set(globalHistoryRef, historyEntry);

    const currentTopicId = Array.isArray(targetTopicIds) 
      ? targetTopicIds[targetTopicIds.length - 1] 
      : (targetTopicIds || 'general');

    const saveSession = async () => {
      if (!currentUser?.id) {
        console.error('Cannot save session: currentUser.id is missing');
        return;
      }
      const sessionRef = push(ref(db, 'sessionHistory'));
      const sessionData = {
        id: sessionRef.key,
        userId: currentUser.id,
        topicId: currentTopicId,
        score: roundStats.correct + (isCorrect ? 1 : 0),
        total: (newIndex >= (eventId ? quizzes.length : QUESTIONS_PER_ROUND)) ? newIndex : newIndex,
        timestamp: Date.now(),
        language: language,
        theme: isDark ? 'dark' : 'light',
        answers: [...history, historyEntry].map(h => ({
          quizId: h.quizId,
          userAnswerIndex: h.userAnswerIndex,
          isCorrect: h.isCorrect
        }))
      };
      console.log('Saving session history:', sessionData);
      await set(sessionRef, sessionData);
    };

    const currentTopicScores = currentUser.scores?.[currentTopicId] || { correct: 0, total: 0, unattempted: 0 };
    
    // Streak logic
    const today = new Date().toISOString().split('T')[0];
    let newStreak = currentUser.streak || 0;
    if (currentUser.lastPlayedDate !== today) {
        if (!currentUser.lastPlayedDate) {
            newStreak = 1;
        } else {
            const lastPlayed = new Date(currentUser.lastPlayedDate);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().split('T')[0];
            
            if (currentUser.lastPlayedDate === yesterdayStr) {
                newStreak += 1;
            } else {
                newStreak = 1;
            }
        }
    }

    let bonusCoins = 0;
    const totalQuizzesSolved = ((currentUser.currentRound - 1) * QUESTIONS_PER_ROUND) + newIndex;
    if (totalQuizzesSolved > 0 && totalQuizzesSolved % 16 === 0) {
      bonusCoins = 100;
    }

    // Lives deduction
    let newLives = currentUser.lives;
    if (livesActive && !isCorrect && index !== -1) {
      newLives = {
        ...currentUser.lives!,
        count: Math.max(0, currentUser.lives!.count - 1),
        lastRefill: currentUser.lives!.count === 16 ? Date.now() : currentUser.lives!.lastRefill
      };
    }

    const updates: Partial<User> = {
      xp: newXp,
      dailyXP: newDailyXp,
      weeklyXP: newWeeklyXp,
      rank: newRank,
      streak: newStreak,
      lastPlayedDate: today,
      lastPlayedTime: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      }),
      playedDates: Array.from(new Set([...(currentUser.playedDates || []), today])),
      lives: newLives,
      currentQuizIndex: newIndex,
      raheeCoins: (currentUser.raheeCoins || 0) + bonusCoins,
      stats: {
        totalAttempted: (currentUser.stats?.totalAttempted || 0) + 1,
        correctAnswers: (currentUser.stats?.correctAnswers || 0) + (isCorrect ? 1 : 0),
        incorrectAnswers: (currentUser.stats?.incorrectAnswers || 0) + (!isCorrect && index !== -1 ? 1 : 0),
        unattemptedAnswers: (currentUser.stats?.unattemptedAnswers || 0) + (index === -1 ? 1 : 0)
      },
      scores: {
        ...(currentUser.scores || {}),
        [currentTopicId]: {
          correct: currentTopicScores.correct + (isCorrect ? 1 : 0),
          total: currentTopicScores.total + 1,
          unattempted: (currentTopicScores.unattempted || 0) + (index === -1 ? 1 : 0)
        }
      }
    };

    if (newIndex >= (eventId ? quizzes.length : QUESTIONS_PER_ROUND)) {
      if (!eventId) {
        updates.currentQuizIndex = 0;
        updates.currentRound = (currentUser.currentRound || 1) + 1;
      }
      
      await saveSession();
      
      const finalAnswers = [...history, historyEntry].map(h => ({
        quizId: h.quizId,
        userAnswerIndex: h.userAnswerIndex,
        isCorrect: h.isCorrect
      }));

      setTimeout(async () => {
        if (eventId) {
          await completeQuiz(finalAnswers);
        } else {
          setShowRoundComplete(true);
        }
      }, 1500);
    } else {
      setTimeout(() => {
        nextQuestion();
      }, 2000);
    }

    if (!eventId) {
      const payload = { ...currentUser, ...updates };
      Object.keys(payload).forEach(key => {
        if ((payload as any)[key] === undefined) {
          delete (payload as any)[key];
        }
      });
      await set(ref(db, `users/${currentUser.id}`), payload);
    }
  };

  const nextQuestion = () => {
    setSelectedOption(null);
    setIsAnswered(false);
    setHiddenOptions([]);
    setPollResults(null);
    setShowHint(false);
    setQuizTimeLeft(settings?.quizTimerSeconds || 30);
    setCurrentIndex(prev => prev + 1);
  };

  const useFiftyFifty = async () => {
    if (!currentUser || isAnswered || (currentUser.lifelines?.fiftyFifty || 0) <= 0 || hiddenOptions.length > 0) return;
    
    const correctIdx = currentQuiz.correctAnswerIndex;
    const wrongIndices = [0, 1, 2, 3].filter(i => i !== correctIdx);
    
    // Pick 2 random wrong ones to hide
    const toHide = [...wrongIndices].sort(() => Math.random() - 0.5).slice(0, 2);
    setHiddenOptions(toHide);

    // Consume lifeline
    await set(ref(db, `users/${currentUser.id}/lifelines/fiftyFifty`), (currentUser.lifelines?.fiftyFifty || 0) - 1);
  };

  const useAudiencePoll = async () => {
    if (!currentUser || isAnswered || (currentUser.lifelines?.audiencePoll || 0) <= 0 || pollResults) return;

    const correctIdx = currentQuiz.correctAnswerIndex;
    let results = [0, 0, 0, 0];
    
    // Distribute 100 points
    let remaining = 100;
    
    // Favored correct answer
    const correctPercent = Math.floor(Math.random() * 30) + 40; // 40-70%
    results[correctIdx] = correctPercent;
    remaining -= correctPercent;
    
    // Distribute remaining among others
    const others = [0, 1, 2, 3].filter(i => i !== correctIdx);
    for (let i = 0; i < 2; i++) {
        const p = Math.floor(Math.random() * (remaining / (3 - i)));
        results[others[i]] = p;
        remaining -= p;
    }
    results[others[2]] = remaining;

    setPollResults(results);

    // Consume lifeline
    await set(ref(db, `users/${currentUser.id}/lifelines/audiencePoll`), (currentUser.lifelines?.audiencePoll || 0) - 1);
  };

  const useHint = async () => {
    if (!currentUser || isAnswered || (currentUser.lifelines?.hint || 0) <= 0 || showHint) return;

    setShowHint(true);

    // Consume lifeline
    await set(ref(db, `users/${currentUser.id}/lifelines/hint`), (currentUser.lifelines?.hint || 0) - 1);
  };

  const useChangeQuiz = async () => {
    if (!currentUser || isAnswered || (currentUser.lifelines?.changeQuiz || 0) <= 0) return;

    // We skip current and jump forward in the shuffled list
    // Or just increment a skipped counter to pick next from pool without advancing progress index
    setSkippedCount(prev => prev + 1);
    setSelectedOption(null);
    setHiddenOptions([]);

    // Consume lifeline
    await set(ref(db, `users/${currentUser.id}/lifelines/changeQuiz`), (currentUser.lifelines?.changeQuiz || 0) - 1);
  };

  const handleNextRound = () => {
    setShowRoundComplete(false);
    setRoundStats({ correct: 0, incorrect: 0, unattempted: 0 });
    
    if ((currentUser?.currentRound || 1) >= 10) {
      setShowResult(true);
    } else {
      setSelectedOption(null);
      setIsAnswered(false);
      setQuizTimeLeft(settings?.quizTimerSeconds || 30);
      setCurrentIndex(0); // Reset for next round
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-black z-[150] flex flex-col items-center justify-center p-8 transition-colors duration-300">
        <div className="w-full space-y-6 max-w-md">
           <Skeleton className="h-40 rounded-3xl bg-black/5 dark:bg-white/5" />
           <Skeleton className="h-16 rounded-2xl bg-black/5 dark:bg-white/5" />
           <Skeleton className="h-16 rounded-2xl bg-black/5 dark:bg-white/5" />
           <Skeleton className="h-16 rounded-2xl bg-black/5 dark:bg-white/5" />
           <Skeleton className="h-16 rounded-2xl bg-black/5 dark:bg-white/5" />
        </div>
      </div>
    );
  }

  if (showResult) {
    const currentTopicId = Array.isArray(targetTopicIds) 
      ? targetTopicIds[targetTopicIds.length - 1] 
      : (targetTopicIds || 'general');

    return (
      <WinnerLoserScreen 
        history={history} 
        onClose={onClose} 
        total={quizzes.length} 
        topicId={currentTopicId}
        quizzes={quizzes}
      />
    );
  }

  if (!quizzes.length || absoluteIndex >= quizzes.length) {
     return (
       <div className="fixed inset-0 bg-white dark:bg-[#050505] z-[150] flex flex-col items-center justify-center p-8 text-center transition-colors duration-300">
          <AlertCircle size={48} className="text-[#32befa] mb-4" />
          <h2 className="text-xl font-bold mb-2 text-black dark:text-white">No more quizzes found</h2>
          <p className="text-black/40 dark:text-white/40 mb-6 max-w-xs">Congratulations! You've finished all available quizzes for this topic or it hasn't been populated yet.</p>
          
          <div className="flex flex-col gap-4 w-full max-w-xs mt-4">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onClose} 
              className="w-full bg-primary text-black font-black px-8 py-5 rounded-[2.5rem] uppercase tracking-widest text-xs shadow-lg shadow-primary/20"
            >
              Return Home
            </motion.button>
            {currentUser?.role === 'admin' && (
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={async () => {
                  const verified = await confirm({
                    title: "Reset Progress",
                    description: "Are you sure you want to reset your admin progress for testing? This will restart the quiz from the beginning.",
                    confirmLabel: "Reset & Restart",
                    cancelLabel: "Stay Here"
                  });
                  
                  if (verified) {
                    await set(ref(db, `users/${currentUser.id}/currentRound`), 1);
                    await set(ref(db, `users/${currentUser.id}/currentQuizIndex`), 0);
                    setCurrentIndex(0);
                    setIsAnswered(false);
                    setSelectedOption(null);
                    setHistory([]);
                  }
                }}
                className="w-full bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 border-2 border-black/10 dark:border-white/10 font-black px-8 py-5 rounded-[2.5rem] uppercase tracking-widest text-xs hover:bg-black/10 dark:hover:bg-white/10 transition-all font-mono"
              >
                Reset & Restart Test
              </motion.button>
            )}
          </div>
       </div>
     );
  }

  const currentQuiz = quizzes[absoluteIndex];

  return (
    <div className="fixed inset-0 bg-white dark:bg-[#050505] z-[150] flex flex-col overflow-hidden text-black dark:text-white transition-colors duration-300">
      {/* Header */}
      <div className="p-4 md:p-6 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#050505] z-20">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-black/40 dark:text-white/40 hover:text-primary transition-colors"><X size={24} /></button>
          <div>
            <h1 className="text-sm font-black text-primary tracking-tighter uppercase mb-0.5">Rahee Quiz</h1>
            <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">{(targetTopicIds && targetTopicIds.length > 0) ? (targetTopicIds.length === 1 ? targetTopicIds[0] : `${targetTopicIds.length} Topics`) : 'General'} • {eventId ? 'Special Event' : `R${currentUser?.currentRound || 1} • Q${currentIndex}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {livesActive && currentUser?.lives && (
            <div className={cn(
              "px-3 py-1 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 border transition-all",
              currentUser.lives.count <= 3 ? "bg-red-500 text-white border-red-400 animate-pulse" : "bg-primary/10 text-primary border-primary/20"
            )}>
              <Star size={12} fill="currentColor" />
              {currentUser.lives.count}
            </div>
          )}
          {settings?.quizTimerEnabled !== false && (
            <div className={cn(
              "px-3 py-1 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 border transition-all",
              quizTimeLeft <= 5 ? "bg-red-500 text-white animate-pulse border-red-400" : "bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 border-black/10 dark:border-white/10"
            )}>
              <Clock size={12} />
              {quizTimeLeft}s
            </div>
          )}
          {timeLeft !== null && (
            <div className={cn(
              "px-3 py-1 rounded-full text-[10px] font-black tracking-widest flex items-center gap-2 border",
              timeLeft < 60 ? "bg-red-500 text-white animate-pulse border-red-400" : "bg-red-500/10 text-red-500 border-red-500/20"
            )}>
              <Clock size={12} />
              {timeLeft < 0 ? '0:00' : `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`}
            </div>
          )}
          <button 
            onPointerDown={(e) => {
              const timer = setTimeout(() => {
                setShowSpecialPin(true);
                setPressTimer(null);
              }, 5000);
              setPressTimer(timer);
            }}
            onPointerUp={() => {
              if (pressTimer) {
                clearTimeout(pressTimer);
                setPressTimer(null);
              }
            }}
            onPointerLeave={() => {
              if (pressTimer) {
                clearTimeout(pressTimer);
                setPressTimer(null);
              }
            }}
            onClick={() => setLanguage(lang => lang === 'en' ? 'hi' : 'en')}
            className={cn(
              "flex items-center gap-1 px-3 py-1 bg-black/5 dark:bg-white/5 rounded-full text-[10px] font-bold border border-black/10 dark:border-white/10 uppercase hover:bg-black/10 dark:hover:bg-white/10 transition-all font-mono touch-none select-none",
              pressTimer && "animate-pulse border-primary/50 text-primary"
            )}
          >
            <Globe size={12} className={cn(pressTimer && "animate-spin")} />
            <span className="select-none pointer-events-none">{language === 'en' ? 'English' : 'हिंदी'}</span>
          </button>
          <button 
            onClick={() => setIsDark(!isDark)}
            className="p-2 bg-black/5 dark:bg-white/5 rounded-xl text-black/40 dark:text-white/40 hover:text-primary transition-all"
          >
            {isDark ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 bg-black/5 dark:bg-white/5 rounded-xl text-black/40 dark:text-white/40 hover:text-primary transition-all"
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-black/5 dark:bg-white/5">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${((currentIndex + 1) / QUESTIONS_PER_ROUND) * 100}%` }}
          className="h-full bg-primary shadow-[0_0_15px_rgba(var(--primary-color),0.5)]"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 md:p-12 flex flex-col">
          <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
            <motion.div
              key={currentIndex}
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="flex-1 flex flex-col"
            >
               {(() => {
                 const hasQuestionImage = !!(
                   currentQuiz.questionImage && 
                   typeof currentQuiz.questionImage === 'string' && 
                   currentQuiz.questionImage.trim() !== '' && 
                   currentQuiz.questionImage.trim() !== 'undefined'
                 );
                 return (
                   <div className={cn(
                     "mb-8 md:mb-12 pt-4 md:pt-8 flex flex-col gap-6 w-full",
                     hasQuestionImage ? "text-center items-center justify-center animate-in fade-in" : "text-left items-start justify-start"
                   )}>
                     {hasQuestionImage && (
                       <div className="w-full h-48 md:h-64 rounded-3xl overflow-hidden border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 relative group max-w-xl mx-auto">
                         <img 
                           src={currentQuiz.questionImage} 
                           alt="Question Visual" 
                           referrerPolicy="no-referrer"
                           className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                         />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                       </div>
                     )}
                     <h2 className={cn(
                       "text-2xl md:text-4xl font-black leading-tight tracking-tight text-black dark:text-white w-full",
                       hasQuestionImage ? "text-center" : "text-left"
                     )}>
                       {currentQuiz.question?.[language] || '...'}
                     </h2>
                   </div>
                 );
               })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-4">
                {currentQuiz.options?.[language]?.map((option, idx) => {
                  const isCorrect = idx === currentQuiz.correctAnswerIndex;
                  const isSelected = idx === selectedOption;
                  
                  let bgColor = "bg-black/5 dark:bg-[#111]";
                  let borderColor = "border-black/5 dark:border-white/5";
                  let textColor = "text-black/60 dark:text-white/60";

                  if (isAnswered) {
                    if (isCorrect) {
                      bgColor = "bg-green-500/20";
                      borderColor = "border-green-500/40";
                      textColor = "text-green-600 dark:text-green-400";
                    } else if (isSelected) {
                      bgColor = "bg-red-500/20";
                      borderColor = "border-red-500/40";
                      textColor = "text-red-600 dark:text-red-400";
                    }
                  } else if (isSelected) {
                    borderColor = "border-primary";
                    textColor = "text-primary";
                  }

                  return (
                    <button
                      key={idx}
                      disabled={isAnswered || hiddenOptions.includes(idx)}
                      onClick={() => handleAnswer(idx)}
                      className={cn(
                        "w-full p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border text-left font-bold transition-all flex flex-col gap-3 group relative overflow-hidden",
                        bgColor, borderColor, textColor,
                        !isAnswered && !hiddenOptions.includes(idx) && "hover:bg-primary/5 hover:border-primary/20 active:scale-[0.98] cursor-pointer",
                        hiddenOptions.includes(idx) && "opacity-0 invisible pointer-events-none"
                      )}
                    >
                      {(() => {
                        const hasOptImg = !!(
                          currentQuiz.optionImages?.[idx] &&
                          typeof currentQuiz.optionImages[idx] === 'string' &&
                          currentQuiz.optionImages[idx].trim() !== '' &&
                          currentQuiz.optionImages[idx].trim() !== 'undefined'
                        );
                        if (!hasOptImg) return null;
                        return (
                          <div className="w-full h-32 md:h-40 rounded-2xl overflow-hidden border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5">
                            <img 
                              src={currentQuiz.optionImages[idx]} 
                              alt={`Option ${idx + 1}`} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          </div>
                        );
                      })()}
                      <div className="flex items-center justify-between w-full">
                        <div className="flex-1">
                          <span className="text-sm md:text-lg block">{option}</span>
                          {pollResults && !hiddenOptions.includes(idx) && (
                            <div className="mt-2 w-full">
                              <div className="flex items-center justify-between mb-1">
                                <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full flex-1 overflow-hidden">
                                  <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pollResults[idx]}%` }}
                                    className="h-full bg-primary"
                                  />
                                </div>
                                <span className="text-[10px] font-black ml-2 text-primary">{pollResults[idx]}%</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {isAnswered && isCorrect && <Check size={20} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {showHint && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="mb-6 p-4 rounded-2xl bg-primary/10 border border-primary/20 flex gap-3 items-start"
                >
                  <Lightbulb size={20} className="text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-primary mb-1">Lifeline Hint</p>
                    <p className="text-xs font-bold text-black/60 dark:text-white/60">
                      {currentQuiz.hint?.[language] || (currentQuiz.explanation?.[language]?.slice(0, 80) + '...') || "Try focusing on the historical context of the question!"}
                    </p>
                  </div>
                </motion.div>
              )}

              {isAnswered && (
                 <motion.div
                   initial={{ y: 20, opacity: 0 }}
                   animate={{ y: 0, opacity: 1 }}
                   className="mt-4 mb-12"
                 >
                    <div className={cn(
                      "p-6 rounded-[2rem] flex flex-col gap-3 border",
                      selectedOption === currentQuiz.correctAnswerIndex 
                        ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20" 
                        : selectedOption === -1
                          ? "bg-black/5 text-black/40 dark:text-white/40 border-black/10 dark:border-white/10"
                          : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                    )}>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center",
                          selectedOption === currentQuiz.correctAnswerIndex 
                            ? "bg-green-500 text-white" 
                            : selectedOption === -1
                              ? "bg-black/20 dark:bg-white/10 text-black/40 dark:text-white/40"
                              : "bg-red-500 text-white"
                        )}>
                          {selectedOption === currentQuiz.correctAnswerIndex 
                            ? <Check size={24} /> 
                            : selectedOption === -1
                              ? <Clock size={20} />
                              : <AlertCircle size={24} />}
                        </div>
                        <div>
                          <p className="font-black uppercase tracking-tight text-lg">
                            {selectedOption === currentQuiz.correctAnswerIndex 
                              ? "That's Correct!" 
                              : selectedOption === -1
                                ? "Time's Up!"
                                : "Incorrect Answer"}
                          </p>
                          <p className="text-[10px] font-bold uppercase opacity-60 tracking-wider">
                            {selectedOption === currentQuiz.correctAnswerIndex 
                              ? "+100 Experience Points" 
                              : selectedOption === -1
                                ? "This question was unattempted"
                                : "The correct answer is highlighted above"}
                          </p>
                        </div>
                      </div>
                     
                     <div className="pt-4 border-t border-current/10">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1 opacity-40">Explanation</p>
                        <p className="text-sm md:text-base font-bold leading-relaxed">
                          {currentQuiz.explanation?.[language] || "No detailed explanation provided for this quiz."}
                        </p>
                     </div>
                   </div>
                 </motion.div>
              )}
            </motion.div>
          </div>

          <div className="max-w-2xl mx-auto w-full pb-8 px-6 grid grid-cols-4 gap-2 md:gap-4">
             <button 
               onClick={useFiftyFifty}
               disabled={!currentUser || isAnswered || (currentUser.lifelines?.fiftyFifty || 0) <= 0 || hiddenOptions.length > 0}
               className="flex flex-col items-center gap-2 group disabled:opacity-30"
             >
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-[#facc15] group-hover:bg-[#facc15]/10 group-hover:border-[#facc15]/20 group-hover:scale-110 transition-all">
                   <Zap size={20} />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black uppercase tracking-tight text-black/40 dark:text-white/40 group-hover:text-[#facc15]">50-50</span>
                  <span className="text-[7px] font-bold text-black/20 dark:text-white/20">{currentUser?.lifelines?.fiftyFifty || 0} left</span>
                </div>
             </button>

             <button 
               onClick={useAudiencePoll}
               disabled={!currentUser || isAnswered || (currentUser.lifelines?.audiencePoll || 0) <= 0 || !!pollResults}
               className="flex flex-col items-center gap-2 group disabled:opacity-30"
             >
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-green-500 group-hover:bg-green-500/10 group-hover:border-green-500/20 group-hover:scale-110 transition-all">
                   <Users size={20} />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black uppercase tracking-tight text-black/40 dark:text-white/40 group-hover:text-green-500">Poll</span>
                  <span className="text-[7px] font-bold text-black/20 dark:text-white/20">{currentUser?.lifelines?.audiencePoll || 0} left</span>
                </div>
             </button>

             <button 
               onClick={useHint}
               disabled={!currentUser || isAnswered || (currentUser.lifelines?.hint || 0) <= 0 || showHint}
               className="flex flex-col items-center gap-2 group disabled:opacity-30"
             >
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-primary group-hover:bg-primary/10 group-hover:border-primary/20 group-hover:scale-110 transition-all">
                   <Lightbulb size={20} />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black uppercase tracking-tight text-black/40 dark:text-white/40 group-hover:text-primary">Hint</span>
                  <span className="text-[7px] font-bold text-black/20 dark:text-white/20">{currentUser?.lifelines?.hint || 0} left</span>
                </div>
             </button>

             <button 
               onClick={useChangeQuiz}
               disabled={!currentUser || isAnswered || (currentUser.lifelines?.changeQuiz || 0) <= 0}
               className="flex flex-col items-center gap-2 group disabled:opacity-30"
             >
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-red-500 group-hover:bg-red-500/10 group-hover:border-red-500/20 group-hover:scale-110 transition-all">
                   <RefreshCw size={20} />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] font-black uppercase tracking-tight text-black/40 dark:text-white/40 group-hover:text-red-500">{language === 'en' ? 'Skip' : 'छोड़ें'}</span>
                  <span className="text-[7px] font-bold text-black/20 dark:text-white/20">{currentUser?.lifelines?.changeQuiz || 0} left</span>
                </div>
             </button>
          </div>
      </div>

      <AnimatePresence>
        {showSettings && (
          <Settings 
            onClose={() => setShowSettings(false)} 
            onShowFeedback={() => setShowFeedback(true)} 
            onShowHistory={() => setShowHistory(true)}
            activeQuizId={quizzes[absoluteIndex]?.id}
            activeQuizText={quizzes[absoluteIndex]?.question?.[language] || quizzes[absoluteIndex]?.question?.en}
          />
        )}
        {showFeedback && <Feedback onClose={() => setShowFeedback(false)} />}
        {showHistory && <History onClose={() => setShowHistory(false)} />}

        {showSpecialPin && (
          <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-[#111] border border-black/10 dark:border-white/10 p-8 rounded-[2.5rem] max-w-sm w-full space-y-6 shadow-2xl"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary mx-auto mb-4">
                  <Shield size={32} />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-black dark:text-white">Special Access</h3>
                <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Enter Secret Pin to Continue</p>
              </div>

              <input 
                type="text"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="****"
                className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 p-5 rounded-2xl font-black text-center text-2xl tracking-[0.5em] outline-none focus:border-primary transition-all text-black dark:text-white"
                autoFocus
              />

              <div className="flex gap-4">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowSpecialPin(false);
                    setPinInput('');
                  }}
                  className="flex-1 py-5 font-black uppercase tracking-widest text-xs bg-black/5 dark:bg-white/5 rounded-[1.8rem] hover:bg-red-500/10 hover:text-red-500 transition-all text-black/60 dark:text-white/60 border border-black/5 dark:border-white/5 shadow-sm"
                >
                  Cancel
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (pinInput === settings?.specialPin) {
                      setShowSpecialPin(false);
                      setShowSpecialChat(true);
                      setPinInput('');
                    } else {
                      alert({ title: 'Incorrect PIN', description: 'The code you entered is invalid.', type: 'error' });
                    }
                  }}
                  className="flex-[1.5] py-5 font-black uppercase tracking-widest text-xs bg-primary text-black rounded-[1.8rem] shadow-lg shadow-primary/20 active:scale-95 transition-all"
                >
                  Verify Access
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}

        {showSpecialChat && (
          <div className="fixed inset-0 z-[310] bg-white dark:bg-black flex flex-col pt-safe transition-colors duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-black/5 dark:border-white/5">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowSpecialChat(false)}
                  className="p-2 bg-black/5 dark:bg-white/5 rounded-xl hover:text-primary transition-all text-black/60 dark:text-white/60"
                >
                  <X size={20} />
                </button>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-tight text-black dark:text-white">Special Quiz Access</h3>
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    <p className="text-[8px] font-black text-primary uppercase">Secure Channel</p>
                  </div>
                </div>
              </div>
              <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <Shield size={20} />
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
              {mySpecialMessages.filter(m => m.adminReply && m.replyExpiresAt > Date.now()).length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-20">
                  <Shield size={48} className="mb-4 text-black dark:text-white" />
                  <p className="font-black uppercase tracking-widest text-xs text-black dark:text-white">Special Access Channel</p>
                  <p className="text-[10px] font-bold mt-2 text-black dark:text-white max-w-[200px]">Send a message to request secret access codes. Your message will be visible only to admins.</p>
                </div>
              )}
              {mySpecialMessages.map((msg, idx) => (
                <React.Fragment key={`special-msg-${msg.id || idx}-${idx}`}>
                  {msg.adminReply && (msg.replyExpiresAt > Date.now()) && (
                    <div className="flex flex-col items-start translate-y-0 animate-in fade-in slide-in-from-left-4 duration-500">
                      <div className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-5 rounded-[1.5rem] rounded-tl-none max-w-[85%] relative overflow-hidden group shadow-xl">
                        <div className="flex items-center justify-between mb-3 gap-4">
                          <div className="flex items-center gap-2">
                             <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-black">
                                <Shield size={10} />
                             </div>
                             <p className="text-[8px] font-black text-primary uppercase">Official Response</p>
                          </div>
                          <div className="flex items-center gap-1 text-[8px] font-black text-black/20 dark:text-white/20">
                            <Clock size={8} />
                            {Math.max(0, Math.ceil((msg.replyExpiresAt - Date.now()) / 1000))}s
                          </div>
                        </div>
                        <p className="text-sm font-black text-black dark:text-white leading-relaxed">{msg.adminReply}</p>
                        
                        {/* Expiry indicator bar */}
                        <div className="absolute bottom-0 left-0 h-1 bg-primary/10 w-full">
                           <motion.div 
                             initial={{ width: '100%' }}
                             animate={{ width: '0%' }}
                             transition={{ duration: Math.max(0.1, (msg.replyExpiresAt - Date.now()) / 1000), ease: 'linear' }}
                             className="h-full bg-primary"
                           />
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Input */}
            <div className="p-6 border-t border-black/5 dark:border-white/5 bg-white dark:bg-[#050505]">
              <div className="flex gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-3xl border border-black/5 dark:border-white/5">
                <input 
                  value={specialMessage}
                  onChange={(e) => setSpecialMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendSpecialMessage()}
                  placeholder="Request access code..."
                  className="flex-1 bg-transparent px-4 py-2 text-sm font-bold outline-none placeholder:text-black/20 dark:placeholder:text-white/20 text-black dark:text-white"
                />
                <button 
                  onClick={handleSendSpecialMessage}
                  disabled={!specialMessage.trim()}
                  className="w-10 h-10 bg-primary text-black rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="text-[8px] text-center mt-4 font-black uppercase text-black/20 dark:text-white/20 tracking-widest">
                End-to-End Encrypted Access Channel
              </p>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Round Complete Overlay */}
      <AnimatePresence>
        {showRoundComplete && (
          <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-8 text-center backdrop-blur-xl overflow-y-auto">
             <RoundCard 
                round={currentUser?.currentRound || 1}
                correctCount={roundStats.correct}
                incorrectCount={roundStats.incorrect}
                unattemptedCount={roundStats.unattempted}
                total={QUESTIONS_PER_ROUND}
                onNext={handleNextRound}
             />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
