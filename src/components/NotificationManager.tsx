import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { ref, onValue, set, remove, onChildAdded, get, update } from 'firebase/database';
import { useUser } from '../contexts/UserContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useDialog } from '../contexts/DialogContext';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Swords, Trophy, X, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { NotificationService } from '../services/notificationService';
import { LeaderboardService } from '../services/leaderboardService';

export default function NotificationManager() {
  const { currentUser, settings } = useUser();
  const { serviceAccount } = useNotifications();
  const { confirm } = useDialog();

  // Leaderboard Resets Check
  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    
    const checkReset = () => {
      LeaderboardService.checkAndTriggerReset(serviceAccount);
    };

    checkReset();
    const interval = setInterval(checkReset, 1800000); // Check every 30 mins
    return () => clearInterval(interval);
  }, [currentUser?.role, serviceAccount]);

  const [challenges, setChallenges] = useState<any[]>([]);
  const [activeChallenge, setActiveChallenge] = useState<{
    id: string;
    roomId: string;
    hostName: string;
    settings?: {
      timerEnabled: boolean;
      whoFirstMode: boolean;
    };
  } | null>(null);

  const [acceptedMatch, setAcceptedMatch] = useState<{
    id: string;
    opponentId: string;
    settings?: {
      timerEnabled: boolean;
      whoFirstMode: boolean;
    };
  } | null>(null);

  const [rankUpNotif, setRankUpNotif] = useState<{
    rank: number;
    show: boolean;
  }>({ rank: 0, show: false });

  const [prevRank, setPrevRank] = useState<number | null>(null);

  // Listen for level ups
  useEffect(() => {
    if (!currentUser) return;
    
    if (prevRank !== null && currentUser.rank > prevRank) {
      setRankUpNotif({ rank: currentUser.rank, show: true });
      
      // Also send real FCM if key available
      if (serviceAccount && settings?.pushNotificationsEnabled !== false) {
        (async () => {
          try {
             const tokensSnapshot = await get(ref(db, `fcmTokens/${currentUser.id}`));
             if (tokensSnapshot.exists()) {
                const tokens = Object.values(tokensSnapshot.val()) as string[];
                const templateSnapshot = await get(ref(db, 'customNotifications/rankUp'));
                let title = "Rank Increased!";
                let body = `Congratulations! You reached Rank ${currentUser.rank}!`;
                
                if (templateSnapshot.exists()) {
                  const template = templateSnapshot.val();
                  if (template?.title) title = template.title;
                  if (template?.body) body = template.body.replace('{rank}', currentUser.rank.toString());
                }

                for (const token of tokens) {
                  await NotificationService.sendToToken(serviceAccount, token, title, body);
                }
             }
          } catch (e) {
            console.error("FCM RankUp notify failed", e);
          }
        })();
      }
    }
    setPrevRank(currentUser.rank || 1);
  }, [currentUser?.rank, serviceAccount]);

  // Listen for challenges
  useEffect(() => {
    if (!currentUser) return;

    const challengeRef = ref(db, `users/${currentUser.id}/challenges`);
    const unsubscribe = onValue(challengeRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const pending = Object.entries(data)
          .map(([id, val]: [string, any]) => ({ id, ...val }))
          .filter(c => c.status === 'pending')
          .sort((a, b) => b.timestamp - a.timestamp);
        setChallenges(pending);
      } else {
        setChallenges([]);
      }
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  // Listen for ANY match the user is in that transitions to 'playing'
  useEffect(() => {
    if (!currentUser) return;

    /* Auto-redirect removed per requirement check 
    const matchesRef = ref(db, 'matches');
    const unsubscribe = onValue(matchesRef, (snapshot) => {
      if (snapshot.exists()) {
        const matches = snapshot.val();
        // Check if user is a participant in any 'playing' match
        const activeMatch = Object.values(matches).find((m: any) => 
          m.status === 'playing' && m.participants?.[currentUser.id]
        ) as any;

        if (activeMatch) {
          // Trigger local match start UI
          window.dispatchEvent(new CustomEvent('start-match', { 
            detail: { roomId: activeMatch.id } 
          }));
        }
      }
    });

    return () => unsubscribe();
    */
  }, [currentUser?.id]);

  // Listen for host matches being accepted
  useEffect(() => {
    if (!currentUser) return;

    // We use a query/listener on all matches might be expensive, 
    // but for now we'll listen to a specific 'hostedMatches' list or check active matches
    // To keep it simple and efficient, SocialHub should probably register the roomId
    // However, we can listen to the 'matches' node where hostId matches current user
    const matchesRef = ref(db, 'matches');
    const unsubscribe = onValue(matchesRef, (snapshot) => {
      if (snapshot.exists()) {
        const matches = snapshot.val();
        const accepted = Object.values(matches).find((m: any) => 
          m.hostId === currentUser.id && m.status === 'accepted'
        ) as any;

        if (accepted) {
          // Find the opponent (not the host)
          const opponentId = Object.keys(accepted.participants).find(id => id !== currentUser.id);
          setAcceptedMatch({
            id: accepted.id,
            opponentId: opponentId || ''
          });
        } else {
          setAcceptedMatch(null);
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  useEffect(() => {
    if (challenges.length > 0 && !activeChallenge) {
      const next = challenges[0];
      setActiveChallenge({
        id: next.id,
        roomId: next.roomId,
        hostName: next.hostName
      });
    } else if (challenges.length === 0) {
      setActiveChallenge(null);
    }
  }, [challenges, activeChallenge]);

  // Listen for match settings updates
  useEffect(() => {
    const roomId = activeChallenge?.roomId || acceptedMatch?.id;
    if (!roomId) return;

    const matchRef = ref(db, `matches/${roomId}`);
    return onValue(matchRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        if (activeChallenge) {
          setActiveChallenge(prev => prev ? ({
            ...prev,
            settings: {
              timerEnabled: data.timerEnabled,
              whoFirstMode: data.whoFirstMode
            }
          }) : null);
        }
        if (acceptedMatch) {
          setAcceptedMatch(prev => prev ? ({
            ...prev,
            settings: {
              timerEnabled: data.timerEnabled,
              whoFirstMode: data.whoFirstMode
            }
          }) : null);
        }
      }
    });
  }, [activeChallenge?.roomId, acceptedMatch?.id]);

  const toggleSetting = async (roomId: string, setting: 'timerEnabled' | 'whoFirstMode', current: boolean) => {
    try {
      await update(ref(db, `matches/${roomId}`), {
        [setting]: !current
      });
    } catch (err) {
      console.error("Failed to toggle setting:", err);
    }
  };

  const acceptChallenge = async () => {
    if (!activeChallenge || !currentUser) return;
    
    try {
      // Update match room
      const roomRef = ref(db, `matches/${activeChallenge.roomId}`);
      const roomSnap = await get(roomRef);
      
      if (!roomSnap.exists()) {
        await declineChallenge();
        return;
      }

      await set(ref(db, `matches/${activeChallenge.roomId}/participants/${currentUser.id}`), {
        userId: currentUser.id,
        score: 0,
        currentIndex: 0,
        finished: false,
        accuracy: 0
      });

      // Mark as accepted (remove from challenges list)
      await remove(ref(db, `users/${currentUser.id}/challenges/${activeChallenge.id}`));
      
      // Update room status to 'accepted' (waiting for host to start)
      await set(ref(db, `matches/${activeChallenge.roomId}/status`), 'accepted');
      
      setActiveChallenge(null);
      // Wait for host...
    } catch (err) {
      console.error("Failed to accept challenge", err);
      await declineChallenge();
    }
  };

  const declineChallenge = async () => {
    if (!activeChallenge || !currentUser) return;
    await remove(ref(db, `users/${currentUser.id}/challenges/${activeChallenge.id}`));
    setActiveChallenge(null);
  };

  const startMatch = async () => {
    if (!acceptedMatch) return;
    try {
      await set(ref(db, `matches/${acceptedMatch.id}/status`), 'playing');
      setAcceptedMatch(null);
    } catch (err) {
      console.error("Failed to start match", err);
    }
  };

  return (
    <>
      <AnimatePresence>
        {activeChallenge && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-gradient-to-br from-primary/20 to-black p-[2px] rounded-[3rem] shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)]"
            >
              <div className="bg-[#0a0a0a] p-8 rounded-[2.9rem] flex flex-col items-center text-center">
                 <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6 animate-bounce shadow-inner shadow-primary/20">
                    <Swords size={40} />
                 </div>
                 
                 <h2 className="text-2xl font-black mb-1 uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
                   Match Challenge!
                 </h2>
                 <p className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-6">
                   Pending Invitation
                 </p>

                 <div className="mb-8">
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">Challenger</p>
                    <p className="text-lg font-black uppercase tracking-tight">{activeChallenge.hostName}</p>
                 </div>

                 {/* Settings Toggles for Opponent */}
                 <div className="w-full bg-white/5 rounded-2xl p-4 mb-8 space-y-4">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <Clock size={14} className="text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Shared Timer</span>
                       </div>
                       <button 
                         onClick={() => toggleSetting(activeChallenge.roomId, 'timerEnabled', !!activeChallenge.settings?.timerEnabled)}
                         className={cn(
                            "w-10 h-5 rounded-full transition-all relative p-1",
                            activeChallenge.settings?.timerEnabled ? "bg-primary" : "bg-white/10"
                         )}
                       >
                         <motion.div 
                           animate={{ x: activeChallenge.settings?.timerEnabled ? 20 : 0 }}
                           className="w-3 h-3 bg-white rounded-full shadow-sm" 
                         />
                       </button>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <Swords size={14} className="text-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Who's First Indicator</span>
                       </div>
                       <button 
                         onClick={() => toggleSetting(activeChallenge.roomId, 'whoFirstMode', !!activeChallenge.settings?.whoFirstMode)}
                         className={cn(
                            "w-10 h-5 rounded-full transition-all relative p-1",
                            activeChallenge.settings?.whoFirstMode ? "bg-primary" : "bg-white/10"
                         )}
                       >
                         <motion.div 
                           animate={{ x: activeChallenge.settings?.whoFirstMode ? 20 : 0 }}
                           className="w-3 h-3 bg-white rounded-full shadow-sm" 
                         />
                       </button>
                    </div>
                 </div>
                 
                 <div className="flex flex-col w-full gap-3">
                   <button 
                    onClick={acceptChallenge}
                    className="w-full py-4 rounded-2xl bg-primary text-black text-xs font-black uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
                   >
                     Accept Challenge
                   </button>
                   <button 
                    onClick={declineChallenge}
                    className="w-full py-4 rounded-2xl bg-white/5 hover:bg-red-500/10 hover:text-red-500 text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                   >
                     Reject Match
                   </button>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {acceptedMatch && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-sm bg-gradient-to-br from-green-500/20 to-black p-[2px] rounded-[3rem] shadow-[0_0_50px_rgba(34,197,94,0.2)]"
            >
              <div className="bg-[#0a0a0a] p-8 rounded-[2.9rem] flex flex-col items-center text-center">
                 <div className="w-20 h-20 bg-green-500/10 rounded-3xl flex items-center justify-center text-green-500 mb-6 animate-pulse shadow-inner shadow-green-500/20">
                    <Trophy size={40} />
                 </div>
                 
                 <h2 className="text-2xl font-black mb-1 uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
                   Accepted!
                 </h2>
                 <p className="text-[11px] font-black text-green-500 uppercase tracking-[0.3em] mb-6">
                   Ready for Battle
                 </p>

                 <div className="mb-8">
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">Opponent is Waiting</p>
                    <p className="text-lg font-black uppercase tracking-tight">The match is ready</p>
                 </div>

                 {/* Settings Toggles for Host */}
                 <div className="w-full bg-white/5 rounded-2xl p-4 mb-8 space-y-4">
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <Clock size={14} className="text-green-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Shared Timer</span>
                       </div>
                       <button 
                         onClick={() => toggleSetting(acceptedMatch.id, 'timerEnabled', !!acceptedMatch.settings?.timerEnabled)}
                         className={cn(
                            "w-10 h-5 rounded-full transition-all relative p-1",
                            acceptedMatch.settings?.timerEnabled ? "bg-green-500" : "bg-white/10"
                         )}
                       >
                         <motion.div 
                           animate={{ x: acceptedMatch.settings?.timerEnabled ? 20 : 0 }}
                           className="w-3 h-3 bg-white rounded-full shadow-sm" 
                         />
                       </button>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <Swords size={14} className="text-green-500" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Who's First Indicator</span>
                       </div>
                       <button 
                         onClick={() => toggleSetting(acceptedMatch.id, 'whoFirstMode', !!acceptedMatch.settings?.whoFirstMode)}
                         className={cn(
                            "w-10 h-5 rounded-full transition-all relative p-1",
                            acceptedMatch.settings?.whoFirstMode ? "bg-green-500" : "bg-white/10"
                         )}
                       >
                         <motion.div 
                           animate={{ x: acceptedMatch.settings?.whoFirstMode ? 20 : 0 }}
                           className="w-3 h-3 bg-white rounded-full shadow-sm" 
                         />
                       </button>
                    </div>
                 </div>
                 
                 <div className="flex flex-col w-full gap-3">
                   <button 
                    onClick={startMatch}
                    className="w-full py-4 rounded-2xl bg-green-500 text-black text-xs font-black uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-green-500/20"
                   >
                     Play Game
                   </button>
                   <button 
                    onClick={() => setAcceptedMatch(null)}
                    className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                   >
                     Wait...
                   </button>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rankUpNotif.show && (
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            className="fixed inset-0 z-[210] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
             <div className="bg-gradient-to-br from-primary/20 to-black p-1 rounded-[3rem]">
                <div className="bg-[#0a0a0a] p-10 rounded-[2.9rem] flex flex-col items-center text-center max-w-sm">
                   <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-6 relative">
                      <Trophy size={48} />
                      <motion.div 
                        animate={{ scale: [1, 1.5, 1], opacity: [0, 1, 0] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 bg-primary/20 rounded-full"
                      />
                   </div>
                   <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter">Rank Increase!</h2>
                   <p className="text-white/40 text-sm mb-8 font-bold">You've evolved to Rank {rankUpNotif.rank}</p>
                   <button 
                    onClick={() => setRankUpNotif({ ...rankUpNotif, show: false })}
                    className="w-full bg-primary text-black font-black py-4 rounded-2xl uppercase tracking-[0.2em] text-xs hover:scale-105 active:scale-95 transition-all"
                   >
                     Amazing!
                   </button>
                </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
