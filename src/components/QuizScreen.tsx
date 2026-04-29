import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { db } from '../firebase/config';
import { ref, onValue, set, get, push, update } from 'firebase/database';
import { Quiz, User, QuizHistory } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { X, Volume2, VolumeX, MessageSquare, Globe, ChevronRight, Check, AlertCircle, Clock, Trophy, Settings as SettingsIcon, Zap, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import WinnerLoserScreen from './WinnerLoserScreen';
import Settings from './Settings';
import RoundCard from './RoundCard';

import { Skeleton } from './ui/Skeleton';

export default function QuizScreen({ onClose, language: initialLanguage = 'en', eventId, topicId: propTopicId }: { onClose: () => void, language?: 'en' | 'hi', eventId?: string, topicId?: string }) {
  const { currentUser } = useUser();
  const { isDark } = useTheme();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentIndex, setCurrentIndex] = useState(eventId ? 0 : (currentUser?.currentQuizIndex || 0));
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>(initialLanguage);
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRoundComplete, setShowRoundComplete] = useState(false);
  const [roundStats, setRoundStats] = useState({ correct: 0, incorrect: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [history, setHistory] = useState<QuizHistory[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [eventData, setEventData] = useState<Event | null>(null);
  
  const targetTopicId = eventId ? propTopicId : (currentUser?.selectedNicheId || currentUser?.selectedTopicId);

  useEffect(() => {
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

  const completeQuiz = async () => {
    if (eventId && currentUser) {
      await update(ref(db, `events/${eventId}/results/${currentUser.id}`), {
        score: roundStats.correct,
        total: quizzes.length,
        completedAt: Date.now()
      });
    }
    setShowResult(true);
  };

  useEffect(() => {
    if (!targetTopicId) return;

    const quizzesRef = ref(db, `topicQuizzes/${targetTopicId}`);
    onValue(quizzesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        let topicQuizzes = Object.values(data) as Quiz[];
        
        // If we are showing all quizzes for a topic (including children), 
        // we'd need a more complex query, but for now we fetch only from the specific niche bucket.
        
        // Deterministic shuffle
        const seed = currentUser.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const shuffled = [...topicQuizzes].sort((a, b) => {
          const pseudoRandomA = Math.sin(seed + a.id.length) * 10000;
          const pseudoRandomB = Math.sin(seed + b.id.length) * 10000;
          return (pseudoRandomA - Math.floor(pseudoRandomA)) - (pseudoRandomB - Math.floor(pseudoRandomB));
        });

        setQuizzes(shuffled);
      } else {
        setQuizzes([]);
      }
      setLoading(false);
    });
  }, [currentUser?.selectedTopicId]);

  const QUESTIONS_PER_ROUND = 10;
  const absoluteIndex = ((currentUser?.currentRound || 1) - 1) * QUESTIONS_PER_ROUND + currentIndex + skippedCount;

  const handleAnswer = async (index: number) => {
    if (isAnswered || !currentUser || !quizzes[absoluteIndex]) return;
    setSelectedOption(index);
    setIsAnswered(true);

    const isCorrect = index === quizzes[absoluteIndex].correctAnswerIndex;
    const xpGain = isCorrect ? 100 : 0;
    
    // Update round stats
    setRoundStats(prev => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      incorrect: prev.incorrect + (isCorrect ? 0 : 1)
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
      timestamp: Date.now()
    };
    setHistory(prev => [...prev, historyEntry]);

    // Update User Stats in RTDB
    const newXp = currentUser.xp + xpGain;
    const newRank = Math.floor(newXp / 1600) + 1;
    const newIndex = currentIndex + 1;

    // Push to global history collection
    await set(globalHistoryRef, historyEntry);

    const currentTopicId = currentUser.selectedTopicId || 'general';
    const currentTopicScores = currentUser.scores?.[currentTopicId] || { correct: 0, total: 0 };
    
    // Total solved across this session
    const totalSolvedInRound = newIndex;
    let bonusCoins = 0;
    // Award 100 coins per 16 quizzes (User requirement: solve 16 quiz -> earn 100)
    // We track this by checking total progress
    const totalQuizzesSolved = ((currentUser.currentRound - 1) * QUESTIONS_PER_ROUND) + newIndex;
    if (totalQuizzesSolved > 0 && totalQuizzesSolved % 16 === 0) {
      bonusCoins = 100;
    }

    const updates: Partial<User> = {
      xp: newXp,
      rank: newRank,
      currentQuizIndex: newIndex,
      raheeCoins: (currentUser.raheeCoins || 0) + bonusCoins,
      scores: {
        ...(currentUser.scores || {}),
        [currentTopicId]: {
          correct: currentTopicScores.correct + (isCorrect ? 1 : 0),
          total: currentTopicScores.total + 1
        }
      }
    };

    if (newIndex >= (eventId ? quizzes.length : QUESTIONS_PER_ROUND)) {
      if (!eventId) {
        updates.currentQuizIndex = 0;
        updates.currentRound = (currentUser.currentRound || 1) + 1;
      }
      
      // Delay to show result of last question
      setTimeout(async () => {
        if (eventId) {
          await completeQuiz();
        } else {
          setShowRoundComplete(true);
        }
      }, 1500);
    } else {
      // Auto next after 2 seconds (giving time for explanation)
      setTimeout(() => {
        nextQuestion();
      }, 2000);
    }

    if (!eventId) {
      await set(ref(db, `users/${currentUser.id}`), { ...currentUser, ...updates });
    }
  };

  const nextQuestion = () => {
    setSelectedOption(null);
    setIsAnswered(false);
    setHiddenOptions([]);
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
    setRoundStats({ correct: 0, incorrect: 0 });
    
    if ((currentUser?.currentRound || 1) >= 10) {
      setShowResult(true);
    } else {
      setSelectedOption(null);
      setIsAnswered(false);
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
    return <WinnerLoserScreen history={history} onClose={onClose} total={quizzes.length} />;
  }

  if (!quizzes.length || absoluteIndex >= quizzes.length) {
     return (
       <div className="fixed inset-0 bg-white dark:bg-[#050505] z-[150] flex flex-col items-center justify-center p-8 text-center transition-colors duration-300">
          <AlertCircle size={48} className="text-[#32befa] mb-4" />
          <h2 className="text-xl font-bold mb-2 text-black dark:text-white">No more quizzes found</h2>
          <p className="text-black/40 dark:text-white/40 mb-6 max-w-xs">Congratulations! You've finished all available quizzes for this topic or it hasn't been populated yet.</p>
          
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button onClick={onClose} className="w-full bg-[#32befa] text-black font-black px-8 py-4 rounded-[2rem] uppercase tracking-widest text-[10px]">Return Home</button>
            {currentUser?.role === 'admin' && (
              <button 
                onClick={async () => {
                   if (confirm("Reset your admin progress for testing?")) {
                      await set(ref(db, `users/${currentUser.id}/currentRound`), 1);
                      await set(ref(db, `users/${currentUser.id}/currentQuizIndex`), 0);
                      // Reset local states to immediately show the first quiz
                      setCurrentIndex(0);
                      setIsAnswered(false);
                      setSelectedOption(null);
                      setHistory([]);
                      // No onClose() here, so it stays in the quiz
                   }
                }}
                className="w-full bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 border border-black/10 dark:border-white/10 font-black px-8 py-4 rounded-[2rem] uppercase tracking-widest text-[10px] hover:bg-black/10 dark:hover:bg-white/10 transition-all font-mono"
              >
                Reset & Restart Test
              </button>
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
            <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">{targetTopicId || 'General'} • {eventId ? 'Special Event' : `R${currentUser?.currentRound || 1} • Q${currentIndex}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => setLanguage(lang => lang === 'en' ? 'hi' : 'en')}
            className="flex items-center gap-1 px-3 py-1 bg-black/5 dark:bg-white/5 rounded-full text-[10px] font-bold border border-black/10 dark:border-white/10 uppercase hover:bg-black/10 dark:hover:bg-white/10 transition-all font-mono"
          >
            <Globe size={12} />
            {language === 'en' ? 'English' : 'हिंदी'}
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
               <div className="mb-8 md:mb-12 pt-4 md:pt-8 text-center md:text-left">
                  <h2 className="text-2xl md:text-4xl font-black leading-tight tracking-tight">
                    {currentQuiz.question?.[language] || '...'}
                  </h2>
               </div>

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
                        "w-full p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border text-left font-bold transition-all flex items-center justify-between group",
                        bgColor, borderColor, textColor,
                        !isAnswered && !hiddenOptions.includes(idx) && "hover:bg-primary/5 hover:border-primary/20 active:scale-[0.98] cursor-pointer",
                        hiddenOptions.includes(idx) && "opacity-0 invisible pointer-events-none"
                      )}
                    >
                      <span className="text-sm md:text-lg">{option}</span>
                      {isAnswered && isCorrect && <Check size={20} />}
                    </button>
                  );
                })}
              </div>

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
                       : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                   )}>
                     <div className="flex items-center gap-3">
                       <div className={cn(
                         "w-10 h-10 rounded-full flex items-center justify-center",
                         selectedOption === currentQuiz.correctAnswerIndex ? "bg-green-500 text-white" : "bg-red-500 text-white"
                       )}>
                         {selectedOption === currentQuiz.correctAnswerIndex ? <Check size={24} /> : <AlertCircle size={24} />}
                       </div>
                       <div>
                         <p className="font-black uppercase tracking-tight text-lg">
                           {selectedOption === currentQuiz.correctAnswerIndex ? "That's Correct!" : "Incorrect Answer"}
                         </p>
                         <p className="text-[10px] font-bold uppercase opacity-60 tracking-wider">
                           {selectedOption === currentQuiz.correctAnswerIndex ? "+100 Experience Points" : "The correct answer is below"}
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

          {!isAnswered && (
             <div className="max-w-2xl mx-auto w-full pb-8 px-6 flex justify-center gap-4">
                <button 
                  onClick={useFiftyFifty}
                  disabled={!currentUser || (currentUser.lifelines?.fiftyFifty || 0) <= 0}
                  className="flex-1 max-w-[120px] flex flex-col items-center gap-2 group disabled:opacity-30"
                >
                   <div className="w-14 h-14 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-[#facc15] group-hover:bg-[#facc15]/10 group-hover:border-[#facc15]/20 group-hover:scale-110 transition-all">
                      <Zap size={24} />
                   </div>
                   <div className="flex flex-col items-center">
                     <span className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 group-hover:text-[#facc15]">50-50</span>
                     <span className="text-[8px] font-bold text-black/20 dark:text-white/20">{currentUser?.lifelines?.fiftyFifty || 0} left</span>
                   </div>
                </button>

                <button 
                  onClick={useChangeQuiz}
                  disabled={!currentUser || (currentUser.lifelines?.changeQuiz || 0) <= 0}
                  className="flex-1 max-w-[120px] flex flex-col items-center gap-2 group disabled:opacity-30"
                >
                   <div className="w-14 h-14 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-primary group-hover:bg-primary/10 group-hover:border-primary/20 group-hover:scale-110 transition-all">
                      <RefreshCw size={24} />
                   </div>
                   <div className="flex flex-col items-center">
                     <span className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 group-hover:text-primary">{language === 'en' ? 'Skip' : 'छोड़ें'}</span>
                     <span className="text-[8px] font-bold text-black/20 dark:text-white/20">{currentUser?.lifelines?.changeQuiz || 0} left</span>
                   </div>
                </button>
             </div>
          )}
      </div>

      <AnimatePresence>
        {showSettings && (
          <Settings 
            onClose={() => setShowSettings(false)} 
            onShowFeedback={() => setShowFeedback(true)} 
          />
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
                total={QUESTIONS_PER_ROUND}
                onNext={handleNextRound}
             />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
