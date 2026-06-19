import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue, remove, update, get, set } from 'firebase/database';
import { User } from '../types';
import { Trophy, Medal, Crown, TrendingUp, Bot, Clock, Trash2, Edit2, UserPlus, Heart, Check, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

import { useUser } from '../contexts/UserContext';
import { useNotifications } from '../contexts/NotificationContext';
import { NotificationService } from '../services/notificationService';

import { Skeleton } from './ui/Skeleton';

export default function Leaderboard() {
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'daily' | 'friends' | 'all'>('all');
  const { currentUser } = useUser();
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);

  const [dailyCountdown, setDailyCountdown] = useState('');
  const [weeklyCountdown, setWeeklyCountdown] = useState('');

  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);
  const [sendingRequestId, setSendingRequestId] = useState<string | null>(null);
  const [requestStatus, setRequestStatus] = useState<'send' | 'pending_outgoing' | 'pending_incoming' | 'friends'>('send');
  const [sysSettings, setSysSettings] = useState<any>(null);
  const { serviceAccount } = useNotifications();

  useEffect(() => {
    return onValue(ref(db, 'settings'), (snap) => {
      if (snap.exists()) {
        setSysSettings(snap.val());
      }
    });
  }, []);

  useEffect(() => {
    if (!selectedPlayer || !currentUser) return;
    const isFriend = currentUser.friends?.[selectedPlayer.id];
    const pendingType = currentUser.pendingRequests?.[selectedPlayer.id];
    
    if (isFriend) {
      setRequestStatus('friends');
    } else if (pendingType === 'outgoing') {
      setRequestStatus('pending_outgoing');
    } else if (pendingType === 'incoming') {
      setRequestStatus('pending_incoming');
    } else {
      setRequestStatus('send');
    }
  }, [selectedPlayer, currentUser]);

  const sendLeaderboardFriendRequest = async (targetId: string, targetName: string) => {
    if (!currentUser) return;
    setSendingRequestId(targetId);
    try {
      const targetIsBot = selectedPlayer?.isBot || false;
      const targetPath = targetIsBot ? `bots/${targetId}` : `users/${targetId}`;

      await update(ref(db, `users/${currentUser.id}/pendingRequests`), {
        [targetId]: 'outgoing'
      });
      await update(ref(db, `${targetPath}/pendingRequests`), {
        [currentUser.id]: 'incoming'
      });

      // Send FCM push callback
      if (sysSettings?.pushNotificationsEnabled !== false && serviceAccount) {
        try {
          if (targetIsBot) {
            const adminToken = sysSettings?.adminConfigFcmToken;
            const isMasterFcmEnabled = sysSettings?.adminMasterFcmEnabled !== false;
            if (isMasterFcmEnabled && adminToken && adminToken.trim().length > 10) {
              const title = 'Bot Friend Request';
              const body = `Real player ${currentUser.name} (@${currentUser.username}) sent a friend request to bot ${targetName} (@${selectedPlayer?.username || ''})`;
              const pushData = {
                action_type: 'friend_request_to_bot',
                senderId: currentUser.id,
                senderName: currentUser.name,
                targetUserId: targetId,
                targetUserName: targetName
              };
              await NotificationService.sendToToken(serviceAccount, adminToken.trim(), title, body, undefined, pushData);
            }
          } else {
            const tokensSnap = await get(ref(db, `fcmTokens/${targetId}`));
            if (tokensSnap.exists()) {
              const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
              const title = 'New Friend Request';
              const body = `${currentUser.name} wants to be your friend!`;
              const pushData = {
                action_type: 'friend_request',
                senderId: currentUser.id,
                senderName: currentUser.name,
                targetUserId: targetId,
                targetUserName: targetName
              };
              for (const token of tokens) {
                await NotificationService.sendToToken(serviceAccount, token, title, body, undefined, pushData);
              }
            }
          }
        } catch (e) {
          console.error("FCM push failed:", e);
        }
      }
      setRequestStatus('pending_outgoing');
    } catch (err) {
      console.error(err);
    } finally {
      setSendingRequestId(null);
    }
  };

  const acceptLeaderboardFriendRequest = async (targetId: string) => {
    if (!currentUser) return;
    setSendingRequestId(targetId);
    try {
      await update(ref(db, `users/${currentUser.id}/friends`), { [targetId]: true });
      await update(ref(db, `users/${targetId}/friends`), { [currentUser.id]: true });
      await set(ref(db, `users/${currentUser.id}/pendingRequests/${targetId}`), null);
      await set(ref(db, `users/${targetId}/pendingRequests/${currentUser.id}`), null);

      if (sysSettings?.pushNotificationsEnabled !== false && serviceAccount) {
        try {
          const tokensSnap = await get(ref(db, `fcmTokens/${targetId}`));
          if (tokensSnap.exists()) {
            const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
            const title = 'Friend Request Accepted';
            const body = `${currentUser.name} accepted your friend request!`;
            for (const token of tokens) {
              await NotificationService.sendToToken(serviceAccount, token, title, body);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
      setRequestStatus('friends');
    } catch (err) {
      console.error(err);
    } finally {
      setSendingRequestId(null);
    }
  };

  const handlePlayerClick = (player: User) => {
    if (player.id === currentUser?.id) return;
    if (player.privacyEnabled !== false) {
      // If privacy enabled (ON), don't open the profile or send friend request option!
      return;
    }
    setSelectedPlayer(player);
  };

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      try {
        setLoading(true);
        // Fetch users once
        const usersSnap = await get(ref(db, 'users'));
        const botsSnap = await get(ref(db, 'bots'));
        
        let usersData: any = {};
        if (usersSnap.exists()) {
          usersData = usersSnap.val();
        }
        
        let botsData: any = {};
        if (botsSnap.exists()) {
          botsData = botsSnap.val();
        }

        // Parse users list
        const realPlayersList = Object.entries(usersData)
          .filter(([_, val]) => val !== null)
          .map(([key, val]: [string, any]) => ({
            ...val,
            id: key,
            isBot: false
          }) as User);

        // Parse bots list
        const botsList = Object.entries(botsData)
          .filter(([_, val]) => val !== null)
          .map(([key, val]: [string, any]) => {
            const u = { privacyEnabled: false, ...val, id: key, isBot: true } as User;
            const isAdmin = currentUser?.role === 'admin';
            if (!u.name || u.name.trim() === '' || (u.name.toLowerCase().includes('bot') && !isAdmin)) {
              const firstNames = ["Rohan", "Amit", "Priya", "Rahul", "Sneha", "Vikram", "Anjali", "Aditya", "Neha", "Sanjay", "Karan", "Riya", "Aarav", "Meera", "Kabir", "Deepak", "Tanvi", "Arjun", "Kiran", "Yash"];
              const lastNames = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Mehta", "Patel", "Joshi", "Das", "Roy", "Bose", "Choudhury", "Malhotra", "Kapoor", "Sen", "Reddy", "Nair", "Iyer", "Rao", "Mishra"];
              const charSum = key.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
              const f = firstNames[charSum % firstNames.length];
              const l = lastNames[(charSum + 7) % lastNames.length];
              u.name = `${f} ${l}`;
            }
            return u;
          });

        // PROGRESS BOTS ONCE (update once when player tap on leaderboard)
        if (botsList.length > 0 && currentUser && !currentUser.isBot) {
          const numBotsToUpdate = Math.min(botsList.length, Math.floor(Math.random() * 3) + 1);
          const shuffledBots = [...botsList].sort(() => Math.random() - 0.5);
          const selectedBots = shuffledBots.slice(0, numBotsToUpdate);

          for (const bot of selectedBots) {
            const amount = Math.floor(Math.random() * 70) + 15;
            const currentXp = Number(bot.xp || (bot as any).score || 0);
            const currentDaily = Number(bot.dailyXP !== undefined && bot.dailyXP !== null ? bot.dailyXP : currentXp);
            const currentWeekly = Number(bot.weeklyXP !== undefined && bot.weeklyXP !== null ? bot.weeklyXP : currentXp);

            const nextXp = currentXp + amount;
            const nextDaily = currentDaily + amount;
            const nextWeekly = currentWeekly + amount;

            try {
              await update(ref(db, `bots/${bot.id}`), {
                xp: nextXp,
                score: nextXp,
                dailyXP: nextDaily,
                weeklyXP: nextWeekly,
                lastPointsUpdateTime: Date.now()
              });
              
              bot.xp = nextXp;
              (bot as any).score = nextXp;
              bot.dailyXP = nextDaily;
              bot.weeklyXP = nextWeekly;
            } catch (err) {
              console.error("Failed to progress bot inside Leaderboard mount", err);
            }
          }
        }

        const combined = [...realPlayersList, ...botsList];
        setPlayers(combined);
      } catch (err) {
        console.error("Failed to load static leaderboard snapshot", err);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [currentUser]);

  // Timers
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      
      // Daily Reset (Midnight)
      const nextDaily = new Date(now);
      nextDaily.setHours(24, 0, 0, 0);
      const diffDaily = Math.max(0, nextDaily.getTime() - now.getTime());
      
      const hD = Math.floor(diffDaily / 3600000);
      const mD = Math.floor((diffDaily % 3600000) / 60000);
      const sD = Math.floor((diffDaily % 60000) / 1000);
      setDailyCountdown(`${hD}h ${mD}m ${sD}s`);

      // Weekly Reset (Monday Midnight)
      const nextWeekly = new Date(now);
      const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday
      const daysUntilMonday = (1 + 7 - currentDay) % 7 || 7;
      if (currentDay === 1 && now.getHours() >= 0) {
        // It is already Monday, we want next Monday
        nextWeekly.setDate(now.getDate() + 7);
      } else {
        nextWeekly.setDate(now.getDate() + daysUntilMonday);
      }
      nextWeekly.setHours(0, 0, 0, 0);
      
      const diffWeekly = Math.max(0, nextWeekly.getTime() - now.getTime());
      const dW = Math.floor(diffWeekly / (1000 * 60 * 60 * 24));
      const hW = Math.floor((diffWeekly % (1000 * 60 * 60 * 24)) / 3600000);
      const mW = Math.floor((diffWeekly % 3600000) / 60000);
      setWeeklyCountdown(`${dW}d ${hW}h ${mW}m`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getFilteredPlayers = () => {
    let list = [...players];
    
    if (activeTab === 'friends' && currentUser) {
      const friendIds = Object.keys(currentUser.friends || {});
      list = list.filter(p => p.id === currentUser.id || friendIds.includes(p.id));
    }

    // Sort based on tab
    if (activeTab === 'daily') {
      list.sort((a, b) => {
        const valA = a.dailyXP !== undefined && a.dailyXP !== null ? a.dailyXP : (a.isBot ? a.xp || 0 : 0);
        const valB = b.dailyXP !== undefined && b.dailyXP !== null ? b.dailyXP : (b.isBot ? b.xp || 0 : 0);
        return valB - valA;
      });
    } else if (activeTab === 'friends' || activeTab === 'all') {
      list.sort((a, b) => {
        const valA = a.weeklyXP !== undefined && a.weeklyXP !== null ? a.weeklyXP : (a.isBot ? a.xp || 0 : 0);
        const valB = b.weeklyXP !== undefined && b.weeklyXP !== null ? b.weeklyXP : (b.isBot ? b.xp || 0 : 0);
        return valB - valA;
      });
    }

    return list;
  };

  const filteredPlayers = getFilteredPlayers();

  const getRankBadge = (index: number) => {
    switch(index) {
      case 0: return <Crown className="text-yellow-400" size={24} />;
      case 1: return <Medal className="text-gray-300 dark:text-gray-400" size={24} />;
      case 2: return <Medal className="text-amber-600 dark:text-amber-700" size={24} />;
      default: return <span className="text-black/20 dark:text-white/20 font-black text-sm">#{index + 1}</span>;
    }
  };

  return (
    <div className="p-6">
      {/* Player Profile & Friend Request Modal Overlay */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-sm overflow-hidden bg-white dark:bg-[#111] border border-black/10 dark:border-white/10 rounded-[2.5rem] shadow-2xl relative"
          >
            {/* Header / Background Pattern */}
            <div className="h-24 bg-gradient-to-r from-primary/10 to-primary/5 dark:from-[#32befa]/20 dark:to-transparent" />
            
            {/* Close Button */}
            <button
              onClick={() => setSelectedPlayer(null)}
              className="absolute top-4 right-4 p-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-black/50 dark:text-white/60 rounded-full transition-colors active:scale-95"
            >
              <X size={16} />
            </button>

            {/* Content Details */}
            <div className="p-6 pt-0 flex flex-col items-center text-center relative font-sans">
              {/* Avatar Image */}
              <div className="w-20 h-20 -mt-10 bg-primary/20 rounded-3xl border-4 border-white dark:border-[#111] overflow-hidden shadow-md flex items-center justify-center text-primary text-2xl font-black">
                {selectedPlayer.avatarUrl ? (
                  <img src={selectedPlayer.avatarUrl} alt={selectedPlayer.name} className="w-full h-full object-cover" referrerpolicy="no-referrer" />
                ) : (
                  (selectedPlayer.name || 'P')[0].toUpperCase()
                )}
              </div>

              {/* Identity & Rank */}
              <h3 className="text-xl font-black text-black dark:text-white mt-4 italic font-sans">{selectedPlayer.name}</h3>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-extrabold uppercase tracking-widest mt-0.5 font-mono">@{selectedPlayer.username || 'rahee_player'}</p>

              {/* Status Section */}
              <div className="my-6 w-full grid grid-cols-2 gap-2 bg-black/[0.02] dark:bg-white/[0.02] p-4 rounded-2xl border border-black/5 dark:border-white/5">
                <div className="text-center">
                  <span className="block text-2xl font-black text-primary leading-none">{selectedPlayer.xp ?? 0}</span>
                  <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">Total Points</span>
                </div>
                <div className="text-center border-l border-zinc-200 dark:border-zinc-800">
                  <span className="block text-2xl font-black text-primary leading-none">LVL {selectedPlayer.rank ?? 0}</span>
                  <span className="text-[8px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest text-[8px]">Level</span>
                </div>
              </div>

              {/* Interactivity Section: Friend Request Actions */}
              <div className="w-full pt-1">
                {requestStatus === 'friends' && (
                  <div className="w-full py-4 bg-green-500/10 text-green-600 dark:text-green-400 font-black text-xs uppercase tracking-widest rounded-2xl border border-green-500/10 flex items-center justify-center gap-2">
                    <Check size={14} />
                    Already Friends
                  </div>
                )}
                {requestStatus === 'pending_outgoing' && (
                  <div className="w-full py-4 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-black text-xs uppercase tracking-widest rounded-2xl border border-yellow-500/10 flex items-center justify-center gap-2">
                    <Clock size={14} className="animate-pulse" />
                    Request Pending
                  </div>
                )}
                {requestStatus === 'pending_incoming' && (
                  <button
                    disabled={sendingRequestId !== null}
                    onClick={() => acceptLeaderboardFriendRequest(selectedPlayer.id)}
                    className="w-full py-4 bg-primary text-black font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-opacity-90 active:scale-95 transition-all shadow-lg shadow-primary/15 flex items-center justify-center gap-2"
                  >
                    {sendingRequestId ? 'Accepting...' : 'Accept Friend Request'}
                  </button>
                )}
                {requestStatus === 'send' && (
                  <button
                    disabled={sendingRequestId !== null}
                    onClick={() => sendLeaderboardFriendRequest(selectedPlayer.id, selectedPlayer.name)}
                    className="w-full py-4 bg-[#32befa] text-black font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-opacity-90 active:scale-95 transition-all shadow-lg shadow-[#32befa]/15 flex items-center justify-center gap-2"
                  >
                    <UserPlus size={14} />
                    {sendingRequestId ? 'Sending...' : 'Send Friend Request'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
         <h2 className="text-3xl font-black uppercase tracking-tighter italic text-black dark:text-white">Global Arena</h2>
         <Trophy className="text-primary" size={32} />
      </div>

      <div className="flex items-center gap-2 mb-8">
         <div className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
            <Clock size={12} className="text-primary animate-pulse" />
            <span className="text-[10px] font-black text-primary uppercase tracking-widest whitespace-nowrap">
               {activeTab === 'daily' ? `Resets in: ${dailyCountdown}` : `Resets in: ${weeklyCountdown}`}
            </span>
         </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 bg-black/5 dark:bg-white/5 p-1.5 rounded-[1.5rem] border border-black/5 dark:border-white/5">
         <button 
           onClick={() => setActiveTab('daily')}
           className={cn(
             "flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all",
             activeTab === 'daily' ? "bg-primary text-black shadow-lg shadow-primary/20" : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
           )}
         >
           Daily
         </button>
         <button 
           onClick={() => setActiveTab('friends')}
           className={cn(
             "flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all",
             activeTab === 'friends' ? "bg-primary text-black shadow-lg shadow-primary/20" : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
           )}
         >
           Friends
         </button>
         <button 
           onClick={() => setActiveTab('all')}
           className={cn(
             "flex-1 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all",
             activeTab === 'all' ? "bg-primary text-black shadow-lg shadow-primary/20" : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
           )}
         >
           Global
         </button>
      </div>

      {/* Top 3 Podiums */}
      <div className="flex items-end justify-center gap-2 mb-12 h-64 border-b border-black/5 dark:border-white/5 pb-2">
         {filteredPlayers.length > 1 && (
           <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col items-center">
              <div className="w-12 h-12 bg-black/5 dark:bg-white/10 rounded-full flex items-center justify-center mb-2 overflow-hidden border border-black/5 dark:border-white/5">
                {filteredPlayers[1].avatarUrl ? (
                  <img src={filteredPlayers[1].avatarUrl} alt={filteredPlayers[1].name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-gray-500 dark:text-gray-300">{(filteredPlayers[1].name || '?')[0]}</span>
                )}
              </div>
              <div className="w-20 bg-gradient-to-t from-gray-500/10 dark:from-gray-500/20 to-transparent dark:to-gray-500/10 h-24 rounded-t-2xl border-x border-t border-black/5 dark:border-white/5 flex flex-col items-center justify-end p-2 text-center">
                 <Medal size={20} className="text-gray-400 dark:text-gray-300 mb-2" />
                 <span className="text-[10px] font-black text-black dark:text-white truncate max-w-full italic leading-tight">{filteredPlayers[1].name}</span>
              </div>
           </motion.div>
         )}
         {filteredPlayers.length > 0 && (
           <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-col items-center">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-2 border-2 border-primary overflow-hidden">
                {filteredPlayers[0].avatarUrl ? (
                  <img src={filteredPlayers[0].avatarUrl} alt={filteredPlayers[0].name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-primary text-xl">{(filteredPlayers[0].name || '?')[0]}</span>
                )}
              </div>
              <div className="w-24 bg-gradient-to-t from-primary/20 to-transparent dark:to-primary/10 h-36 rounded-t-2xl border-x border-t border-primary/20 flex flex-col items-center justify-end p-2 relative text-center">
                 <Crown size={32} className="text-yellow-400 absolute -top-10 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                 <Trophy size={24} className="text-primary mb-2" />
                 <span className="text-[11px] font-black text-black dark:text-white truncate max-w-full italic leading-tight">{filteredPlayers[0].name}</span>
              </div>
           </motion.div>
         )}
         {filteredPlayers.length > 2 && (
           <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-col items-center">
              <div className="w-12 h-12 bg-black/5 dark:bg-white/10 rounded-full flex items-center justify-center mb-2 overflow-hidden border border-black/5 dark:border-white/5">
                {filteredPlayers[2].avatarUrl ? (
                  <img src={filteredPlayers[2].avatarUrl} alt={filteredPlayers[2].name} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-bold text-amber-600 dark:text-amber-500">{(filteredPlayers[2].name || '?')[0]}</span>
                )}
              </div>
              <div className="w-20 bg-gradient-to-t from-amber-600/10 dark:from-amber-600/20 to-transparent dark:to-amber-600/10 h-16 rounded-t-2xl border-x border-t border-black/5 dark:border-white/5 flex flex-col items-center justify-end p-2 text-center">
                 <Medal size={20} className="text-amber-700 dark:text-amber-600 mb-2" />
                 <span className="text-[10px] font-black text-black dark:text-white truncate max-w-full italic leading-tight">{filteredPlayers[2].name}</span>
              </div>
           </motion.div>
         )}
      </div>

      {/* List */}
      <div className="space-y-3">
         {loading ? (
           <>
             {[1, 2, 3, 4, 5].map((i) => (
               <div key={`leader-skeleton-${i}`} className="p-4 rounded-2xl flex items-center justify-between bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5">
                 <div className="flex items-center gap-4">
                   <Skeleton className="w-8 h-8 rounded-full" />
                   <div className="space-y-2">
                     <Skeleton className="w-24 h-4" />
                     <Skeleton className="w-16 h-3" />
                   </div>
                 </div>
                 <Skeleton className="w-12 h-6" />
               </div>
             ))}
           </>
         ) : (
            filteredPlayers.map((player, idx) => {
              const canClick = player.id !== currentUser?.id && player.privacyEnabled === false;
              return (
              <motion.div
                key={`leaderboard-row-${player.id || idx}-${idx}`}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => {
                  if (canClick) handlePlayerClick(player);
                }}
                className={cn(
                  "p-4 rounded-2xl flex items-center justify-between border transition-all duration-150",
                  player.id === currentUser?.id ? "ring-2 ring-primary bg-primary/5 border-primary/20 shadow-lg shadow-primary/10" : 
                  "bg-white dark:bg-[#111] border-black/10 dark:border-white/10 shadow-sm dark:shadow-md",
                  canClick && "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.99]"
                )}
              >
                 <div className="flex items-center gap-4 min-w-0">
                    <div className="w-8 flex justify-center shrink-0">
                       {getRankBadge(idx)}
                    </div>
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black overflow-hidden border border-primary/20 shrink-0">
                       {player.avatarUrl ? (
                         <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
                       ) : (
                         (player.name || 'P')[0].toUpperCase()
                       )}
                    </div>
                    <div className="space-y-0.5 text-left min-w-0">
                       <p className="font-bold flex items-center gap-2 text-black dark:text-white truncate">
                         <span className="truncate">{player.name}</span>
                         {player.isBot && currentUser?.role === 'admin' && (
                            <span className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/10 text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest flex items-center gap-1 shrink-0 font-sans">
                              <Bot size={8} /> Bot (Admin)
                            </span>
                          )}
                         {player.id === currentUser?.id && <span className="bg-primary text-black text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest shrink-0 font-sans">You</span>}
                       </p>
                       <p className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase tracking-widest leading-none">Rank #{idx + 1}</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                       <p className="text-lg font-black text-primary leading-none">
                         {activeTab === 'daily' 
                           ? (player.dailyXP !== undefined && player.dailyXP !== null ? player.dailyXP : (player.xp || 0)) 
                           : (player.weeklyXP !== undefined && player.weeklyXP !== null ? player.weeklyXP : (player.xp || 0))}
                       </p>
                       <p className="text-[8px] font-bold text-black/20 dark:text-white/20 uppercase tracking-widest mt-0.5">Points</p>
                    </div>

                    {deletingPlayerId === player.id ? (
                      <div className="flex items-center gap-1 bg-red-500/5 p-1 rounded-xl border border-red-500/10">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const path = player.isBot ? `bots/${player.id}` : `users/${player.id}`;
                              await remove(ref(db, path));
                              setPlayers(prev => prev.filter(p => p.id !== player.id));
                              setDeletingPlayerId(null);
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="px-2 py-1 text-[8px] font-black uppercase tracking-wider bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all font-sans"
                        >
                          Del
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingPlayerId(null);
                          }}
                          className="px-2 py-1 text-[8px] font-black uppercase tracking-wider bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-black dark:text-white rounded-lg transition-all font-sans"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      currentUser?.role === 'admin' && (player.isBot || !player.name || player.name.includes('Bot') || player.name.includes('Player')) && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const currentXP = Number(player.xp || 0);
                              const inputVal = prompt(`Enter new total points/XP for bot "${player.name}":`, String(currentXP));
                              if (inputVal === null) return;
                              const pointsNum = parseInt(inputVal);
                              if (isNaN(pointsNum)) return;

                              try {
                                const path = player.isBot ? `bots/${player.id}` : `users/${player.id}`;
                                await update(ref(db, path), {
                                  xp: pointsNum,
                                  score: pointsNum,
                                  dailyXP: pointsNum,
                                  weeklyXP: pointsNum
                                });

                                setPlayers(prev => prev.map(p => {
                                  if (p.id === player.id) {
                                    return {
                                      ...p,
                                      xp: pointsNum,
                                      dailyXP: pointsNum,
                                      weeklyXP: pointsNum,
                                      score: pointsNum
                                    } as any;
                                  }
                                  return p;
                                }));
                              } catch (err) {
                                console.error("Failed to edit bot points:", err);
                              }
                            }}
                            className="p-1.5 rounded-xl bg-primary/10 hover:bg-primary/25 text-primary border border-primary/15 transition-all active:scale-95 shrink-0"
                            title="Edit Bot Points"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingPlayerId(player.id);
                            }}
                            className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/25 text-red-500 border border-red-500/15 transition-all active:scale-95 shrink-0"
                            title="Delete Bot/Unnamed Player"
                            id={`delete-btn-${player.id}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )
                    )}
                 </div>
              </motion.div>
            );
           })
          )}
      </div>
    </div>
  );
}
