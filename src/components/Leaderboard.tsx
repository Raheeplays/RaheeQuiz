import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue } from 'firebase/database';
import { User } from '../types';
import { Trophy, Medal, Crown, TrendingUp, Bot } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

import { Skeleton } from './ui/Skeleton';

export default function Leaderboard() {
  const [players, setPlayers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const playersRef = ref(db, 'users');
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.values(data) as User[];
        // Sort by XP descending
        list.sort((a, b) => b.xp - a.xp);
        setPlayers(list);
      }
      setLoading(false);
    });
  }, []);

  const getRankBadge = (index: number) => {
    switch(index) {
      case 0: return <Crown className="text-yellow-400" size={24} />;
      case 1: return <Medal className="text-gray-300" size={24} />;
      case 2: return <Medal className="text-amber-600" size={24} />;
      default: return <span className="text-white/20 font-black text-sm">#{index + 1}</span>;
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
         <h2 className="text-3xl font-black uppercase tracking-tighter italic">Global Arena</h2>
         <Trophy className="text-[#32befa]" size={32} />
      </div>

      {/* Top 3 Podiums */}
      <div className="flex items-end justify-center gap-2 mb-12 h-64 border-b border-white/5 pb-2">
         {players.length > 1 && (
           <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col items-center">
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-2 overflow-hidden">
                <span className="font-bold text-gray-300">{players[1].name[0]}</span>
              </div>
              <div className="w-20 bg-gradient-to-t from-gray-500/20 to-gray-500/10 h-24 rounded-t-2xl border-x border-t border-white/5 flex flex-col items-center justify-end p-2">
                 <Medal size={20} className="text-gray-300 mb-2" />
                 <span className="text-[10px] font-black text-white truncate max-w-full italic">{players[1].name}</span>
              </div>
           </motion.div>
         )}
         {players.length > 0 && (
           <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="flex flex-col items-center">
              <div className="w-16 h-16 bg-[#32befa]/20 rounded-full flex items-center justify-center mb-2 border-2 border-[#32befa] overflow-hidden">
                <span className="font-bold text-[#32befa] text-xl">{players[0].name[0]}</span>
              </div>
              <div className="w-24 bg-gradient-to-t from-[#32befa]/20 to-[#32befa]/10 h-36 rounded-t-2xl border-x border-t border-[#32befa]/20 flex flex-col items-center justify-end p-2 relative">
                 <Crown size={32} className="text-yellow-400 absolute -top-10 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                 <Trophy size={24} className="text-[#32befa] mb-2" />
                 <span className="text-[11px] font-black text-white truncate max-w-full italic">{players[0].name}</span>
              </div>
           </motion.div>
         )}
         {players.length > 2 && (
           <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="flex flex-col items-center">
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center mb-2 overflow-hidden">
                <span className="font-bold text-amber-600">{players[2].name[0]}</span>
              </div>
              <div className="w-20 bg-gradient-to-t from-amber-600/20 to-amber-600/10 h-16 rounded-t-2xl border-x border-t border-white/5 flex flex-col items-center justify-end p-2">
                 <Medal size={20} className="text-amber-600 mb-2" />
                 <span className="text-[10px] font-black text-white truncate max-w-full italic">{players[2].name}</span>
              </div>
           </motion.div>
         )}
      </div>

      {/* List */}
      <div className="space-y-3">
         {loading ? (
           <>
             {[1, 2, 3, 4, 5].map((i) => (
               <div key={i} className="p-4 rounded-2xl flex items-center justify-between bg-[#111] border border-white/5">
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
           players.map((player, idx) => (
             <motion.div
               key={player.id}
               initial={{ x: -20, opacity: 0 }}
               animate={{ x: 0, opacity: 1 }}
               transition={{ delay: idx * 0.05 }}
               className={cn(
                 "p-4 rounded-2xl flex items-center justify-between border transition-all",
                 player.isBot ? "bg-black border-white/5" : "bg-[#111] border-white/10 shadow-lg"
               )}
             >
                <div className="flex items-center gap-4">
                   <div className="w-8 flex justify-center">
                      {getRankBadge(idx)}
                   </div>
                   <div className="space-y-0.5">
                      <p className="font-bold flex items-center gap-2">
                        {player.name}
                        {player.isBot && <Bot size={12} className="text-white/20" />}
                      </p>
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Rank #{idx + 1}</p>
                   </div>
                </div>
                <div className="text-right">
                   <p className="text-lg font-black text-[#32befa] leading-none">{player.xp}</p>
                   <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Points</p>
                </div>
             </motion.div>
           ))
         )}
      </div>
    </div>
  );
}
