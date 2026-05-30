import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { ref, onValue, set, remove, onChildAdded, get, update, push } from 'firebase/database';
import { useUser } from '../contexts/UserContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useDialog } from '../contexts/DialogContext';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Swords, Trophy, X, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { NotificationService } from '../services/notificationService';
import { LeaderboardService } from '../services/leaderboardService';
import { logActivity } from '../activityService';

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
  const [challengeIndex, setChallengeIndex] = useState(0);
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

  const [challengeReplies, setChallengeReplies] = useState<any[]>([]);
  const [activeReply, setActiveReply] = useState<{
    id: string;
    opponentId: string;
    opponentName: string;
    roomId: string;
    status: 'accepted' | 'rejected';
    timestamp: number;
  } | null>(null);

  const [postponedReplies, setPostponedReplies] = useState<Record<string, boolean>>({});
  const [postponedAcceptedMatches, setPostponedAcceptedMatches] = useState<Record<string, boolean>>({});

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
                const tokens = NotificationService.getTokensFromValue(tokensSnapshot.val());
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

  // Listen for challenge replies
  useEffect(() => {
    if (!currentUser) return;

    const repliesRef = ref(db, `users/${currentUser.id}/challengeReplies`);
    const unsubscribe = onValue(repliesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const pendingReplies = Object.entries(data)
          .map(([id, val]: [string, any]) => ({ id, ...val }))
          .sort((a, b) => b.timestamp - a.timestamp);
        setChallengeReplies(pendingReplies);
      } else {
        setChallengeReplies([]);
      }
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  useEffect(() => {
    if (challengeReplies.length > 0 && !activeReply) {
      const next = challengeReplies.find(r => r.status === 'rejected' || !postponedReplies[r.id]);
      if (next) {
        setActiveReply({
          id: next.id,
          opponentId: next.opponentId,
          opponentName: next.opponentName,
          roomId: next.roomId,
          status: next.status,
          timestamp: next.timestamp
        });
      }
    } else if (challengeReplies.length === 0) {
      setActiveReply(null);
    }
  }, [challengeReplies, activeReply, postponedReplies]);

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
    if (challenges.length > 0) {
      const clampedIndex = Math.min(challengeIndex, challenges.length - 1);
      const nextChallenge = challenges[clampedIndex];
      
      // Update only if it's a different challenge roomId or host id
      if (!activeChallenge || activeChallenge.id !== nextChallenge.id) {
        setActiveChallenge({
          id: nextChallenge.id,
          roomId: nextChallenge.roomId,
          hostName: nextChallenge.hostName,
          settings: undefined // Settings listener will load them
        });
      }
      if (clampedIndex !== challengeIndex) {
        setChallengeIndex(clampedIndex);
      }
    } else {
      if (activeChallenge !== null) {
        setActiveChallenge(null);
      }
      if (challengeIndex !== 0) {
        setChallengeIndex(0);
      }
    }
  }, [challenges, challengeIndex]);

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

  const sendChallengeFromReply = async (targetUserId: string) => {
    if (!currentUser) return;
    
    // Create match room
    const roomRef = push(ref(db, 'matches'));
    const roomId = roomRef.key!;
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const room = {
      id: roomId,
      topicId: currentUser.selectedTopicId || 'general',
      joinCode: code,
      hostId: currentUser.id,
      participants: {
        [currentUser.id]: { userId: currentUser.id, userName: currentUser.name, score: 0, currentIndex: 0, finished: false, accuracy: 0 }
      },
      status: 'waiting',
      timerEnabled: true,
      whoFirstMode: true,
      totalTime: 5,
      createdAt: Date.now(),
      isChallenge: true,
      targetUserId
    };

    await set(roomRef, room);
    
    // Notify the user via RTDB
    await update(ref(db, `users/${targetUserId}/challenges`), {
      [currentUser.id]: {
        roomId,
        hostId: currentUser.id,
        hostName: currentUser.name,
        timestamp: Date.now(),
        status: 'pending'
      }
    });

    // Real FCM Notification if Admin SDK is loaded
    if (serviceAccount && settings?.pushNotificationsEnabled !== false) {
      try {
        const tokensSnapshot = await get(ref(db, `fcmTokens/${targetUserId}`));
        if (tokensSnapshot.exists()) {
          const tokens = NotificationService.getTokensFromValue(tokensSnapshot.val());
          
          const templateSnapshot = await get(ref(db, 'customNotifications/challenge'));
          let title = "New Challenge";
          let body = `${currentUser.name} Challenging You For A Match`;
          
          if (templateSnapshot.exists()) {
            const template = templateSnapshot.val();
            if (template?.title) title = template.title;
            if (template?.body) body = template.body.replace('{player}', currentUser.name);
          }

          const pushData = {
            action_type: 'challenge',
            roomId,
            hostId: currentUser.id,
            hostName: currentUser.name,
            targetUserId: targetUserId,
            targetUserName: activeReply?.opponentName || 'Opponent'
          };

          for (const token of tokens) {
            await NotificationService.sendToToken(serviceAccount, token, title, body, undefined, pushData);
          }
        }
      } catch (err) {
        console.error("FCM Send failed:", err);
      }
    }
  };

  const acceptChallenge = async (challengeToAccept?: any) => {
    const target = challengeToAccept || activeChallenge;
    if (!target || !currentUser) return;
    
    try {
      const roomId = target.roomId;
      const hostId = target.id; // User A's ID
      
      // Update match room
      const roomRef = ref(db, `matches/${roomId}`);
      const roomSnap = await get(roomRef);
      
      if (!roomSnap.exists()) {
        await declineChallenge(target);
        return;
      }

      // Add to Host's replies
      await set(ref(db, `users/${hostId}/challengeReplies/${currentUser.id}`), {
        opponentId: currentUser.id,
        opponentName: currentUser.name,
        roomId: roomId,
        status: 'accepted',
        timestamp: Date.now()
      });

      // Send actual FCM push to host!
      if (serviceAccount) {
        try {
          const tokensSnapshot = await get(ref(db, `fcmTokens/${hostId}`));
          if (tokensSnapshot.exists()) {
            const tokens = NotificationService.getTokensFromValue(tokensSnapshot.val());
            const title = "Challenge Accepted!";
            const body = `${currentUser.name} accepted your challenge. Click Play Now!`;
            const pushData = {
              action_type: 'reply_accepted',
              roomId: roomId,
              opponentId: currentUser.id,
              opponentName: currentUser.name
            };
            for (const token of tokens) {
              await NotificationService.sendToToken(serviceAccount, token, title, body, undefined, pushData);
            }
          }
        } catch (e) {
          console.error("FCM Send reply accepted failed", e);
        }
      }

      await set(ref(db, `matches/${roomId}/participants/${currentUser.id}`), {
        userId: currentUser.id,
        userName: currentUser.name,
        score: 0,
        currentIndex: 0,
        finished: false,
        accuracy: 0
      });

      // Erase B's pending challenge
      await remove(ref(db, `users/${currentUser.id}/challenges/${target.id}`));
      
      // Update room status to 'accepted'
      await set(ref(db, `matches/${roomId}/status`), 'accepted');
      
      // Load game per the requirement
      window.dispatchEvent(new CustomEvent('start-match', { 
        detail: { roomId: roomId } 
      }));

      // Log user activity
      await logActivity(
        currentUser.id,
        currentUser.name,
        'accept_challenge',
        `Accepted a match challenge from host: ${target.hostName || hostId}`
      );

      setActiveChallenge(null);
    } catch (err) {
      console.error("Failed to accept challenge", err);
      await declineChallenge(target);
    }
  };

  const declineChallenge = async (challengeToDecline?: any) => {
    const target = challengeToDecline || activeChallenge;
    if (!target || !currentUser) return;

    try {
      const roomId = target.roomId;
      const hostId = target.id; // User A's ID

      // Create a challenge reply informing User A about rejection
      await set(ref(db, `users/${hostId}/challengeReplies/${currentUser.id}`), {
        opponentId: currentUser.id,
        opponentName: currentUser.name,
        roomId: roomId,
        status: 'rejected',
        timestamp: Date.now()
      });

      // Send FCM push to host about rejection
      if (serviceAccount) {
        try {
          const tokensSnapshot = await get(ref(db, `fcmTokens/${hostId}`));
          if (tokensSnapshot.exists()) {
            const tokens = NotificationService.getTokensFromValue(tokensSnapshot.val());
            const title = "Challenge Declined";
            const body = `${currentUser.name} rejected your challenge match.`;
            const pushData = {
              action_type: 'reply_rejected',
              roomId: roomId,
              opponentId: currentUser.id,
              opponentName: currentUser.name
            };
            for (const token of tokens) {
              await NotificationService.sendToToken(serviceAccount, token, title, body, undefined, pushData);
            }
          }
        } catch (e) {
          console.error("FCM Send reply rejected failed", e);
        }
      }

      // Log user activity
      await logActivity(
        currentUser.id,
        currentUser.name,
        'reject_challenge',
        `Declined a match challenge from host: ${target.hostName || hostId}`
      );
    } catch (err) {
      console.error("Error declining challenge replies", err);
    }

    await remove(ref(db, `users/${currentUser.id}/challenges/${target.id}`));
    setActiveChallenge(null);
  };

  const cancelAcceptedMatch = async () => {
    if (!acceptedMatch || !currentUser) return;
    try {
      const matchId = acceptedMatch.id;
      const opponentId = acceptedMatch.opponentId;
      
      // Update match status to 'cancelled' in RTDB or delete the room
      await remove(ref(db, `matches/${matchId}`));
      
      // Add a challengeReply informing Opponent about match cancellation by the host (challenger)
      await set(ref(db, `users/${opponentId}/challengeReplies/${currentUser.id}`), {
        opponentId: currentUser.id,
        opponentName: currentUser.name,
        roomId: matchId,
        status: 'cancelled_by_host',
        timestamp: Date.now()
      });

      // Send actual FCM push to notify the opponent about match cancellation!
      if (serviceAccount) {
        try {
          const tokensSnapshot = await get(ref(db, `fcmTokens/${opponentId}`));
          if (tokensSnapshot.exists()) {
            const tokens = NotificationService.getTokensFromValue(tokensSnapshot.val());
            const title = "Challenge Cancelled";
            const body = `${currentUser.name} has cancelled the match challenge.`;
            const pushData = {
              action_type: 'reply_rejected',
              roomId: matchId,
              opponentId: currentUser.id,
              opponentName: currentUser.name,
              reason: 'cancelled_by_host'
            };
            for (const token of tokens) {
              await NotificationService.sendToToken(serviceAccount, token, title, body, undefined, pushData);
            }
          }
        } catch (e) {
          console.error("FCM Send cancel match failed", e);
        }
      }

      // Log user activity
      await logActivity(
        currentUser.id,
        currentUser.name,
        'cancel_challenge',
        `Cancelled the match invitation after acceptance. MatchRoom: ${matchId}`
      );

      setAcceptedMatch(null);
    } catch (err) {
      console.error("Error cancelling accepted match:", err);
    }
  };

  const startMatch = async () => {
    if (!acceptedMatch || !currentUser) return;
    try {
      await set(ref(db, `matches/${acceptedMatch.id}/status`), 'playing');
      
      // Dispatch start-match event to local game screen routing
      window.dispatchEvent(new CustomEvent('start-match', { 
        detail: { roomId: acceptedMatch.id } 
      }));

      // Log user activity
      await logActivity(
        currentUser.id,
        currentUser.name,
        'play_now',
        `Began active match gameplay for room: ${acceptedMatch.id} [Play Now click]`
      );

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
            className="fixed inset-0 z-[250] flex flex-col items-center justify-center p-6 bg-black/85 backdrop-blur-md"
          >
            {/* Swipable Carousel container */}
            <div className="relative w-full max-w-sm flex flex-col items-center">
              
              {/* Carousel Arrows */}
              {challenges.length > 1 && challengeIndex > 0 && (
                <button
                  onClick={() => setChallengeIndex(prev => prev - 1)}
                  className="absolute -left-16 top-1/2 -translate-y-1/2 bg-white/5 hover:bg-white/10 text-white p-3 rounded-2xl border border-white/5 transition-all active:scale-95 hidden md:flex items-center justify-center z-[260]"
                >
                  <ChevronLeft size={20} className="text-primary" />
                </button>
              )}
              {challenges.length > 1 && challengeIndex < challenges.length - 1 && (
                <button
                  onClick={() => setChallengeIndex(prev => prev + 1)}
                  className="absolute -right-16 top-1/2 -translate-y-1/2 bg-white/5 hover:bg-white/10 text-white p-3 rounded-2xl border border-white/5 transition-all active:scale-95 hidden md:flex items-center justify-center z-[260]"
                >
                  <ChevronRight size={20} className="text-primary" />
                </button>
              )}

              {/* Slider Info Header */}
              <div className="flex items-center justify-between w-full px-4 mb-4 select-none">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
                  Match Invitation
                </span>
                {challenges.length > 1 && (
                  <div className="flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/60">
                    <button 
                      onClick={() => challengeIndex > 0 && setChallengeIndex(prev => prev - 1)}
                      disabled={challengeIndex === 0}
                      className="hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      PREV
                    </button>
                    <span className="mx-1 text-primary">
                      {challengeIndex + 1} / {challenges.length}
                    </span>
                    <button 
                      onClick={() => challengeIndex < challenges.length - 1 && setChallengeIndex(prev => prev + 1)}
                      disabled={challengeIndex === challenges.length - 1}
                      className="hover:text-white disabled:opacity-30 disabled:pointer-events-none transition-colors"
                    >
                      NEXT
                    </button>
                  </div>
                )}
              </div>

              {/* Polish Card Container */}
              <motion.div
                key={activeChallenge.id}
                initial={{ x: 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -80, opacity: 0 }}
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(event, info) => {
                  const swipeThreshold = 55;
                  if (info.offset.x < -swipeThreshold && challengeIndex < challenges.length - 1) {
                    setChallengeIndex(prev => prev + 1);
                  } else if (info.offset.x > swipeThreshold && challengeIndex > 0) {
                    setChallengeIndex(prev => prev - 1);
                  }
                }}
                className="w-full bg-gradient-to-br from-primary/20 to-black p-[2px] rounded-[3rem] shadow-[0_0_50px_rgba(var(--primary-rgb),0.2)] cursor-grab active:cursor-grabbing select-none"
              >
                <div className="bg-[#0a0a0a] p-8 rounded-[2.9rem] flex flex-col items-center text-center">
                  <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6 animate-bounce shadow-inner shadow-primary/20">
                     <Swords size={40} />
                  </div>
                  
                  <h2 className="text-2xl font-black mb-1 uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
                    Quiz Match Challenge!
                  </h2>
                  <p className="text-[11px] font-black text-primary uppercase tracking-[0.3em] mb-6 animate-pulse">
                    Challenging You!
                  </p>

                  <div className="mb-8">
                     <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">Invitation</p>
                     <p className="text-lg font-black uppercase tracking-tight text-primary">
                       {activeChallenge.hostName}
                     </p>
                     <p className="text-xs text-white/60 mt-2 font-bold px-4">
                       is challenging you for a quiz match
                     </p>
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
                     onClick={() => acceptChallenge(activeChallenge)}
                     className="w-full py-4 rounded-2xl bg-primary text-black text-xs font-black uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
                    >
                      Accept Challenge
                    </button>
                    <button 
                     onClick={() => declineChallenge(activeChallenge)}
                     className="w-full py-4 rounded-2xl bg-white/5 hover:bg-red-500/10 hover:text-red-500 text-[10px] font-black uppercase tracking-[0.2em] transition-all"
                    >
                      Reject Match
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* Dots Progress Indicators */}
              {challenges.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-6">
                  {challenges.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setChallengeIndex(idx)}
                      className={cn(
                        "h-2 rounded-full transition-all duration-300",
                        idx === challengeIndex ? "w-6 bg-[#32befa]" : "w-2 bg-white/20 hover:bg-white/40"
                      )}
                    />
                  ))}
                </div>
              )}

              {challenges.length > 1 && (
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mt-3 animate-pulse">
                  Swipe left or right to switch cards
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {acceptedMatch && !postponedAcceptedMatches[acceptedMatch.id] && (
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
                     className="w-full py-4 rounded-2xl bg-green-500 text-black text-xs font-black uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-green-500/20 animate-pulse"
                   >
                     PLAY NOW
                   </button>
                   <button 
                    onClick={() => {
                      if (acceptedMatch) {
                        setPostponedAcceptedMatches(prev => ({ ...prev, [acceptedMatch.id]: true }));
                      }
                    }}
                    className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] transition-all text-white/60"
                   >
                     PLAY LATER
                   </button>
                 </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeReply && !postponedReplies[activeReply.id] && (
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
              className={cn(
                "w-full max-w-sm p-[2px] rounded-[3rem] shadow-2xl transition-all",
                activeReply.status === 'accepted' 
                  ? "bg-gradient-to-br from-green-500/20 to-black shadow-[0_0_50px_rgba(34,197,94,0.2)]" 
                  : activeReply.status === 'cancelled_by_host'
                    ? "bg-gradient-to-br from-amber-500/20 to-black shadow-[0_0_50px_rgba(245,158,11,0.2)]"
                    : "bg-gradient-to-br from-red-500/20 to-black shadow-[0_0_50px_rgba(239,68,68,0.2)]"
              )}
            >
              <div className="bg-[#0a0a0a] p-8 rounded-[2.9rem] flex flex-col items-center text-center">
                 <div className={cn(
                   "w-20 h-20 rounded-3xl flex items-center justify-center mb-6 animate-pulse shadow-inner shadow-white/10",
                   activeReply.status === 'accepted' 
                     ? "bg-green-500/10 text-green-500" 
                     : activeReply.status === 'cancelled_by_host'
                       ? "bg-amber-500/10 text-amber-500"
                       : "bg-red-500/10 text-red-500"
                 )}>
                    {activeReply.status === 'accepted' ? <Trophy size={40} /> : <X size={40} />}
                 </div>
                 
                 <h2 className="text-2xl font-black mb-1 uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">
                   Match Update
                 </h2>
                 <p className={cn(
                   "text-[11px] font-black uppercase tracking-[0.3em] mb-6",
                   activeReply.status === 'accepted' 
                     ? "text-green-500" 
                     : activeReply.status === 'cancelled_by_host'
                       ? "text-amber-500"
                       : "text-red-500"
                 )}>
                   {activeReply.status === 'accepted' 
                     ? "Challenge Accepted" 
                     : activeReply.status === 'cancelled_by_host'
                       ? "Challenge Cancelled"
                       : "Challenge Rejected"}
                 </p>

                 <div className="mb-8">
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-1">Friend</p>
                    <p className="text-lg font-black uppercase tracking-tight">{activeReply.opponentName}</p>
                    <p className="text-[10px] text-white/20 mt-1 uppercase font-bold">
                      {activeReply.status === 'accepted' 
                        ? "ready, play now!" 
                        : activeReply.status === 'cancelled_by_host'
                          ? "cancelled the match challenge"
                          : "rejected the challenge"}
                    </p>
                 </div>
                 
                 {activeReply.status === 'accepted' ? (
                   <div className="flex flex-col w-full gap-3">
                     <button 
                      onClick={async () => {
                        // host clicks Play Now
                        await set(ref(db, `matches/${activeReply.roomId}/status`), 'accepted');
                        window.dispatchEvent(new CustomEvent('start-match', { 
                          detail: { roomId: activeReply.roomId } 
                        }));
                        
                        // Log user activity
                        await logActivity(
                          currentUser?.id || 'unknown',
                          currentUser?.name || 'Guest',
                          'play_now',
                          `Host launched match battle room: ${activeReply.roomId}`
                        );

                        await remove(ref(db, `users/${currentUser?.id}/challengeReplies/${activeReply.opponentId}`));
                        setActiveReply(null);
                      }}
                       className="w-full py-4 rounded-2xl bg-green-500 text-black text-xs font-black uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl shadow-green-500/20 animate-pulse"
                     >
                       Play Now
                     </button>
                     <button 
                      onClick={() => {
                        if (activeReply) {
                          setPostponedReplies(prev => ({ ...prev, [activeReply.id]: true }));
                          setActiveReply(null);
                        }
                      }}
                      className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] transition-all text-white/60"
                     >
                       PLAY LATER
                     </button>
                   </div>
                 ) : activeReply.status === 'cancelled_by_host' ? (
                   <div className="flex flex-col w-full gap-3">
                     <button 
                      onClick={async () => {
                        await remove(ref(db, `users/${currentUser?.id}/challengeReplies/${activeReply.opponentId}`));
                        setActiveReply(null);
                      }}
                      className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] transition-all text-white"
                     >
                       Dismiss
                     </button>
                   </div>
                 ) : (
                   <div className="flex flex-col w-full gap-3">
                     <button 
                      onClick={async () => {
                        const targetId = activeReply.opponentId;
                        const oldRoomId = activeReply.roomId;
                        await remove(ref(db, `users/${currentUser?.id}/challengeReplies/${targetId}`));
                        if (oldRoomId) {
                          await remove(ref(db, `matches/${oldRoomId}`));
                        }
                        
                        // Log user activity
                        await logActivity(
                          currentUser?.id || 'unknown',
                          currentUser?.name || 'Guest',
                          'send_challenge',
                          `Re-sent a match challenge from replies dashboard to opponent: ${activeReply.opponentName}`
                        );

                        setActiveReply(null);
                        await sendChallengeFromReply(targetId);
                      }}
                      className="w-full py-4 rounded-2xl bg-primary text-black text-xs font-black uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all"
                     >
                       Challenge Again
                     </button>
                     <button 
                      onClick={async () => {
                        // Log user activity
                        await logActivity(
                          currentUser?.id || 'unknown',
                          currentUser?.name || 'Guest',
                          'cancel_match',
                          `Cancelled match room ${activeReply.roomId} from replies card`
                        );

                        await remove(ref(db, `users/${currentUser?.id}/challengeReplies/${activeReply.opponentId}`));
                        await remove(ref(db, `matches/${activeReply.roomId}`));
                        setActiveReply(null);
                      }}
                      className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] transition-all text-white/60"
                     >
                       Cancel Match
                     </button>
                   </div>
                 )}
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

      {/* Floating Action Badge for Postponed Match / Challenge */}
      <AnimatePresence>
        {(challengeReplies.find(r => r.status === 'accepted' && postponedReplies[r.id]) || (acceptedMatch && postponedAcceptedMatches[acceptedMatch.id])) && (
          (() => {
            const reply = challengeReplies.find(r => r.status === 'accepted' && postponedReplies[r.id]);
            const isMatch = acceptedMatch && postponedAcceptedMatches[acceptedMatch.id];
            const opponentName = reply ? reply.opponentName : 'Opponent';
            return (
              <motion.div
                initial={{ y: 50, scale: 0.8, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: 50, scale: 0.8, opacity: 0 }}
                className="fixed bottom-24 right-6 z-[200]"
              >
                <div className="bg-gradient-to-r from-green-500/30 to-black p-[2px] rounded-3xl shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                  <div className="bg-[#060606] px-5 py-4 rounded-[1.7rem] flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-500/15 rounded-2xl flex items-center justify-center text-green-500 relative animate-pulse border border-green-500/20">
                      <Swords size={18} />
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-400 rounded-full" />
                    </div>
                    <div className="text-left">
                      <p className="text-[9px] font-black uppercase tracking-widest text-green-400">Match Ready!</p>
                      <p className="text-sm font-black uppercase tracking-tighter text-white">
                        Let's play with {opponentName}!
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (reply) {
                            setPostponedReplies(prev => ({ ...prev, [reply.id]: false }));
                          } else if (isMatch && acceptedMatch) {
                            setPostponedAcceptedMatches(prev => ({ ...prev, [acceptedMatch.id]: false }));
                          }
                        }}
                        className="px-5 py-2.5 bg-green-500 hover:bg-green-400 text-black text-[10px] font-black uppercase tracking-wider rounded-xl transition-all font-sans shadow-lg shadow-green-500/20 active:scale-95"
                      >
                        Play Now
                      </button>
                      <button
                        onClick={async () => {
                          const verified = await confirm({
                            title: 'Cancel Match?',
                            description: `Are you sure you want to cancel the match challenge with ${opponentName}?`,
                            type: 'error'
                          });
                          if (!verified) return;

                          try {
                            if (reply) {
                              await remove(ref(db, `users/${currentUser?.id}/challengeReplies/${reply.opponentId}`));
                              await remove(ref(db, `matches/${reply.roomId}`));
                              setPostponedReplies(prev => ({ ...prev, [reply.id]: false }));
                            } else if (acceptedMatch) {
                              await remove(ref(db, `matches/${acceptedMatch.id}`));
                              setPostponedAcceptedMatches(prev => ({ ...prev, [acceptedMatch.id]: false }));
                            }
                          } catch (err) {
                            console.error("Failed to clean up match from badge", err);
                          }
                        }}
                        className="p-2.5 bg-white/5 hover:bg-red-500/10 hover:text-red-500 text-white/40 hover:border-red-500/20 rounded-xl transition-all border border-white/5"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })()
        )}
      </AnimatePresence>
    </>
  );
}
