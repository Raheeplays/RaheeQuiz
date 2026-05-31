import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue, remove, update } from 'firebase/database';
import { User } from '../types';
import { Trophy, Medal, Crown, TrendingUp, Bot, Clock, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

import { useUser } from '../contexts/UserContext';

import { Skeleton } from './ui/Skeleton';

export default function Leaderboard() {
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'daily' | 'friends' | 'all'>('all');
  const { currentUser } = useUser();
  const [deletingPlayerId, setDeletingPlayerId] = useState<string | null>(null);

  const [dailyCountdown, setDailyCountdown] = useState('');
  const [weeklyCountdown, setWeeklyCountdown] = useState('');

  useEffect(() => {
    const playersRef = ref(db, 'users');
    const unsubscribe = onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data)
          .filter(([_, val]) => val !== null)
          .map(([key, val]: [string, any]) => {
            const u = { ...val, id: key } as User;
            const isAdmin = currentUser?.role === 'admin';
            if (!u.name || u.name.trim() === '' || (u.isBot && u.name.toLowerCase().includes('bot') && !isAdmin)) {
              if (u.isBot) {
                const firstNames = ["Rohan", "Amit", "Priya", "Rahul", "Sneha", "Vikram", "Anjali", "Aditya", "Neha", "Sanjay", "Karan", "Riya", "Aarav", "Meera", "Kabir", "Deepak", "Tanvi", "Arjun", "Kiran", "Yash"];
                const lastNames = ["Sharma", "Verma", "Gupta", "Singh", "Kumar", "Mehta", "Patel", "Joshi", "Das", "Roy", "Bose", "Choudhury", "Malhotra", "Kapoor", "Sen", "Reddy", "Nair", "Iyer", "Rao", "Mishra"];
                const charSum = key.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const f = firstNames[charSum % firstNames.length];
                const l = lastNames[(charSum + 7) % lastNames.length];
                u.name = `${f} ${l}`;
              } else {
                u.name = "Unnamed Player";
              }
            }
            return u;
          });
        setPlayers(list);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Dynamically update bot points when a real player checks the leaderboard
  useEffect(() => {
    if (loading || players.length === 0 || !currentUser || currentUser.isBot) {
      return;
    }

    const checkAndProgressBots = async () => {
      const bots = players.filter(p => p.isBot);
      if (bots.length === 0) return;

      const now = Date.now();
      // Set update interval to 3 minutes (180,000 ms)
      const UPDATE_INTERVAL = 180000;

      for (const bot of bots) {
        const lastUpdated = (bot as any).lastPointsUpdateTime || 0;
        
        // If never updated, initialize with a randomized past offset so they stagger naturally
        if (!lastUpdated) {
          const randomPast = now - Math.floor(Math.random() * UPDATE_INTERVAL);
          try {
            await update(ref(db, `users/${bot.id}`), {
              lastPointsUpdateTime: randomPast
            });
          } catch (e) {
            console.error("Failed to initialize bot points timer", e);
          }
          continue;
        }

        if (now - lastUpdated > UPDATE_INTERVAL) {
          // Increase points by a random amount between 15 and 85 points (strictly less than 100 counts)
          const amount = Math.floor(Math.random() * 70) + 15;
          const currentXp = bot.xp || 0;
          const currentDaily = bot.dailyXP !== undefined && bot.dailyXP !== null ? bot.dailyXP : currentXp;
          const currentWeekly = bot.weeklyXP !== undefined && bot.weeklyXP !== null ? bot.weeklyXP : currentXp;

          const nextXp = currentXp + amount;
          const nextDaily = currentDaily + amount;
          const nextWeekly = currentWeekly + amount;

          try {
            await update(ref(db, `users/${bot.id}`), {
              xp: nextXp,
              dailyXP: nextDaily,
              weeklyXP: nextWeekly,
              lastPointsUpdateTime: now
            });
            console.log(`Successfully elevated bot ${bot.name} XP by +${amount}`);
          } catch (err) {
            console.error("Failed to dynamically progress bot points", err);
          }
        }
      }
    };

    // Run dynamic sweep check immediately and recurringly every 30 seconds
    const intervalId = setInterval(checkAndProgressBots, 30000);
    checkAndProgressBots();

    return () => clearInterval(intervalId);
  }, [players, loading, currentUser]);

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
            filteredPlayers.map((player, idx) => (
              <motion.div
                key={`leaderboard-row-${player.id || idx}-${idx}`}
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "p-4 rounded-2xl flex items-center justify-between border transition-all",
                  player.id === currentUser?.id ? "ring-2 ring-primary bg-primary/5 border-primary/20 shadow-lg shadow-primary/10" : 
                  "bg-white dark:bg-[#111] border-black/10 dark:border-white/10 shadow-sm dark:shadow-md"
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
                              await remove(ref(db, `users/${player.id}`));
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
                      )
                    )}
                 </div>
              </motion.div>
            ))
          )}
      </div>
    </div>
  );
}
