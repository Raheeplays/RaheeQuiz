import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue } from 'firebase/database';
import { User } from '../types';
import { Trophy, Medal, Crown, TrendingUp, Bot, Clock, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { useUser } from '../contexts/UserContext';
import { Skeleton } from './ui/Skeleton';
import ScoreCard from './ScoreCard';
import { ref as dbRef, update } from 'firebase/database';

export default function Leaderboard() {
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'daily' | 'friends' | 'all'>('all');
  const { currentUser } = useUser();
  const [selectedPlayer, setSelectedPlayer] = useState<User | null>(null);

  const [dailyCountdown, setDailyCountdown] = useState('');
  const [weeklyCountdown, setWeeklyCountdown] = useState('');

  const sendFriendRequest = async (targetUserId: string) => {
    if (!currentUser) return;
    await update(dbRef(db, `users/${currentUser.id}/pendingRequests`), {
      [targetUserId]: 'outgoing'
    });
    await update(dbRef(db, `users/${targetUserId}/pendingRequests`), {
      [currentUser.id]: 'incoming'
    });
  };

  useEffect(() => {
    const playersRef = ref(db, 'public_profiles');
    const unsubscribe = onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const unique = new Map();
        Object.entries(data).forEach(([key, val]: [string, any]) => {
          const uid = val.id || key;
          unique.set(uid, { ...val, id: uid });
        });
        setPlayers(Array.from(unique.values()));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

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
      list.sort((a, b) => (b.dailyXP || 0) - (a.dailyXP || 0));
    } else if (activeTab === 'friends' || activeTab === 'all') {
      list.sort((a, b) => (b.weeklyXP || 0) - (a.weeklyXP || 0));
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
                 <Medal size={20} className="text-gray-400 dark:text-gray-300 mb-1" />
                 <span className="text-[10px] font-black text-black dark:text-white truncate max-w-full italic leading-tight">{filteredPlayers[1].name}</span>
                 <span className="text-[8px] font-bold text-primary truncate max-w-full italic leading-tight">@{filteredPlayers[1].username || filteredPlayers[1].id}</span>
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
                 <Trophy size={24} className="text-primary mb-1" />
                 <span className="text-[11px] font-black text-black dark:text-white truncate max-w-full italic leading-tight">{filteredPlayers[0].name}</span>
                 <span className="text-[9px] font-bold text-primary truncate max-w-full mb-1 italic leading-tight">@{filteredPlayers[0].username || filteredPlayers[0].id}</span>
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
                 <Medal size={20} className="text-amber-700 dark:text-amber-600 mb-1" />
                 <span className="text-[10px] font-black text-black dark:text-white truncate max-w-full italic leading-tight">{filteredPlayers[2].name}</span>
                 <span className="text-[8px] font-bold text-primary truncate max-w-full italic leading-tight">@{filteredPlayers[2].username || filteredPlayers[2].id}</span>
              </div>
           </motion.div>
         )}
      </div>

      {/* List */}
      <div className="space-y-3">
         {loading ? (
           <>
             {[1, 2, 3, 4, 5].map((i) => (
               <div key={i} className="p-4 rounded-2xl flex items-center justify-between bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5">
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
           filteredPlayers.map((player, idx) => (
             <motion.div
               key={`${player.id}-${idx}`}
               initial={{ x: -20, opacity: 0 }}
               animate={{ x: 0, opacity: 1 }}
               transition={{ delay: idx * 0.05 }}
               className={cn(
                 "p-4 rounded-2xl flex items-center justify-between border transition-all",
                 player.id === currentUser?.id ? "ring-2 ring-primary bg-primary/5 border-primary/20 shadow-lg shadow-primary/10" : 
                 player.isBot ? "bg-black/5 dark:bg-black border-black/5 dark:border-white/5" : "bg-white dark:bg-[#111] border-black/10 dark:border-white/10 shadow-sm dark:shadow-md"
               )}
             >
                <div className="flex items-center gap-4">
                   <div className="w-8 flex justify-center">
                      {getRankBadge(idx)}
                   </div>
                   <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black overflow-hidden border border-primary/20">
                      {player.avatarUrl ? (
                        <img src={player.avatarUrl} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        (player.name || 'P')[0].toUpperCase()
                      )}
                   </div>
                 <div className="space-y-0.5 text-left flex-1 min-w-0">
                    <p className="font-bold flex items-center gap-2 text-black dark:text-white truncate">
                      {player.name}
                      {player.id === currentUser?.id && <span className="bg-primary text-black text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest shrink-0">You</span>}
                      {player.isBot && currentUser?.role === 'admin' && <Bot size={12} className="text-black/20 dark:text-white/20 shrink-0" />}
                    </p>
                    <p className="text-[9px] text-primary font-bold lowercase tracking-tight truncate">@{player.username || player.id}</p>
                    <p className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase tracking-widest leading-none mt-1">Rank #{idx + 1}</p>
                 </div>
                </div>
                <div className="text-right shrink-0">
                   <p className="text-lg font-black text-primary leading-none">
                     {activeTab === 'daily' ? (player.dailyXP || 0) : (player.weeklyXP || 0)}
                   </p>
                   <p className="text-[8px] font-bold text-black/20 dark:text-white/20 uppercase tracking-widest">Points</p>
                </div>
             </motion.div>
           ))
         )}
      </div>

      <AnimatePresence>
        {selectedPlayer && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
             <div className="w-full max-w-md">
                <ScoreCard 
                   user={selectedPlayer}
                   currentUser={currentUser}
                   onSendFriendRequest={sendFriendRequest}
                   onClose={() => setSelectedPlayer(null)}
                />
             </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
