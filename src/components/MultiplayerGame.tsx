import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase/config';
import { ref, onValue, set, update, get, push } from 'firebase/database';
import { Quiz, User, MatchRoom, MatchProgress } from '../types';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDialog } from '../contexts/DialogContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Swords, Trophy, Zap, Clock, Check, X, AlertCircle, Volume2, Globe, RefreshCw, Minus, UserPlus, UserCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import ScoreCard from './ScoreCard';
import { NotificationService } from '../services/notificationService';

interface MultiplayerGameProps {
  roomId: string;
  isBot: boolean;
  onClose: () => void;
  onMinimize: () => void;
}

export default function MultiplayerGame({ roomId, isBot, onClose, onMinimize }: MultiplayerGameProps) {
  const { currentUser } = useUser();
  const { serviceAccount } = useNotifications();
  const { isDark, soundEnabled, vibrationEnabled, customization } = useTheme();
  const { confirm } = useDialog();
  const [room, setRoom] = useState<MatchRoom | null>(null);
  
  const sendFriendRequest = async (targetUserId: string) => {
    if (!currentUser) return;
    await update(ref(db, `users/${currentUser.id}/pendingRequests`), {
      [targetUserId]: 'outgoing'
    });
    // This will work now with updated rules
    await update(ref(db, `users/${targetUserId}/pendingRequests`), {
      [currentUser.id]: 'incoming'
    });

    // Send FCM Notification
    try {
      const tokensSnap = await get(ref(db, `fcmTokens/${targetUserId}`));
      if (tokensSnap.exists()) {
        const tokens = Object.values(tokensSnap.val()) as string[];
        const templateSnap = await get(ref(db, 'customNotifications/friendRequest'));
        let title = 'New Friend Request';
        let body = `${currentUser.name} wants to be your friend!`;

        if (templateSnap.exists()) {
          const template = templateSnap.val();
          if (template?.title) title = template.title;
          if (template?.body) body = template.body.replace('{player}', currentUser.name);
        }

        for (const token of tokens) {
          await NotificationService.sendToToken(serviceAccount, token, title, body);
        }
      }
    } catch (e) {
      console.error("Failed to send friend request notification:", e);
    }
  };
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [participantDetails, setParticipantDetails] = useState<Record<string, User>>({});
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Sync Room Data
  useEffect(() => {
    const roomRef = ref(db, `matches/${roomId}`);
    return onValue(roomRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as MatchRoom;
        
        // Fetch participant details if not already fetched
        const detailUpdates: Record<string, User> = { ...participantDetails };
        let changed = false;
        for (const uid of Object.keys(data.participants)) {
           if (!detailUpdates[uid]) {
              const uSnap = await get(ref(db, `public_profiles/${uid}`));
              if (uSnap.exists()) {
                 detailUpdates[uid] = { ...uSnap.val(), id: uid };
                 changed = true;
              }
           }
        }
        if (changed) setParticipantDetails(detailUpdates);

        // If room is already finished...
        if (data.status === 'finished' && !winner) {
          const participants = Object.values(data.participants) as MatchProgress[];
          const sorted = [...participants].sort((a, b) => b.score - a.score || b.currentIndex - a.currentIndex);
          if (sorted[0]) setWinner(sorted[0].userId);
          setRoom(data);
          setLoading(false);
          return;
        }

        setRoom(data);
        
        // Timer Logic
        if (data.timerEnabled && data.startTime) {
          const totalSeconds = data.totalTime * 60;
          const elapsedSeconds = Math.floor((Date.now() - data.startTime) / 1000);
          const remaining = totalSeconds - elapsedSeconds;
          if (remaining <= 0) {
             finalizeGame(data);
          } else {
             setTimeLeft(remaining);
          }
        }

        // Check completion
        const participants = Object.values(data.participants) as MatchProgress[];
        if (participants.every(p => p.finished) && !winner) {
          finalizeGame(data);
        }
      }
    });
  }, [roomId, winner]);

  const finalizeGame = async (data: MatchRoom) => {
    const participants = Object.values(data.participants) as MatchProgress[];
    // Score tie-break by index reached
    const sorted = [...participants].sort((a, b) => b.score - a.score || b.currentIndex - a.currentIndex);
    if (sorted[0]) setWinner(sorted[0].userId);
    
    // Mark room as finished in DB so users don't get pulled back on reload
    if (data.status !== 'finished') {
      try {
        await update(ref(db, `matches/${roomId}`), { status: 'finished' });
      } catch (err) {
        console.error("Failed to mark match as finished:", err);
      }
    }
  };

  // Shared Countdown Timer Interval
  useEffect(() => {
    if (!room?.timerEnabled || !room?.startTime || winner) return;

    const timer = setInterval(() => {
      const totalSeconds = room.totalTime * 60;
      const elapsedSeconds = Math.floor((Date.now() - room.startTime!) / 1000);
      const remaining = totalSeconds - elapsedSeconds;
      
      if (remaining <= 0) {
        setTimeLeft(0);
        finalizeGame(room);
        clearInterval(timer);
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [room?.startTime, room?.timerEnabled, winner]);

  // Load Quizzes
  useEffect(() => {
    if (!room) return;
    const quizzesRef = ref(db, `topicQuizzes/${room.topicId}`);
    get(quizzesRef).then((snapshot) => {
      const data = snapshot.val();
      if (data) {
        const topicQuizzes = Object.values(data) as Quiz[];
        
        // Ensure both players see the same quizzes by deterministic sort
        const sorted = [...topicQuizzes].sort((a, b) => a.id.localeCompare(b.id));
        setQuizzes(sorted.slice(0, 10));
      }
      setLoading(false);
    });
  }, [room?.topicId]);

  // Bot Behavior
  useEffect(() => {
    if (!isBot || !room || room.status !== 'playing' || winner) return;
    
    const botId = Object.keys(room.participants).find(id => id !== currentUser?.id);
    if (!botId) return;

    const botTimer = setInterval(async () => {
      const botProgress = room.participants[botId];
      if (botProgress.finished) {
        clearInterval(botTimer);
        return;
      }

      const newIndex = botProgress.currentIndex + 1;
      const isCorrect = Math.random() > 0.3;
      const newScore = botProgress.score + (isCorrect ? 100 : 0);
      const isFinished = newIndex >= 10;

      await update(ref(db, `matches/${roomId}/participants/${botId}`), {
        currentIndex: newIndex,
        score: newScore,
        finished: isFinished,
        accuracy: Math.round((newScore / (newIndex * 100)) * 100) || 0
      });
      
    }, 4000 + Math.random() * 4000);

    return () => clearInterval(botTimer);
  }, [isBot, room?.id, winner]);

  const handleAnswer = async (index: number) => {
    if (isAnswered || !currentUser || !quizzes[currentIndex] || winner) return;
    
    // Check if question is already claimed by someone else in Who First Mode
    if (room?.whoFirstMode && room.claimedQuestions?.[currentIndex] && room.claimedQuestions[currentIndex] !== currentUser.id) {
       return;
    }

    setSelectedOption(index);
    setIsAnswered(true);

    const isCorrect = index === quizzes[currentIndex].correctAnswerIndex;
    
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

    if (room?.whoFirstMode) {
       // Claim the question
       await update(ref(db, `matches/${roomId}/claimedQuestions`), {
          [currentIndex]: currentUser.id
       });

       // Both players should advance together in Who First mode after a short delay
       // We'll let the claim update notify the other player
    }

    const xpGain = isCorrect ? 100 : 0;
    const currentProgress = room?.participants[currentUser.id];
    if (!currentProgress) return;

    const newScore = currentProgress.score + xpGain;
    const newIndex = currentIndex + 1;
    const isFinished = newIndex >= 10;

    await update(ref(db, `matches/${roomId}/participants/${currentUser.id}`), {
      currentIndex: newIndex,
      score: newScore,
      finished: isFinished,
      accuracy: Math.round((newScore / (newIndex * 100)) * 100)
    });

    if (!isFinished) {
      setTimeout(() => {
        setSelectedOption(null);
        setIsAnswered(false);
        setHiddenOptions([]);
        setCurrentIndex(newIndex);
      }, 1500);
    }
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

    setSkippedCount(prev => prev + 1);
    setSelectedOption(null);
    setHiddenOptions([]);

    // Consume lifeline
    await set(ref(db, `users/${currentUser.id}/lifelines/changeQuiz`), (currentUser.lifelines?.changeQuiz || 0) - 1);
  };

  // Synchronize questions in Who First Mode
  useEffect(() => {
    if (!room?.whoFirstMode || !room.claimedQuestions || winner) return;
    
    const claimerId = room.claimedQuestions[currentIndex];
    if (claimerId && claimerId !== currentUser?.id && !isAnswered) {
       // Someone else answered!
       setIsAnswered(true);
       
       // Advance after short delay
       setTimeout(() => {
          const newIndex = currentIndex + 1;
          const isFinished = newIndex >= 10;
          
          if (!isFinished) {
             setCurrentIndex(newIndex);
             setIsAnswered(false);
             setSelectedOption(null);
          }
          
          // Update own progress as well
          if (currentUser) {
             update(ref(db, `matches/${roomId}/participants/${currentUser.id}`), {
                currentIndex: newIndex,
                finished: isFinished
             });
          }
       }, 2000);
    }
  }, [room?.claimedQuestions, currentIndex, winner]);

  const quitGame = async () => {
    if (!currentUser || !room || winner) return;
    
    const verified = await confirm({
      title: 'Quit Match?',
      description: 'Are you sure you want to surrender? You will lose this match.',
      type: 'confirm'
    });

    if (verified) {
      await update(ref(db, `matches/${roomId}/participants/${currentUser.id}`), {
        finished: true,
        score: myProgress.score,
      });
      // Force finalize game to show results screen
      finalizeGame(room);
    }
  };
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || !room) return (
     <div className="fixed inset-0 bg-black z-[130] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
     </div>
  );

  const opponentId = Object.keys(room.participants).find(id => id !== currentUser?.id);
  const myProgress = room.participants[currentUser?.id || ''];
  const opponentProgress = room.participants[opponentId || ''];

  if (winner) {
    return (
      <div className="fixed inset-0 bg-black z-[140] flex flex-col items-center justify-center p-8 text-center backdrop-blur-xl">
         <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-white/10">
            <Trophy size={32} className="text-primary" />
         </div>

         <h2 className="text-2xl font-black mb-10 tracking-tighter uppercase text-white">
            Battle Completed
         </h2>

         <div className="flex gap-4 w-full max-w-sm mb-10">
            <div className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Your Score</p>
                <p className="text-xl font-black text-primary">{myProgress.score}</p>
            </div>
            <div className="flex-1 bg-white/5 p-4 rounded-2xl border border-white/5">
                <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-1">Opponent</p>
                <p className="text-xl font-black text-white">{opponentProgress.score}</p>
            </div>
         </div>

         <button 
           onClick={onClose}
           className="bg-primary text-black font-black px-12 py-4 rounded-2xl uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 hover:scale-105 transition-all"
         >
            Finish Battle
         </button>
      </div>
    );
  }

  const currentQuiz = quizzes[currentIndex + skippedCount];

  return (
    <div className="fixed inset-0 bg-white dark:bg-[#050505] z-[130] flex flex-col overflow-hidden text-black dark:text-white transition-colors duration-300">
      {/* Versus Header */}
      <div className="p-4 flex flex-col gap-4 border-b border-black/5 dark:border-white/5 bg-white dark:bg-[#080808]">
         <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/20">
                  <Swords size={20} />
               </div>
               <div>
                 <h1 className="text-xs font-black tracking-tighter uppercase leading-none mb-1">Live Match</h1>
                 <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">10 Shared Questions</p>
               </div>
            </div>
            
            {room.timerEnabled && timeLeft !== null && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-full text-red-500">
                 <Clock size={12} />
                 <span className="text-xs font-black tabular-nums">{formatTime(timeLeft)}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
               <button 
                 onClick={() => setLanguage(l => l === 'en' ? 'hi' : 'en')}
                 className="text-[8px] font-black bg-white/5 px-3 py-2 rounded-full border border-white/5 uppercase transition-all hover:bg-white/10"
               >
                 {language === 'en' ? 'ENG' : 'HIN'}
               </button>
               <button 
                 onClick={onMinimize}
                 className="p-2 text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-all"
                 title="Minimize Match"
               >
                 <Minus size={20} />
               </button>
               <button 
                 onClick={quitGame}
                 className="p-2 text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                 title="Quit Match"
               >
                 <X size={20} />
               </button>
            </div>
         </div>

         {/* Battle HUD */}
         <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 pb-2">
            <div 
              className="text-right cursor-pointer group/player bg-black/5 dark:bg-white/5 p-2 rounded-xl border border-transparent hover:border-primary/20 transition-all"
              onClick={() => setSelectedProfileId(currentUser?.id || null)}
            >
               <p className="text-[9px] font-black uppercase text-primary tracking-widest truncate">{currentUser?.name}</p>
               <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full mt-1.5 overflow-hidden">
                  <motion.div 
                    animate={{ width: `${(myProgress.currentIndex / 10) * 100}%` }}
                    className="h-full bg-primary"
                  />
               </div>
               <p className="text-[8px] font-black text-black/30 dark:text-white/20 mt-1 uppercase tracking-widest leading-none">{myProgress.score} PTS</p>
            </div>

            <div className="w-8 h-8 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center border border-black/5 dark:border-white/5">
                <span className="text-[10px] font-black italic opacity-20">VS</span>
            </div>

            <div 
              className="cursor-pointer group/opponent bg-black/5 dark:bg-white/5 p-2 rounded-xl border border-transparent hover:border-primary/20 transition-all"
              onClick={() => setSelectedProfileId(opponentId || null)}
            >
               <p className="text-[9px] font-black uppercase text-black/60 dark:text-white/60 tracking-widest truncate">
                 {participantDetails[opponentId || '']?.name || 'Opponent'}
               </p>
               <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full mt-1.5 overflow-hidden">
                  <motion.div 
                    animate={{ width: `${(opponentProgress.currentIndex / 10) * 100}%` }}
                    className="h-full bg-white/40"
                  />
               </div>
               <p className="text-[8px] font-black text-black/30 dark:text-white/20 mt-1 uppercase tracking-widest leading-none">{opponentProgress.score} PTS</p>
            </div>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center">
         <div className="max-w-2xl w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
              >
                 <div className="mb-10 text-center relative">
                    <AnimatePresence>
                       {room?.whoFirstMode && room.claimedQuestions?.[currentIndex] && (
                          <motion.div 
                             initial={{ y: 10, opacity: 0 }}
                             animate={{ y: 0, opacity: 1 }}
                             className="absolute -top-12 left-1/2 -translate-x-1/2 bg-[#facc15] text-black px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl z-20 border border-black/10"
                          >
                             <Zap size={14} fill="black" />
                             {room.claimedQuestions[currentIndex] === currentUser?.id ? "Point Claimed!" : "Opponent Answered!"}
                          </motion.div>
                       )}
                    </AnimatePresence>

                    <span className="text-primary font-black uppercase text-[10px] tracking-[0.3em] mb-4 block">Question {currentIndex + 1}</span>
                    <h2 className="text-xl md:text-3xl font-black leading-tight tracking-tight">
                      {currentQuiz?.question?.[language]}
                    </h2>
                 </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {currentQuiz?.options?.[language].map((opt, idx) => {
                       const isCorrect = idx === currentQuiz.correctAnswerIndex;
                       const isSelected = idx === selectedOption;
                       const isHidden = hiddenOptions.includes(idx);

                       let colorClasses = "bg-black/5 dark:bg-white/5 border-transparent text-black/60 dark:text-white/60";
                       if (isAnswered) {
                          if (isCorrect) colorClasses = "bg-green-500/20 border-green-500/40 text-green-500";
                          else if (isSelected) colorClasses = "bg-red-500/20 border-red-500/40 text-red-500";
                       } else if (isSelected) {
                          colorClasses = "bg-primary/10 border-primary/40 text-primary";
                       }

                       return (
                          <button
                            key={idx}
                            disabled={isAnswered || !!winner || isHidden}
                            onClick={() => handleAnswer(idx)}
                            className={cn(
                               "w-full p-5 rounded-2xl border font-bold text-base transition-all flex items-center justify-between group",
                               colorClasses,
                               !isAnswered && !winner && !isHidden && "hover:border-primary/20 active:scale-[0.98]",
                               isHidden && "opacity-0 invisible pointer-events-none"
                            )}
                          >
                             <span className="flex-1 text-left">{opt}</span>
                             {isAnswered && isCorrect && <Check size={18} />}
                          </button>
                       );
                    })}
                 </div>
              </motion.div>
            </AnimatePresence>

            {!isAnswered && (
               <div className="flex justify-center gap-4 mt-8">
                  <button 
                    onClick={useFiftyFifty}
                    disabled={!currentUser || (currentUser.lifelines?.fiftyFifty || 0) <= 0}
                    className="flex-1 max-w-[100px] flex flex-col items-center gap-2 group disabled:opacity-30"
                  >
                     <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#facc15] group-hover:bg-[#facc15]/10 group-hover:border-[#facc15]/20 group-hover:scale-110 transition-all">
                        <Zap size={20} />
                     </div>
                     <div className="flex flex-col items-center">
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/40 group-hover:text-[#facc15]">50-50</span>
                        <span className="text-[7px] font-bold text-white/20">{currentUser?.lifelines?.fiftyFifty || 0} left</span>
                     </div>
                  </button>

                  <button 
                    onClick={useChangeQuiz}
                    disabled={!currentUser || (currentUser.lifelines?.changeQuiz || 0) <= 0}
                    className="flex-1 max-w-[100px] flex flex-col items-center gap-2 group disabled:opacity-30"
                  >
                     <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-primary group-hover:bg-primary/10 group-hover:border-primary/20 group-hover:scale-110 transition-all">
                        <RefreshCw size={20} />
                     </div>
                     <div className="flex flex-col items-center">
                        <span className="text-[8px] font-black uppercase tracking-widest text-white/40 group-hover:text-primary">{language === 'en' ? 'Skip' : 'छोड़ें'}</span>
                        <span className="text-[7px] font-bold text-white/20">{currentUser?.lifelines?.changeQuiz || 0} left</span>
                     </div>
                  </button>
               </div>
            )}
         </div>
      </div>

       <div className="p-4 border-t border-black/5 dark:border-white/5">
          <div className="flex items-center justify-center gap-3">
             <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-lg border border-white/5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Server Live</span>
             </div>
             <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Topic: {room.topicId}</p>
          </div>
       </div>

        {/* Participant Profile Modal */}
        <AnimatePresence>
          {selectedProfileId && participantDetails[selectedProfileId] && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <div className="relative w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Your Profile */}
                <div className="hidden md:block">
                  <div className="mb-4 text-center">
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Your Identity</p>
                  </div>
                  {currentUser && (
                    <ScoreCard 
                      user={currentUser}
                      currentUser={currentUser}
                      totalQuizzesCount={quizzes.length}
                    />
                  )}
                </div>

                {/* Selected/Opponent Profile */}
                <div>
                  <div className="mb-4 text-center">
                    <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">
                      {selectedProfileId === currentUser?.id ? 'Your Profile' : 'Opponent Profile'}
                    </p>
                  </div>
                  <ScoreCard 
                    user={participantDetails[selectedProfileId]} 
                    currentUser={currentUser}
                    onSendFriendRequest={sendFriendRequest}
                    onClose={() => setSelectedProfileId(null)} 
                    totalQuizzesCount={quizzes.length}
                  />
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
    </div>
  );
}
