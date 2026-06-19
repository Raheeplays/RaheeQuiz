import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase/config';
import { ref, onValue, set, update, get, push, remove } from 'firebase/database';
import { Quiz, User, MatchRoom, MatchProgress, Settings as SettingsType } from '../types';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDialog } from '../contexts/DialogContext';
import { Swords, Trophy, Zap, Clock, Check, X, AlertCircle, Volume2, Globe, RefreshCw, Minus, Shield, Send, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { NotificationService } from '../services/notificationService';

interface MultiplayerGameProps {
  roomId: string;
  isBot: boolean;
  onClose: () => void;
  onMinimize: () => void;
}

export default function MultiplayerGame({ roomId, isBot, onClose, onMinimize }: MultiplayerGameProps) {
  const { currentUser } = useUser();
  const [topics, setTopics] = useState<any[]>([]);
  const [notifiedPlaying, setNotifiedPlaying] = useState(false);

  useEffect(() => {
    get(ref(db, 'topics')).then(snap => {
      if (snap.exists()) {
        const val = snap.val();
        setTopics(Object.entries(val).map(([k, v]: [string, any]) => ({ ...v, id: k })));
      }
    });
  }, []);

  const getTopicName = (tid: string) => {
    const t = topics.find((topic: any) => topic.id === tid);
    return t ? t.name : tid;
  };

  const { isDark, soundEnabled, vibrationEnabled, customization } = useTheme();
  const { confirm, alert } = useDialog();
  const [room, setRoom] = useState<MatchRoom | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [language, setLanguage] = useState<'en' | 'hi'>('en');
  const [hiddenOptions, setHiddenOptions] = useState<number[]>([]);
  const [pollResults, setPollResults] = useState<number[] | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [skippedCount, setSkippedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [winner, setWinner] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [settings, setSettings] = useState<SettingsType | null>(null);

  const [pressTimer, setPressTimer] = useState<NodeJS.Timeout | null>(null);
  const [showSpecialPin, setShowSpecialPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [showSpecialChat, setShowSpecialChat] = useState(false);
  const [specialMessage, setSpecialMessage] = useState('');
  const [mySpecialMessages, setMySpecialMessages] = useState<any[]>([]);

  // Sync Settings
  useEffect(() => {
    return onValue(ref(db, 'settings'), s => {
      if (s.exists()) setSettings(s.val());
    });
  }, []);

  // Sync Special Messages
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

  // Track last played time when player quits the multiplayer game screen to go back to main screen
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
        }).catch((e) => console.error("Failed to update lastPlayedTime on multiplayer exit:", e));
      }
    };
  }, [currentUser?.id]);

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

  // Sync Room Data
  useEffect(() => {
    const roomRef = ref(db, `matches/${roomId}`);
    return onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as MatchRoom;
        
        // If room is already finished, and we haven't set a winner yet, do it now
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

  // Clean up challenges and replies when match status becomes 'playing'
  useEffect(() => {
    if (!room || room.status !== 'playing' || !currentUser) return;

    const hostId = room.hostId;
    const opponentId = Object.keys(room.participants).find(id => id !== hostId);

    if (hostId && opponentId) {
      remove(ref(db, `users/${hostId}/challenges/${opponentId}`));
      remove(ref(db, `users/${hostId}/challengeReplies/${opponentId}`));
      remove(ref(db, `users/${opponentId}/challenges/${hostId}`));
      remove(ref(db, `users/${opponentId}/challengeReplies/${hostId}`));
    }
  }, [room?.status, currentUser?.id]);

  // Trigger multiplayer active notification when the game starts playing and online competitors are detected
  useEffect(() => {
    if (!room || room.status !== 'playing' || !currentUser || notifiedPlaying) return;

    // Only host triggers once to prevent duplicate notifications
    if (room.hostId === currentUser.id) {
      setNotifiedPlaying(true);

      const triggerMultiplayerNotify = async () => {
        try {
          const serviceAccountSnap = await get(ref(db, 'adminConfig/serviceAccount'));
          const serviceAccount = serviceAccountSnap.val();

          const usersSnap = await get(ref(db, 'users'));
          if (usersSnap.exists()) {
             const allUsersMap = usersSnap.val();
             const allUsers = Object.entries(allUsersMap).map(([id, val]: [string, any]) => ({ ...val, id }));

             // Only other players who are online
             const onlineCompetitors = allUsers.filter((u: any) => u.isOnline && !u.isBot && u.id !== currentUser.id && (!room.participants || !room.participants[u.id]));

             if (onlineCompetitors.length > 0) {
                const topicName = getTopicName(room.topicId || 'general');
                const title = "Multiplayer Battle Active!";
                const body = `${currentUser.name} is playing a Multiplayer Match right now!`;

                for (const player of onlineCompetitors) {
                   // 1. Send inside game alert to target user's custom live alerts
                   const alertRef = push(ref(db, `users/${player.id}/liveAlerts`));
                   await set(alertRef, {
                      title: "Live Multiplayer Battle",
                      body: `${currentUser.name} is actively playing in Multiplayer mode on topic "${topicName}".`,
                      timestamp: Date.now()
                   });

                   // Auto delete alert after 30 seconds to avoid cluttering if they didn't dismiss it
                   setTimeout(async () => {
                     try {
                       await remove(ref(db, `users/${player.id}/liveAlerts/${alertRef.key}`));
                     } catch(e){}
                   }, 30000);

                   // 2. Real FCM Push Notification if they have tokens
                   if (serviceAccount && settings?.pushNotificationsEnabled !== false) {
                      try {
                         const tokensSnap = await get(ref(db, `fcmTokens/${player.id}`));
                         if (tokensSnap.exists()) {
                            const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
                            for (const token of tokens) {
                               await NotificationService.sendToToken(serviceAccount, token, title, body);
                            }
                         }
                      } catch (fcmErr) {
                         console.error("Failed sending real fcm playing notification to player: ", player.id, fcmErr);
                      }
                   }
                }
             }
          }
        } catch (err) {
          console.error("Failed executing multiplayer notifications on game play: ", err);
        }
      };

      triggerMultiplayerNotify();
    }
  }, [room?.status, currentUser?.id, notifiedPlaying, settings, topics]);

  const finalizeGame = async (data: MatchRoom) => {
    const participants = Object.values(data.participants) as MatchProgress[];
    
    if (data.isTeamBattle) {
       const blueScore = participants.filter(p => p.team === 'blue').reduce((sum, p) => sum + p.score, 0);
       const redScore = participants.filter(p => p.team === 'red').reduce((sum, p) => sum + p.score, 0);
       
       if (blueScore > redScore) {
          setWinner('team_blue');
       } else if (redScore > blueScore) {
          setWinner('team_red');
       } else {
          setWinner('team_tie');
       }
    } else {
       // Score tie-break by index reached
       const sorted = [...participants].sort((a, b) => b.score - a.score || b.currentIndex - a.currentIndex);
       if (sorted[0]) setWinner(sorted[0].userId);
    }
    
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
    if (!room || room.status !== 'playing' || winner) return;

    // Only host (or simple bot matches) simulate bot players to avoid duplicate ticks
    const isRoomHost = room.hostId === currentUser?.id;
    if (!isRoomHost && !isBot) return;

    const botParticipants = (Object.values(room.participants) as MatchProgress[]).filter(p => p.isBot || p.userId.startsWith('bot_'));
    if (botParticipants.length === 0) return;

    const botTimers = botParticipants.map(bot => {
       const bId = bot.userId;
       const botTimer = setInterval(async () => {
         const currentSnap = await get(ref(db, `matches/${roomId}/participants/${bId}`));
         if (!currentSnap.exists()) return;
         const progressProps = currentSnap.val() as MatchProgress;
         if (progressProps.finished) {
           clearInterval(botTimer);
           return;
         }

         const nextIndex = progressProps.currentIndex + 1;
         const isCorrect = Math.random() > 0.35;
         const pointsEarned = isCorrect ? 100 : 0;
         const nextScore = progressProps.score + pointsEarned;
         const nextFinished = nextIndex >= 10;

         await update(ref(db, `matches/${roomId}/participants/${bId}`), {
            currentIndex: nextIndex,
            score: nextScore,
            finished: nextFinished,
            accuracy: Math.round((nextScore / (nextIndex * 100)) * 100) || 0
         });
       }, 4500 + Math.random() * 5000);

       return { id: bId, timer: botTimer };
    });

    return () => {
       botTimers.forEach(t => clearInterval(t.timer));
    };
  }, [room?.status, room?.hostId, currentUser?.id, roomId, winner]);

  // Admin Auto Correct
  useEffect(() => {
    if (currentUser?.role === 'admin' && currentUser?.autoCorrectEnabled && !isAnswered && !loading && quizzes[currentIndex] && !winner) {
      const timer = setTimeout(() => {
        handleAnswer(quizzes[currentIndex].correctAnswerIndex);
      }, 1500); // Slightly more delay for multiplayer feel
      return () => clearTimeout(timer);
    }
  }, [currentIndex, isAnswered, loading, currentUser?.autoCorrectEnabled, winner, quizzes]);

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

    if (newIndex >= 10) {
      setTimeout(() => {
        setSelectedOption(null);
        setIsAnswered(false);
        setHiddenOptions([]);
        setPollResults(null);
        setShowHint(false);
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

  const useAudiencePoll = async () => {
    if (!currentUser || isAnswered || (currentUser.lifelines?.audiencePoll || 0) <= 0 || pollResults) return;

    const correctIdx = currentQuiz.correctAnswerIndex;
    let results = [0, 0, 0, 0];
    let remaining = 100;
    
    const correctPercent = Math.floor(Math.random() * 30) + 40;
    results[correctIdx] = correctPercent;
    remaining -= correctPercent;
    
    const others = [0, 1, 2, 3].filter(i => i !== correctIdx);
    for (let i = 0; i < 2; i++) {
        const p = Math.floor(Math.random() * (remaining / (3 - i)));
        results[others[i]] = p;
        remaining -= p;
    }
    results[others[2]] = remaining;

    setPollResults(results);

    await set(ref(db, `users/${currentUser.id}/lifelines/audiencePoll`), (currentUser.lifelines?.audiencePoll || 0) - 1);
  };

  const useHint = async () => {
    if (!currentUser || isAnswered || (currentUser.lifelines?.hint || 0) <= 0 || showHint) return;
    setShowHint(true);
    await set(ref(db, `users/${currentUser.id}/lifelines/hint`), (currentUser.lifelines?.hint || 0) - 1);
  };

  const useChangeQuiz = async () => {
    if (!currentUser || isAnswered || (currentUser.lifelines?.changeQuiz || 0) <= 0) return;

    setSkippedCount(prev => prev + 1);
    setSelectedOption(null);
    setHiddenOptions([]);
    setPollResults(null);
    setShowHint(false);

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
        hasQuit: true,
        score: myProgress?.score || 0,
      });
      
      const participants = Object.values(room.participants) as any[];
      const activeOthers = participants.filter(p => p.userId !== currentUser.id && !p.finished);
      if (activeOthers.length === 0) {
        finalizeGame(room);
      } else {
        onClose();
      }
    }
  };
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || !room) return (
     <div className="fixed inset-0 bg-white dark:bg-black z-[130] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
     </div>
  );

  const opponentId = Object.keys(room.participants).find(id => id !== currentUser?.id);
  const myProgress = room.participants[currentUser?.id || ''];
  const opponentProgress = room.participants[opponentId || ''];

  if (!isBot && (room.status === 'accepted' || room.status === 'waiting')) {
    const handleReadyToggle = async () => {
      try {
        const dbPath = `matches/${roomId}/participants/${currentUser?.id}/ready`;
        const nextReadyState = !myProgress?.ready;
        await set(ref(db, dbPath), nextReadyState);

        // Fetch latest room to see if everyone is ready
        const roomSnap = await get(ref(db, `matches/${roomId}`));
        if (roomSnap.exists()) {
          const data = roomSnap.val();
          const parts = Object.values(data.participants) as any[];
          if (parts.length >= 2 && parts.every(p => p.ready)) {
            await update(ref(db, `matches/${roomId}`), {
              status: 'playing',
              startTime: Date.now()
            });
          }
        }
      } catch (err) {
        console.error("Failed to toggle ready state:", err);
      }
    };

    return (
      <div className="fixed inset-0 bg-neutral-50 dark:bg-[#050505] z-[130] flex flex-col items-center justify-center p-8 text-center transition-colors duration-300 text-neutral-900 dark:text-white col-span-full">
         <div className="w-24 h-24 bg-primary/10 rounded-[2.5rem] flex items-center justify-center text-primary mb-6 animate-pulse border border-primary/20 shadow-[0_0_50px_rgba(250,204,21,0.15)]">
            <Clock size={40} className="animate-spin duration-1000" style={{ animationDuration: '3s' }} />
         </div>

         <h2 className="text-2xl font-black mb-2 uppercase tracking-tighter text-neutral-900 dark:text-white">
            Match Lobby
         </h2>/ / lobby-header-placeholder
         <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] mb-8">
            Challenge Accepted
         </p>

         <div className="flex items-center gap-6 mb-8 w-full max-w-sm justify-center">
            {/* My User Card */}
            <div className={cn(
              "flex-1 p-5 rounded-[2rem] border transition-all duration-300 flex flex-col items-center",
              myProgress?.ready 
                ? "border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)] bg-green-500/5 text-green-500" 
                : "border-black/5 dark:border-white/5 bg-neutral-100 dark:bg-white/5"
            )}>
              <div className="w-12 h-12 bg-neutral-200 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-3 text-neutral-500 dark:text-white/60">
                <Users size={20} />
              </div>
              <p className="font-black text-xs uppercase tracking-tight max-w-[100px] truncate text-neutral-900 dark:text-white">
                {currentUser?.name || "You"}
              </p>
              <span className={cn(
                "text-[8px] font-black uppercase tracking-widest mt-2 px-2.5 py-1 rounded-full",
                myProgress?.ready ? "bg-green-500/10 text-green-500" : "bg-neutral-200 dark:bg-white/10 text-neutral-500 dark:text-white/40"
              )}>
                {myProgress?.ready ? "Ready" : "Waiting"}
              </span>
            </div>

            {/* Duel vs Icon */}
            <div className="text-neutral-400 dark:text-white/20 font-sans italic text-sm">VS</div>

            {/* Opponent User Card */}
            <div className={cn(
              "flex-1 p-5 rounded-[2rem] border transition-all duration-300 flex flex-col items-center",
              opponentProgress?.ready 
                ? "border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)] bg-green-500/5 text-green-500" 
                : "border-black/5 dark:border-white/5 bg-neutral-100 dark:bg-white/5"
            )}>
              <div className="w-12 h-12 bg-neutral-200 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-3 text-neutral-500 dark:text-white/60">
                <Users size={20} />
              </div>
              <p className="font-black text-xs uppercase tracking-tight max-w-[100px] truncate text-neutral-900 dark:text-white">
                {opponentProgress?.userName || "Opponent"}
              </p>
              <span className={cn(
                "text-[8px] font-black uppercase tracking-widest mt-2 px-2.5 py-1 rounded-full",
                opponentProgress 
                  ? (opponentProgress.ready ? "bg-green-500/10 text-green-500" : "bg-neutral-200 dark:bg-white/10 text-neutral-550 dark:text-white/40") 
                  : "bg-neutral-150 dark:bg-white/5 text-neutral-400 dark:text-white/20"
              )}>
                {opponentProgress ? (opponentProgress.ready ? "Ready" : "Waiting") : "Joining..."}
              </span>
            </div>
         </div>

         <div className="bg-neutral-100 dark:bg-white/5 p-6 rounded-[2rem] border border-black/5 dark:border-white/5 max-w-sm w-full space-y-4 mb-8">
            <p className="text-xs text-neutral-600 dark:text-white/60 font-medium leading-relaxed">
              Click <strong>Play Now</strong> to confirm you are ready. Once BOTH players click Play Now, the match will automatically begin!
            </p>
         </div>

          <div className="flex flex-col gap-3 w-full max-w-sm">
            <button 
              onClick={handleReadyToggle}
              className={cn(
                "w-full py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] transition-all transform hover:scale-105 active:scale-95 shadow-lg font-sans",
                myProgress?.ready 
                  ? "bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/15 text-neutral-950 dark:text-white shadow-none" 
                  : "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 text-black shadow-green-500/20 active:scale-95 animate-pulse"
              )}
            >
              {myProgress?.ready ? "Cancel Ready" : "Play Now (Ready)"}
            </button>

           <button 
             onClick={() => {
               if (onMinimize) {
                 onMinimize();
               } else {
                 onClose();
               }
             }}
             className="w-full py-4 rounded-2xl bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] transition-all border border-black/5 dark:border-white/5 text-neutral-700 dark:text-white/60 font-sans"
           >
             Play Later
           </button>
           
           <button 
             onClick={async () => {
               const verified = await confirm({
                 title: 'Leave Lobby?',
                 description: 'Are you sure you want to exit this match lobby?',
                 type: 'confirm'
               });
               if (!verified) return;

               try {
                 const hostId = room.hostId;
                 const opponentId = Object.keys(room.participants).find(id => id !== hostId);
                 
                 // Clean up challenges & replies for both users
                 if (hostId) {
                   await remove(ref(db, `users/${hostId}/challenges/${opponentId || 'unknown'}`));
                   await remove(ref(db, `users/${hostId}/challengeReplies/${opponentId || 'unknown'}`));
                 }
                 if (opponentId) {
                   await remove(ref(db, `users/${opponentId}/challenges/${hostId || 'unknown'}`));
                   await remove(ref(db, `users/${opponentId}/challengeReplies/${hostId || 'unknown'}`));
                 }
                 
                 // Remove match
                 await remove(ref(db, `matches/${roomId}`));
                 onClose();
               } catch (err) {
                 console.error("Failed to exit lobby:", err);
                 onClose();
               }
             }}
             className="w-full py-4 rounded-2xl bg-neutral-100 dark:bg-white/5 hover:bg-red-500/10 hover:text-red-500 text-[10px] font-black uppercase tracking-[0.15em] transition-all border border-black/5 dark:border-white/5 hover:border-red-500/20 text-neutral-500 dark:text-white/40"
           >
             Leave Lobby
           </button>
         </div>
      </div>
    );
  }

  if (winner) {
    const isTeam = room?.isTeamBattle;

    // Define team aggregated values
    const blueTeam = Object.values(room?.participants || {}).filter((p: any) => p.team === 'blue');
    const redTeam = Object.values(room?.participants || {}).filter((p: any) => p.team === 'red');
    const blueTotal = blueTeam.reduce((sum, p: any) => sum + p.score, 0);
    const redTotal = redTeam.reduce((sum, p: any) => sum + p.score, 0);

    return (
      <div className="fixed inset-0 bg-neutral-50/95 dark:bg-black/95 z-[140] flex flex-col items-center justify-center p-8 text-center backdrop-blur-xl overflow-y-auto text-neutral-900 dark:text-white transition-colors duration-300">
          <div className="w-16 h-16 bg-neutral-200 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-6 border border-black/10 dark:border-white/10 text-primary">
             <Trophy size={32} />
          </div>

          <h2 className="text-2xl font-black mb-2 tracking-tighter uppercase text-neutral-900 dark:text-white">
             Battle Completed
          </h2>

          {isTeam ? (
             <div className="mb-8">
                <span className={cn(
                   "text-xs font-black px-4 py-2 rounded-full uppercase tracking-widest border",
                   winner === 'team_blue' ? "bg-blue-500/20 border-blue-500/30 text-blue-500 dark:text-blue-400" :
                   winner === 'team_red' ? "bg-red-500/20 border-red-500/30 text-red-500 dark:text-red-400" :
                   "bg-yellow-500/20 border-yellow-500/30 text-yellow-600 dark:text-yellow-500"
                )}>
                   {winner === 'team_blue' ? "🔵 TEAM BLUE VICTORIOUS!" :
                    winner === 'team_red' ? "🔴 TEAM RED VICTORIOUS!" :
                    "🤝 IT'S A TEAM TIE!"}
                </span>
             </div>
          ) : (
             <div className="mb-8">
                <span className="text-sm font-black uppercase tracking-widest text-primary">
                   {winner === currentUser?.id ? "🏆 YOU ARE VICTORIOUS!" : "💀 OPPONENT WON!"}
                </span>
             </div>
          )}

          {isTeam ? (
             <div className="space-y-6 w-full max-w-sm mb-10">
                <div className="flex gap-4">
                   <div className="flex-1 bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10 text-center">
                       <p className="text-[8px] font-black text-blue-500 dark:text-blue-400 uppercase tracking-widest mb-1">Blue Team</p>
                       <p className="text-lg font-black text-blue-600 dark:text-blue-300">{blueTotal} PTS</p>
                   </div>
                   <div className="flex-1 bg-red-500/5 p-4 rounded-2xl border border-red-500/10 text-center">
                       <p className="text-[8px] font-black text-red-500 dark:text-red-400 uppercase tracking-widest mb-1">Red Team</p>
                       <p className="text-lg font-black text-red-600 dark:text-red-300">{redTotal} PTS</p>
                   </div>
                </div>

                <div className="bg-neutral-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-3xl p-5 space-y-3.5 text-left">
                   <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500 dark:text-white/40 border-b border-black/5 dark:border-white/5 pb-2">Score Sheet</p>
                   {Object.values(room?.participants || {}).sort((a: any, b: any) => b.score - a.score).map((p: any, idx: number) => (
                      <div key={`arena-score-${p.userId || idx}-${idx}`} className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                            <span className={cn("w-2 h-2 rounded-full", p.team === 'blue' ? "bg-blue-500" : "bg-red-500")} />
                            <span className="text-xs font-bold text-neutral-800 dark:text-white/80">{p.userName}</span>
                            {p.userId === currentUser?.id && <span className="text-[7px] bg-primary/25 text-primary px-1 rounded font-black uppercase font-bold">You</span>}
                         </div>
                         <span className="text-xs font-black text-neutral-900 dark:text-white">{p.score} pts</span>
                      </div>
                   ))}
                </div>
             </div>
          ) : (
             <div className="space-y-4 w-full max-w-sm mb-10">
                <div className="flex gap-4">
                   <div className="flex-1 bg-neutral-100 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5 text-center">
                       <p className="text-[8px] font-black text-neutral-550 dark:text-white/40 uppercase tracking-widest mb-1">Your Score</p>
                       <p className="text-xl font-black text-primary">{myProgress?.score || 0} pts</p>
                   </div>
                   <div className="flex-1 bg-neutral-100 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5 text-center">
                       <p className="text-[8px] font-black text-neutral-550 dark:text-white/40 uppercase tracking-widest mb-1 truncate">{opponentProgress?.userName || 'Opponent'}</p>
                       <p className="text-xl font-black text-neutral-900 dark:text-white">{opponentProgress?.score || 0} pts</p>
                   </div>
                </div>

                <div className="bg-neutral-100 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-3xl p-5 space-y-3.5 text-left">
                   <p className="text-[9px] font-black uppercase tracking-widest text-primary border-b border-black/5 dark:border-white/5 pb-2">Battle Scoresheet</p>
                   {Object.values(room?.participants || {}).sort((a: any, b: any) => (b.score || 0) - (a.score || 0)).map((p: any, idx: number) => (
                      <div key={`arena-score-${p.userId || idx}-${idx}`} className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                            <span className={cn("w-1.5 h-1.5 rounded-full", p.userId === currentUser?.id ? "bg-primary" : "bg-neutral-400 dark:bg-white/45")} />
                            <span className="text-xs font-bold text-neutral-800 dark:text-white/80">{p.userName}</span>
                            {p.userId === currentUser?.id && <span className="text-[7px] bg-primary/20 text-primary px-1.5 rounded font-black uppercase font-bold ml-1">You</span>}
                            {p.hasQuit && <span className="text-[7px] bg-red-500/20 text-red-500 px-1.5 rounded font-black uppercase ml-1">Surrendered</span>}
                         </div>
                         <span className="text-xs font-black text-neutral-900 dark:text-white">{p.score || 0} PTS</span>
                      </div>
                   ))}
                </div>
             </div>
          )}

          <button 
            onClick={onClose}
            className="bg-primary text-black font-black px-12 py-4 rounded-2xl uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20 hover:scale-105 transition-all w-full max-w-sm"
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
                 onClick={() => setLanguage(l => l === 'en' ? 'hi' : 'en')}
                 className={cn(
                   "text-[8px] font-black bg-white/5 px-3 py-2 rounded-full border border-white/5 uppercase transition-all hover:bg-white/10 touch-none select-none",
                   pressTimer && "animate-pulse border-primary/50 text-primary"
                 )}
               >
                 <span className="select-none pointer-events-none flex items-center gap-1">
                   {pressTimer && <Globe size={10} className="animate-spin" />}
                   {language === 'en' ? 'ENG' : 'HIN'}
                 </span>
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
            <div className="text-right">
               <p className="text-[10px] font-black uppercase text-primary tracking-widest truncate">{currentUser?.name}</p>
               <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full mt-1.5 overflow-hidden">
                  <motion.div 
                    animate={{ width: `${(((myProgress as any)?.currentIndex || 0) / 10) * 100}%` }}
                    className="h-full bg-primary"
                  />
               </div>
               <p className="text-[8px] font-black text-white/20 mt-1 uppercase tracking-widest">{(myProgress?.score || 0)} PTS</p>
            </div>

            <div className="w-8 h-8 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center border border-white/5">
                <span className="text-[10px] font-black italic opacity-20">VS</span>
            </div>

            <div>
               <p className="text-[10px] font-black uppercase text-white/60 tracking-widest truncate">
                 {opponentProgress?.userName || 'Opponent'}
               </p>
               <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full mt-1.5 overflow-hidden">
                  <motion.div 
                    animate={{ width: `${(((opponentProgress as any)?.currentIndex || 0) / 10) * 100}%` }}
                    className="h-full bg-white/40"
                  />
               </div>
               <p className="text-[8px] font-black text-white/20 mt-1 uppercase tracking-widest">{(opponentProgress?.score || 0)} PTS</p>
            </div>
         </div>
      </div>

      {opponentProgress?.hasQuit && (
         <div className="bg-red-500/10 border-b border-red-500/20 px-6 py-3 text-center flex items-center justify-center gap-2 text-red-500 shrink-0 select-none animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <p className="text-[10px] font-black uppercase tracking-widest leading-none">
               ({opponentProgress?.userName || 'Opponent'}) has surrendered & quit! You can continue playing to complete your match.
            </p>
         </div>
      )}

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

                    {(() => {
                      const hasImage = !!(
                        currentQuiz?.questionImage && 
                        typeof currentQuiz.questionImage === 'string' && 
                        currentQuiz.questionImage.trim() !== '' && 
                        currentQuiz.questionImage.trim() !== 'undefined'
                      );
                      return (
                        <span className={cn(
                          "text-primary font-black uppercase text-[10px] tracking-[0.3em] mb-4 block w-full",
                          hasImage ? "text-center" : "text-left"
                        )}>
                          Question {currentIndex + 1}
                        </span>
                      );
                    })()}
                    {(() => {
                      const hasImage = !!(
                        currentQuiz?.questionImage && 
                        typeof currentQuiz.questionImage === 'string' && 
                        currentQuiz.questionImage.trim() !== '' && 
                        currentQuiz.questionImage.trim() !== 'undefined'
                      );
                      return hasImage && (
                        <div className="w-full h-40 md:h-56 rounded-2xl overflow-hidden border border-black/5 dark:border-white/5 bg-black/5 dark:bg-white/5 mb-4 max-w-lg mx-auto">
                          <img 
                            src={currentQuiz.questionImage} 
                            alt="Question" 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      );
                    })()}
                    {(() => {
                      const hasImage = !!(
                        currentQuiz?.questionImage && 
                        typeof currentQuiz.questionImage === 'string' && 
                        currentQuiz.questionImage.trim() !== '' && 
                        currentQuiz.questionImage.trim() !== 'undefined'
                      );
                      return (
                        <h2 className={cn(
                          "text-xl md:text-3xl font-black leading-tight tracking-tight w-full",
                          hasImage ? "text-center" : "text-left"
                        )}>
                          {currentQuiz?.question?.[language]}
                        </h2>
                      );
                    })()}
                 </div>

                 {showHint && (
                   <motion.div
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: 'auto', opacity: 1 }}
                     className="mb-6 p-4 rounded-2xl bg-primary/10 border border-primary/20 flex gap-3 items-start"
                   >
                     <Zap size={20} className="text-primary shrink-0 mt-0.5" />
                     <div>
                       <p className="text-[8px] font-black uppercase tracking-widest text-primary mb-1">Lifeline Hint</p>
                       <p className="text-xs font-bold text-white/60">
                         {currentQuiz.hint?.[language] || (currentQuiz.explanation?.[language]?.slice(0, 80) + '...') || "Try focusing on the historical context!"}
                       </p>
                     </div>
                   </motion.div>
                 )}

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
                               "w-full p-4 rounded-2xl border font-bold text-base transition-all flex flex-col gap-3 group overflow-hidden",
                               colorClasses,
                               !isAnswered && !winner && !isHidden && "hover:border-primary/20 active:scale-[0.98]",
                               isHidden && "opacity-0 invisible pointer-events-none"
                            )}
                          >
                             <div className="flex items-center justify-between w-full">
                               <span className="flex-1 text-left">{opt}</span>
                               {isAnswered && isCorrect && <Check size={18} />}
                             </div>
                             {pollResults && !isHidden && (
                               <div className="mt-2 w-full">
                                 <div className="flex items-center justify-between mb-1">
                                   <div className="h-1 bg-white/10 rounded-full flex-1 overflow-hidden">
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
                          </button>
                       );
                    })}
                 </div>
              </motion.div>
            </AnimatePresence>

            <div className="grid grid-cols-4 gap-2 mt-8 md:px-10">
               <button 
                 onClick={useFiftyFifty}
                 disabled={!currentUser || isAnswered || (currentUser.lifelines?.fiftyFifty || 0) <= 0 || hiddenOptions.length > 0}
                 className="flex flex-col items-center gap-2 group disabled:opacity-30"
               >
                  <div className="w-12 h-12 rounded-[33%] bg-white/5 border border-white/10 flex items-center justify-center text-[#facc15] group-hover:bg-[#facc15]/10 group-hover:border-[#facc15]/20 group-hover:scale-110 transition-all">
                     <Zap size={20} />
                  </div>
                  <div className="flex flex-col items-center">
                     <span className="text-[8px] font-black uppercase tracking-widest text-white/40 group-hover:text-[#facc15]">50-50</span>
                     <span className="text-[7px] font-bold text-white/20">{currentUser?.lifelines?.fiftyFifty || 0}</span>
                  </div>
               </button>

               <button 
                 onClick={useAudiencePoll}
                 disabled={!currentUser || isAnswered || (currentUser.lifelines?.audiencePoll || 0) <= 0 || !!pollResults}
                 className="flex flex-col items-center gap-2 group disabled:opacity-30"
               >
                  <div className="w-12 h-12 rounded-[33%] bg-white/5 border border-white/10 flex items-center justify-center text-green-500 group-hover:bg-green-500/10 group-hover:border-green-500/20 group-hover:scale-110 transition-all">
                     <Users size={20} />
                  </div>
                  <div className="flex flex-col items-center">
                     <span className="text-[8px] font-black uppercase tracking-widest text-white/40 group-hover:text-green-500">Poll</span>
                     <span className="text-[7px] font-bold text-white/20">{currentUser?.lifelines?.audiencePoll || 0}</span>
                  </div>
               </button>

               <button 
                 onClick={useHint}
                 disabled={!currentUser || isAnswered || (currentUser.lifelines?.hint || 0) <= 0 || showHint}
                 className="flex flex-col items-center gap-2 group disabled:opacity-30"
               >
                  <div className="w-12 h-12 rounded-[33%] bg-white/5 border border-white/10 flex items-center justify-center text-primary group-hover:bg-primary/10 group-hover:border-primary/20 group-hover:scale-110 transition-all">
                     <Zap size={20} />
                  </div>
                  <div className="flex flex-col items-center">
                     <span className="text-[8px] font-black uppercase tracking-widest text-white/40 group-hover:text-primary">Hint</span>
                     <span className="text-[7px] font-bold text-white/20">{currentUser?.lifelines?.hint || 0}</span>
                  </div>
               </button>

               <button 
                 onClick={useChangeQuiz}
                 disabled={!currentUser || isAnswered || (currentUser.lifelines?.changeQuiz || 0) <= 0}
                 className="flex flex-col items-center gap-2 group disabled:opacity-30"
               >
                  <div className="w-12 h-12 rounded-[33%] bg-white/5 border border-white/10 flex items-center justify-center text-red-500 group-hover:bg-red-500/10 group-hover:border-red-500/20 group-hover:scale-110 transition-all">
                     <RefreshCw size={20} />
                  </div>
                  <div className="flex flex-col items-center">
                     <span className="text-[8px] font-black uppercase tracking-widest text-white/40 group-hover:text-red-500">Skip</span>
                     <span className="text-[7px] font-bold text-white/20">{currentUser?.lifelines?.changeQuiz || 0}</span>
                  </div>
               </button>
            </div>
         </div>
      </div>

       <div className="p-4 border-t border-black/5 dark:border-white/5">
          <div className="flex items-center justify-center gap-3">
             <div className="flex items-center gap-1.5 px-3 py-1 bg-white/5 rounded-lg border border-white/5">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Server Live</span>
             </div>
             <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Topic: {room ? getTopicName(room.topicId) : ""}</p>
          </div>
       </div>



      <AnimatePresence>
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
                className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 p-5 rounded-2xl font-black text-center text-2xl tracking-[0.5em] outline-none focus:border-primary transition-all text-black dark:text-white font-mono"
                autoFocus
              />

              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    setShowSpecialPin(false);
                    setPinInput('');
                  }}
                  className="flex-1 py-4 font-black uppercase tracking-widest text-[10px] bg-black/5 dark:bg-white/5 rounded-2xl hover:bg-red-500/10 hover:text-red-500 transition-all text-black/60 dark:text-white/60"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    if (pinInput === settings?.specialPin) {
                      setShowSpecialPin(false);
                      setShowSpecialChat(true);
                      setPinInput('');
                    } else {
                      alert({ title: 'Incorrect PIN', description: 'The access code you entered is invalid.', type: 'error' });
                    }
                  }}
                  className="flex-2 py-4 font-black uppercase tracking-widest text-[10px] bg-primary text-black rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"
                >
                  Verify Access
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showSpecialChat && (
          <div className="fixed inset-0 z-[310] bg-white dark:bg-[#050505] flex flex-col transition-colors duration-300">
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
              {mySpecialMessages.map((msg: any, idx) => (
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
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
