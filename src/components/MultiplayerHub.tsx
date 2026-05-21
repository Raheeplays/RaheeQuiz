import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase/config';
import { ref, onValue, set, push, update, get, remove } from 'firebase/database';
import { User, MatchRoom, MatchProgress } from '../types';
import { useUser } from '../contexts/UserContext';
import { Swords, Users, X, Zap, Trophy, Play, Search, Gamepad2, Plus, LogIn, Copy, Clock, Settings, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';

interface MultiplayerHubProps {
  onClose: () => void;
  allUsers: User[];
  onStartMatch: (roomId: string, isBot: boolean) => void;
}

export default function MultiplayerHub({ onClose, allUsers, onStartMatch }: MultiplayerHubProps) {
  const { currentUser } = useUser();
  const [activeMode, setActiveMode] = useState<'friend' | 'online' | null>(null);
  const [lobbyRoom, setLobbyRoom] = useState<MatchRoom | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState('');

  // Lobby Timer Settings
  const [useTimer, setUseTimer] = useState(false);
  const [whoFirst, setWhoFirst] = useState(false);
  const [timeLimit, setTimeLimit] = useState(16);

  useEffect(() => {
    if (lobbyRoom) {
      const roomRef = ref(db, `matches/${lobbyRoom.id}`);
      const unsubscribe = onValue(roomRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setLobbyRoom(data);
          
          // If host started the game, transition client
          if (data.status === 'playing') {
            onStartMatch(data.id, false);
          }
        } else {
          setLobbyRoom(null);
        }
      });
      return () => unsubscribe();
    }
  }, [lobbyRoom?.id]);

  const generateRoomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const createFriendRoom = async () => {
    if (!currentUser) return;
    const roomRef = push(ref(db, 'matches'));
    const roomId = roomRef.key!;
    const code = generateRoomCode();

    const room: MatchRoom = {
      id: roomId,
      topicId: currentUser.selectedTopicId || 'general',
      joinCode: code,
      hostId: currentUser.id,
      participants: {
        [currentUser.id]: { userId: currentUser.id, userName: currentUser.name, score: 0, currentIndex: 0, finished: false, accuracy: 0 }
      },
      status: 'waiting',
      timerEnabled: useTimer,
      whoFirstMode: whoFirst,
      totalTime: timeLimit,
      createdAt: Date.now()
    };

    await set(roomRef, room);
    setLobbyRoom(room);
    setActiveMode('friend');
  };

  const joinFriendRoom = async () => {
    if (!currentUser || !joinCode) return;
    setError('');
    
    const matchesRef = ref(db, 'matches');
    const snapshot = await get(matchesRef);
    if (snapshot.exists()) {
      const matches = snapshot.val();
      const roomToJoin = Object.values(matches).find((m: any) => m.joinCode === joinCode && m.status === 'waiting') as MatchRoom | undefined;
      
      if (roomToJoin) {
        if (Object.keys(roomToJoin.participants).length >= 2) {
          setError('Room is full');
          return;
        }

        const updates = {
          [`participants/${currentUser.id}`]: {
            userId: currentUser.id,
            userName: currentUser.name,
            score: 0,
            currentIndex: 0,
            finished: false,
            accuracy: 0
          }
        };
        await update(ref(db, `matches/${roomToJoin.id}`), updates);
        setLobbyRoom({ ...roomToJoin, participants: { ...roomToJoin.participants, [currentUser.id]: updates[`participants/${currentUser.id}`] } as any });
      } else {
        setError('Invalid or expired room code');
      }
    }
  };

  const startMatchAsHost = async () => {
    if (!lobbyRoom || !currentUser) return;
    await update(ref(db, `matches/${lobbyRoom.id}`), {
      status: 'playing',
      startTime: Date.now()
    });
    onStartMatch(lobbyRoom.id, false);
  };

  const startOnlineMatch = async () => {
    if (!currentUser) return;
    setMatching(true);
    
    // Simulate real player or bot matching
    setTimeout(async () => {
      const roomRef = push(ref(db, 'matches'));
      const roomId = roomRef.key!;
      
      const botId = 'bot_' + Math.random().toString(36).substr(2, 5);
      
      const room: MatchRoom = {
        id: roomId,
        topicId: currentUser.selectedTopicId || 'general',
        hostId: currentUser.id,
        participants: {
          [currentUser.id]: { userId: currentUser.id, userName: currentUser.name, score: 0, currentIndex: 0, finished: false, accuracy: 0 },
          [botId]: { userId: botId, userName: allUsers?.filter(u => u.isBot).sort(() => Math.random() - 0.5)[0]?.name || 'Rahee Player', score: 0, currentIndex: 0, finished: false, accuracy: 0 }
        },
        status: 'playing',
        timerEnabled: false,
        whoFirstMode: false,
        totalTime: 10,
        startTime: Date.now(),
        createdAt: Date.now()
      };

      await set(roomRef, room);
      onStartMatch(roomId, true);
    }, 2000);
  };

  if (!currentUser) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-lg bg-[#050505] rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 md:p-8 flex items-center justify-between border-b border-white/5">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
               <Swords size={24} />
             </div>
             <div>
               <h2 className="text-xl font-black tracking-tighter">BATTLE HUB</h2>
               <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Multiplayer Competition</p>
             </div>
           </div>
           {!matching && (
             <button 
               onClick={onClose}
               className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all text-white/40"
             >
               <X size={20} />
             </button>
           )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {matching ? (
            <div className="py-12 flex flex-col items-center text-center">
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full mb-6"
              />
              <h3 className="text-xl font-black mb-2">Finding Opponent...</h3>
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Searching for available players</p>
            </div>
          ) : lobbyRoom ? (
            <div className="space-y-8">
               <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Room Code</span>
                  <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-6 py-4 rounded-3xl">
                     <span className="text-3xl font-black tracking-[0.2em]">{lobbyRoom.joinCode}</span>
                     <button onClick={() => navigator.clipboard.writeText(lobbyRoom.joinCode || '')} className="p-2 hover:text-primary transition-colors">
                        <Copy size={20} />
                     </button>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  {/* Player 1 */}
                  <div className="bg-white/5 border border-white/5 p-6 rounded-[2rem] flex flex-col items-center gap-3">
                     <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                        <UserIcon size={32} />
                     </div>
                     <p className="font-black text-sm uppercase truncate w-full text-center">{currentUser.name}</p>
                     <span className="text-[8px] font-black text-primary uppercase tracking-widest px-2 py-1 bg-primary/10 rounded-lg border border-primary/20">Host</span>
                  </div>

                  {/* Player 2 */}
                  <div className={cn(
                    "p-6 rounded-[2rem] flex flex-col items-center gap-3 transition-all duration-500",
                    Object.keys(lobbyRoom.participants).length > 1 
                      ? "bg-white/5 border border-white/5" 
                      : "bg-white/[0.02] border border-dashed border-white/10 opacity-60"
                  )}>
                     {Object.keys(lobbyRoom.participants).length > 1 ? (
                       <>
                         <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-white/40 border border-white/10">
                            <UserIcon size={32} />
                         </div>
                         <p className="font-black text-sm uppercase truncate w-full text-center">
                           {allUsers?.find(u => u.id === Object.keys(lobbyRoom.participants).find(id => id !== currentUser.id))?.name || 'Player 2'}
                         </p>
                         <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Joined</span>
                       </>
                     ) : (
                       <>
                         <div className="w-16 h-16 rounded-2xl border border-dashed border-white/20 flex items-center justify-center text-white/10">
                            <Plus size={32} />
                         </div>
                         <p className="font-black text-xs text-white/20 uppercase tracking-tighter">Waiting...</p>
                       </>
                     )}
                  </div>
               </div>

               <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-4">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <Clock size={16} className={cn(lobbyRoom.timerEnabled ? "text-primary" : "text-white/20")} />
                     <span className="text-[10px] font-black uppercase tracking-widest">Match Timer</span>
                   </div>
                   <span className={cn("text-xs font-black", lobbyRoom.timerEnabled ? "text-primary" : "text-white/20")}>
                     {lobbyRoom.timerEnabled ? `${lobbyRoom.totalTime} Minutes` : 'Disabled'}
                   </span>
                 </div>
                 {lobbyRoom.timerEnabled && (
                   <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all" 
                        style={{ width: `${(lobbyRoom.totalTime / 160) * 100}%` }} 
                      />
                   </div>
                 )}

                 <div className="flex items-center justify-between pt-2 border-t border-white/5">
                    <div className="flex items-center gap-2">
                       <Zap size={16} className={cn(lobbyRoom.whoFirstMode ? "text-[#facc15]" : "text-white/20")} />
                       <span className="text-[10px] font-black uppercase tracking-widest">Who First Mode</span>
                    </div>
                    <span className={cn("text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md", lobbyRoom.whoFirstMode ? "bg-[#facc15]/20 text-[#facc15]" : "bg-white/5 text-white/20")}>
                       {lobbyRoom.whoFirstMode ? 'Enabled' : 'Disabled'}
                    </span>
                 </div>
               </div>

               <div className="pt-4">
                 {lobbyRoom.hostId === currentUser.id ? (
                    <button 
                      disabled={Object.keys(lobbyRoom.participants).length < 2}
                      onClick={startMatchAsHost}
                      className="w-full bg-primary text-black font-black py-5 rounded-[1.5rem] uppercase tracking-widest text-xs shadow-[0_10px_30px_rgba(var(--primary-color),0.2)] disabled:opacity-50 disabled:grayscale transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
                    >
                       <Play size={20} fill="black" />
                       Start Game
                    </button>
                 ) : (
                    <div className="w-full bg-white/5 py-5 rounded-[1.5rem] flex items-center justify-center gap-3 text-white/40 border border-white/5 animate-pulse">
                       <Clock size={20} />
                       <span className="font-black uppercase tracking-widest text-xs">Waiting for host to start...</span>
                    </div>
                 )}
                 <button 
                  onClick={async () => {
                    if (lobbyRoom.hostId === currentUser.id) {
                      await remove(ref(db, `matches/${lobbyRoom.id}`));
                    } else {
                      await set(ref(db, `matches/${lobbyRoom.id}/participants/${currentUser.id}`), null);
                    }
                    setLobbyRoom(null);
                  }}
                  className="w-full mt-4 py-2 text-[10px] font-bold text-white/20 uppercase tracking-widest hover:text-red-500 transition-colors"
                 >
                   Leave Lobby
                 </button>
               </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Play with Friend Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-2">
                  <Users size={16} className="text-primary" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">Play with Friend</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setActiveMode('friend')}
                    className="flex flex-col items-center gap-4 bg-white/5 border border-white/5 p-6 rounded-[2.5rem] hover:border-primary/30 transition-all group"
                  >
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-all">
                      <Plus size={28} />
                    </div>
                    <span className="font-black text-xs uppercase tracking-tighter">Create Room</span>
                  </button>
                  <button 
                    onClick={() => setActiveMode('friend')}
                    className="flex flex-col items-center gap-4 bg-white/5 border border-white/5 p-6 rounded-[2.5rem] hover:border-primary/30 transition-all group"
                  >
                    <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white/40 group-hover:scale-110 transition-all">
                      <LogIn size={28} />
                    </div>
                    <span className="font-black text-xs uppercase tracking-tighter">Join Room</span>
                  </button>
                </div>

                <AnimatePresence>
                  {activeMode === 'friend' && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden space-y-4"
                    >
                      {/* Timer & Rules Settings */}
                      <div className="bg-white/5 rounded-[2rem] p-6 border border-white/5 space-y-6">
                        <div className="space-y-4">
                          <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all">
                             <div className="flex items-center gap-3">
                                <Clock size={18} className={cn(useTimer ? "text-primary" : "text-white/20")} />
                                <span className="text-xs font-black uppercase tracking-widest">Shared Timer</span>
                             </div>
                             <input 
                                type="checkbox" 
                                checked={useTimer} 
                                onChange={(e) => setUseTimer(e.target.checked)}
                                className="w-5 h-5 accent-primary bg-black border-white/10 rounded"
                             />
                          </label>

                          <label className="flex items-center justify-between p-4 bg-white/5 rounded-2xl cursor-pointer hover:bg-white/10 transition-all">
                             <div className="flex items-center gap-3">
                                <Zap size={18} className={cn(whoFirst ? "text-[#facc15]" : "text-white/20")} />
                                <div>
                                   <span className="text-xs font-black uppercase tracking-widest block">Who First Solve</span>
                                   <p className="text-[8px] text-white/40 uppercase font-bold">First clicker claims the point</p>
                                </div>
                             </div>
                             <input 
                                type="checkbox" 
                                checked={whoFirst} 
                                onChange={(e) => setWhoFirst(e.target.checked)}
                                className="w-5 h-5 accent-[#facc15] bg-black border-white/10 rounded"
                             />
                          </label>
                        </div>

                        {useTimer && (
                          <div className="space-y-4">
                            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-primary">
                              <span>Duration</span>
                              <span>{timeLimit} Mins</span>
                            </div>
                            <input 
                              type="range" 
                              min="16" 
                              max="160" 
                              value={timeLimit} 
                              onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                              className="w-full h-1 bg-white/10 rounded-full appearance-none accent-primary cursor-pointer"
                            />
                            <div className="flex justify-between text-[8px] font-bold text-white/20">
                              <span>16 MIN</span>
                              <span>160 MIN</span>
                            </div>
                          </div>
                        )}

                        <button 
                          onClick={createFriendRoom}
                          className="w-full bg-primary text-black font-black py-4 rounded-2xl hover:scale-105 transition-all text-[11px] uppercase tracking-widest shadow-[0_10px_30px_rgba(var(--primary-color),0.2)]"
                        >
                          Generate New Code
                        </button>
                      </div>

                      <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 font-black">#</div>
                        <input 
                          type="text" 
                          maxLength={6}
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit Code"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 pl-10 text-xl font-black tracking-[0.3em] outline-none focus:border-primary transition-all text-center"
                        />
                        {error && <p className="text-red-500 text-[10px] font-bold mt-2 px-2">{error}</p>}
                        <button 
                          disabled={joinCode.length < 6}
                          onClick={joinFriendRoom}
                          className="w-full mt-3 bg-white text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-20 transition-all uppercase tracking-widest text-[11px]"
                        >
                          JOIN LOBBY
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Online Match Section */}
              <div className="space-y-4 pt-6">
                <div className="flex items-center gap-2 px-2">
                  <Zap size={16} className="text-[#32befa]" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white/40">Online Match</h3>
                </div>
                
                <button 
                  onClick={startOnlineMatch}
                  className="w-full group relative overflow-hidden bg-gradient-to-br from-[#111] to-[#050505] border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between hover:border-[#32befa]/30 transition-all"
                >
                  <div className="relative z-10 text-left">
                    <h4 className="text-2xl font-black mb-1">Quick Battle</h4>
                    <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Match with global opponents</p>
                  </div>
                  <div className="relative z-10 w-16 h-16 bg-[#32befa]/10 rounded-2xl flex items-center justify-center text-[#32befa] group-hover:scale-110 group-hover:rotate-12 transition-all">
                    <Swords size={32} />
                  </div>
                  {/* Decorative background elements */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#32befa]/5 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
