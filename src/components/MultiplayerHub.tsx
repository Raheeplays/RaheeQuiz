import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase/config';
import { ref, onValue, set, push, update, get, remove } from 'firebase/database';
import { User, MatchRoom, MatchProgress } from '../types';
import { useUser } from '../contexts/UserContext';
import { Swords, Users, X, Zap, Trophy, Play, Search, Gamepad2, Plus, LogIn, Copy, Clock, Settings, User as UserIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { NotificationService } from '../services/notificationService';

const REALISTIC_BOT_NAMES = [
  "Aarav Sharma", "Priya Patel", "Rohan Verma", "Sneha Rao", "Neha Gupta",
  "Amit Singh", "Anjali Nair", "Aditya Sen", "Riya Das", "Siddharth Iyer",
  "Pooja Joshi", "Tanvi Reddy", "Vikram Rathore", "Kriti Saxena", "Rajesh Kumar",
  "Karan Malhotra", "Isha Dixit", "Abhishek Tiwari", "Meera Nair", "Rishabh Roy",
  "Zoya Khan", "Arjun Bhatia", "Kavya Murthy", "Rahul Deshmukh", "Nikhil Sethi",
  "Ananya Roy", "Deepak Solanki", "Varun Aggarwal", "Shalini Pandey", "Mayank Soni",
  "Pranav Joshi", "Shreya Ghoshal", "Gaurav Joshi", "Divya Shrivastav"
];

interface MultiplayerHubProps {
  onClose: () => void;
  allUsers: User[];
  onStartMatch: (roomId: string, isBot: boolean) => void;
}

export default function MultiplayerHub({ onClose, allUsers, onStartMatch }: MultiplayerHubProps) {
  const { currentUser, settings } = useUser();
  const [activeMode, setActiveMode] = useState<'friend' | 'online' | null>(null);
  const [lobbyRoom, setLobbyRoom] = useState<MatchRoom | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState('');
  const [matchmakingCountdown, setMatchmakingCountdown] = useState(5);
  const [matchmakingStatus, setMatchmakingStatus] = useState('Initializing search...');

  // Lobby Timer Settings
  const [useTimer, setUseTimer] = useState(false);
  const [whoFirst, setWhoFirst] = useState(false);
  const [timeLimit, setTimeLimit] = useState(16);
  const [isTeamMode, setIsTeamMode] = useState(false);
  const [teamSize, setTeamSize] = useState<2 | 3 | 4>(2);
  const [matchmakingRoomId, setMatchmakingRoomId] = useState<string | null>(null);
  const [quickBattleMode, setQuickBattleMode] = useState<'solo' | '2v2' | '3v3' | '4v4'>('solo');

  const cancelMatchmaking = async () => {
    if (matchmakingRoomId) {
      await remove(ref(db, `matches/${matchmakingRoomId}`));
      setMatchmakingRoomId(null);
    }
    setMatching(false);
  };

  const getRecentOpponents = (): string[] => {
    try {
      const data = localStorage.getItem('__recent_matched_opponents_v3');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  };

  const addRecentOpponent = (idOrName: string) => {
    try {
      const current = getRecentOpponents();
      const updated = [idOrName, ...current.filter(item => item !== idOrName)].slice(0, 15);
      localStorage.setItem('__recent_matched_opponents_v3', JSON.stringify(updated));
    } catch (e) {}
  };

  const fillRemainingWithBotsAndStart = async (roomId: string) => {
    try {
      const roomSnap = await get(ref(db, `matches/${roomId}`));
      if (!roomSnap.exists()) return;
      const roomData = roomSnap.val();
      if (roomData.status !== 'waiting') return;

      const maxPlayers = roomData.isTeamBattle ? (roomData.teamSize * 2) : 2;
      const currentParticipants = Object.values(roomData.participants || {}) as any[];
      const needed = maxPlayers - currentParticipants.length;

      const updates: any = {};
      if (needed > 0) {
        const recents = getRecentOpponents();

        // Get already joined participant IDs
        const currentParticipantIds = currentParticipants.map(p => p.userId);

        // Separate potential real online players and bots (excluding current participants)
        const onlineRealPlayers = allUsers.filter(u => u && u.id && u.id !== currentUser?.id && !u.isBot && u.isOnline && !currentParticipantIds.includes(u.id));
        const botsList = allUsers.filter(u => u && u.id && u.isBot && !currentParticipantIds.includes(u.id) && !currentParticipantIds.includes('bot_' + u.id));

        // Filter out recently matched opponents
        let availableReal = onlineRealPlayers.filter(u => u.name && !recents.includes(u.id) && !recents.includes(u.name));
        if (availableReal.length === 0 && onlineRealPlayers.length > 0) {
          availableReal = onlineRealPlayers; // fallback
        }

        let availableBots = botsList.filter(u => u.name && !recents.includes(u.id) && !recents.includes(u.name));
        if (availableBots.length === 0 && botsList.length > 0) {
          availableBots = botsList; // fallback
        }

        // Shuffle fallback real names
        const configuredNames = settings?.customBotNames
          ? settings.customBotNames.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
          : REALISTIC_BOT_NAMES;
        let availableFallbackNames = configuredNames.filter((name: string) => !recents.includes(name));
        if (availableFallbackNames.length === 0) {
          availableFallbackNames = configuredNames;
        }
        const shuffledFallbacks = [...availableFallbackNames].sort(() => Math.random() - 0.5);

        for (let i = 0; i < needed; i++) {
          let opponent: any = null;
          let opponentId = '';

          // Match with a real online player if available, otherwise fallback to bots
          if (availableReal.length > 0) {
            const index = Math.floor(Math.random() * availableReal.length);
            opponent = availableReal.splice(index, 1)[0];
            opponentId = opponent.id;
            addRecentOpponent(opponentId);
            if (opponent.name) addRecentOpponent(opponent.name);
          } else if (availableBots.length > 0) {
            const index = Math.floor(Math.random() * availableBots.length);
            opponent = availableBots.splice(index, 1)[0];
            opponentId = 'bot_' + opponent.id;
            addRecentOpponent(opponent.id);
            if (opponent.name) addRecentOpponent(opponent.name);
          } else {
            const name = shuffledFallbacks[i % shuffledFallbacks.length];
            opponent = { name };
            opponentId = 'bot_' + Math.random().toString(36).substr(2, 5);
            addRecentOpponent(name);
          }

          let botTeam: 'blue' | 'red' | undefined = undefined;
          if (roomData.isTeamBattle) {
            const currentAssigned = [...currentParticipants, ...Object.values(updates) as any];
            const blueCount = currentAssigned.filter((p: any) => p.team === 'blue').length;
            const redCount = currentAssigned.filter((p: any) => p.team === 'red').length;
            botTeam = blueCount <= redCount ? 'blue' : 'red';
          }

          const botProgress: any = {
            userId: opponentId,
            userName: opponent.name,
            score: 0,
            currentIndex: 0,
            finished: false,
            accuracy: 0,
            isBot: true
          };
          if (opponent.avatar) {
            botProgress.avatar = opponent.avatar;
          }
          if (opponent.avatarUrl) {
            botProgress.avatarUrl = opponent.avatarUrl;
          }
          if (botTeam) {
            botProgress.team = botTeam;
          }
          updates[`participants/${opponentId}`] = botProgress;
        }
      }

      updates['status'] = 'playing';
      updates['startTime'] = Date.now();

      await update(ref(db, `matches/${roomId}`), updates);
      setMatching(false);
      setMatchmakingRoomId(null);
      onStartMatch(roomId, true);
    } catch (e) {
      console.error("Auto bot fill matchmaking error: ", e);
    }
  };

  useEffect(() => {
    if (matchmakingRoomId) {
      const roomRef = ref(db, `matches/${matchmakingRoomId}`);
      const unsubscribe = onValue(roomRef, async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          if (data.status === 'playing') {
            setMatching(false);
            setMatchmakingRoomId(null);
            const hasBot = Object.values(data.participants || {}).some((p: any) => p.isBot || p.userId.startsWith('bot_'));
            onStartMatch(matchmakingRoomId, hasBot);
            return;
          }
          const participants = Object.values(data.participants || {}) as MatchProgress[];
          const maxPlayers = data.isTeamBattle ? (data.teamSize * 2) : 2;
          if (participants.length >= maxPlayers) {
            await update(roomRef, {
              status: 'playing',
              startTime: Date.now()
            });
            setMatching(false);
            setMatchmakingRoomId(null);
            onStartMatch(matchmakingRoomId, false);
          }
        }
      });
      return () => unsubscribe();
    }
  }, [matchmakingRoomId]);

  // Matchmaking status cycle effect (no countdown, no bots)
  useEffect(() => {
    let interval: any = null;
    if (matching && matchmakingRoomId) {
      const onlineCount = allUsers.filter(u => u.id !== currentUser?.id && !u.isBot && u.isOnline).length;
      const searchStatuses = [
        onlineCount > 0 
          ? `Scanning public lobbies... Found ${onlineCount} online competitors!` 
          : 'Pinging global servers looking for active real players...',
        'Filtering rooms, establishing connection protocols...',
        'Waiting for a real competitor to join standard arena...',
        'Synchronizing matchmaking channels, awaiting response...',
        'No active lobbies matching this topic. Listening for incoming challenger connections...'
      ];
      
      let index = 0;
      setMatchmakingStatus(searchStatuses[0]);

      interval = setInterval(() => {
        index = (index + 1) % searchStatuses.length;
        setMatchmakingStatus(searchStatuses[index]);
      }, 3500);
    } else {
      setMatchmakingStatus('Initializing search...');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [matching, matchmakingRoomId, allUsers, currentUser?.id]);

  // Silent automatic bot matchmaking trigger after exactly 5 seconds
  useEffect(() => {
    if (matching && matchmakingRoomId) {
      const timer = setTimeout(() => {
        fillRemainingWithBotsAndStart(matchmakingRoomId);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [matching, matchmakingRoomId]);

  useEffect(() => {
    if (lobbyRoom) {
      const roomRef = ref(db, `matches/${lobbyRoom.id}`);
      const unsubscribe = onValue(roomRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          setLobbyRoom(data);
          
          // If host started the game, transition client
          if (data.status === 'playing') {
            const hasBot = Object.values(data.participants || {}).some((p: any) => p.isBot || p.userId.startsWith('bot_'));
            onStartMatch(data.id, hasBot);
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

  const fillWithBots = async (targetRoom: MatchRoom) => {
    if (!targetRoom) return;
    const maxPlayers = targetRoom.isTeamBattle ? (targetRoom.teamSize! * 2) : 2;
    const currentParticipants = Object.values(targetRoom.participants) as any[];
    const needed = maxPlayers - currentParticipants.length;
    if (needed <= 0) return;

    const recents = getRecentOpponents();

    // Get already joined participant IDs
    const currentParticipantIds = currentParticipants.map(p => p.userId);

    // Separate potential real online players and bots (excluding current participants)
    const onlineRealPlayers = allUsers.filter(u => u && u.id && u.id !== currentUser?.id && !u.isBot && u.isOnline && !currentParticipantIds.includes(u.id));
    const botsList = allUsers.filter(u => u && u.id && u.isBot && !currentParticipantIds.includes(u.id) && !currentParticipantIds.includes('bot_' + u.id));

    // Filter out recently matched opponents
    let availableReal = onlineRealPlayers.filter(u => u.name && !recents.includes(u.id) && !recents.includes(u.name));
    if (availableReal.length === 0 && onlineRealPlayers.length > 0) {
      availableReal = onlineRealPlayers; // fallback
    }

    let availableBots = botsList.filter(u => u.name && !recents.includes(u.id) && !recents.includes(u.name));
    if (availableBots.length === 0 && botsList.length > 0) {
      availableBots = botsList; // fallback
    }

    // Shuffle fallback real names
    const configuredNames = settings?.customBotNames
      ? settings.customBotNames.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : REALISTIC_BOT_NAMES;
    let availableFallbackNames = configuredNames.filter((name: string) => !recents.includes(name));
    if (availableFallbackNames.length === 0) {
      availableFallbackNames = configuredNames;
    }
    const shuffledFallbacks = [...availableFallbackNames].sort(() => Math.random() - 0.5);

    const updates: any = {};
    for (let i = 0; i < needed; i++) {
       let opponent: any = null;
       let opponentId = '';

       if (availableReal.length > 0) {
         const index = Math.floor(Math.random() * availableReal.length);
         opponent = availableReal.splice(index, 1)[0];
         opponentId = opponent.id;
         addRecentOpponent(opponentId);
         if (opponent.name) addRecentOpponent(opponent.name);
       } else if (availableBots.length > 0) {
         const index = Math.floor(Math.random() * availableBots.length);
         opponent = availableBots.splice(index, 1)[0];
         opponentId = 'bot_' + opponent.id;
         addRecentOpponent(opponent.id);
         if (opponent.name) addRecentOpponent(opponent.name);
       } else {
         const name = shuffledFallbacks[i % shuffledFallbacks.length];
         opponent = { name };
         opponentId = 'bot_' + Math.random().toString(36).substr(2, 5);
         addRecentOpponent(name);
       }

       let botTeam: 'blue' | 'red' | undefined = undefined;
       if (targetRoom.isTeamBattle) {
         const currentAssigned = [...currentParticipants, ...Object.values(updates) as any];
         const blueCount = currentAssigned.filter((p: any) => p.team === 'blue').length;
         const redCount = currentAssigned.filter((p: any) => p.team === 'red').length;
         botTeam = blueCount <= redCount ? 'blue' : 'red';
       }

       const botProgress: any = {
         userId: opponentId,
         userName: opponent.name,
         score: 0,
         currentIndex: 0,
         finished: false,
         accuracy: 0,
         isBot: true
       };
       if (opponent.avatar) {
         botProgress.avatar = opponent.avatar;
       }
       if (opponent.avatarUrl) {
         botProgress.avatarUrl = opponent.avatarUrl;
       }
       if (botTeam) {
         botProgress.team = botTeam;
       }
       updates[`participants/${opponentId}`] = botProgress;
    }

    await update(ref(db, `matches/${targetRoom.id}`), updates);
  };

  const createFriendRoom = async () => {
    if (!currentUser) return;
    const roomRef = push(ref(db, 'matches'));
    const roomId = roomRef.key!;
    const code = generateRoomCode();

    const playerProgress: any = { 
      userId: currentUser.id, 
      userName: currentUser.name, 
      score: 0, 
      currentIndex: 0, 
      finished: false, 
      accuracy: 0
    };
    if (isTeamMode) {
      playerProgress.team = 'blue';
    }

    const room: any = {
      id: roomId,
      topicId: currentUser.selectedTopicId || 'general',
      joinCode: code,
      hostId: currentUser.id,
      participants: {
        [currentUser.id]: playerProgress
      },
      status: 'waiting',
      timerEnabled: useTimer,
      whoFirstMode: whoFirst,
      totalTime: timeLimit,
      isTeamBattle: isTeamMode,
      createdAt: Date.now()
    };
    if (isTeamMode) {
      room.teamSize = teamSize;
    }

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
      const roomToJoin = Object.values(matches).find((m: any) => m.joinCode === joinCode && m.status === 'waiting') as any;
      
      if (roomToJoin) {
        const currentProgressCount = Object.keys(roomToJoin.participants).length;
        const maxPlayers = roomToJoin.isTeamBattle ? (roomToJoin.teamSize * 2) : 2;
        if (currentProgressCount >= maxPlayers) {
          setError('Room is full');
          return;
        }

        let assignedTeam: 'blue' | 'red' | undefined = undefined;
        if (roomToJoin.isTeamBattle) {
           const blueCount = Object.values(roomToJoin.participants).filter((p: any) => p.team === 'blue').length;
           const redCount = Object.values(roomToJoin.participants).filter((p: any) => p.team === 'red').length;
           assignedTeam = blueCount <= redCount ? 'blue' : 'red';
        }

        const playerProgress: any = {
          userId: currentUser.id,
          userName: currentUser.name,
          score: 0,
          currentIndex: 0,
          finished: false,
          accuracy: 0
        };
        if (assignedTeam) {
          playerProgress.team = assignedTeam;
        }

        const updates = {
          [`participants/${currentUser.id}`]: playerProgress
        };
        await update(ref(db, `matches/${roomToJoin.id}`), updates);
        setLobbyRoom({ ...roomToJoin, participants: { ...roomToJoin.participants, [currentUser.id]: updates[`participants/${currentUser.id}`] } as any });
      } else {
        setError('Invalid or expired room code');
      }
    }
  };

  const toggleTeam = async (userId: string) => {
    if (!lobbyRoom) return;
    const currentTeam = lobbyRoom.participants[userId]?.team || 'blue';
    const nextTeam = currentTeam === 'blue' ? 'red' : 'blue';
    
    // Check if target team size is exceeded
    const teamCount = Object.values(lobbyRoom.participants).filter((p: any) => p.team === nextTeam).length;
    if (teamCount >= lobbyRoom.teamSize!) {
       setError(`Cannot switch: Team ${nextTeam === 'blue' ? 'Blue' : 'Red'} is already full!`);
       return;
    }

    await update(ref(db, `matches/${lobbyRoom.id}/participants/${userId}`), {
       team: nextTeam
    });
    setError('');
  };

  const startMatchAsHost = async () => {
    if (!lobbyRoom || !currentUser) return;
    
    // Auto fill with bots if there are empty slots!
    const maxPlayers = lobbyRoom.isTeamBattle ? (lobbyRoom.teamSize! * 2) : 2;
    const currentCount = Object.keys(lobbyRoom.participants).length;
    if (currentCount < maxPlayers) {
       await fillWithBots(lobbyRoom);
    }

    await update(ref(db, `matches/${lobbyRoom.id}`), {
      status: 'playing',
      startTime: Date.now()
    });
    onStartMatch(lobbyRoom.id, true); // Treat as bot-inclusive if we filled/started
  };

  const createPublicPendingRoom = async (teamModeEnabled?: boolean, sizeOfTeam?: number) => {
    if (!currentUser) return;
    const roomRef = push(ref(db, 'matches'));
    const roomId = roomRef.key!;

    const playerProgress: any = { 
      userId: currentUser.id, 
      userName: currentUser.name, 
      score: 0, 
      currentIndex: 0, 
      finished: false, 
      accuracy: 0
    };
    if (teamModeEnabled) {
      playerProgress.team = 'blue';
    }

    const room: any = {
      id: roomId,
      topicId: currentUser.selectedTopicId || 'general',
      hostId: currentUser.id,
      participants: {
        [currentUser.id]: playerProgress
      },
      status: 'waiting',
      timerEnabled: false,
      whoFirstMode: false,
      totalTime: 10,
      isTeamBattle: !!teamModeEnabled,
      createdAt: Date.now()
    };
    if (teamModeEnabled) {
      room.teamSize = sizeOfTeam;
    }

    await set(roomRef, room);
    setMatchmakingRoomId(roomId);

    // Notify other online players about this player starting matchmaking so they can join!
    try {
      const otherPlayers = allUsers.filter(u => u && u.id && u.id !== currentUser.id && !u.isBot && u.isOnline);
      if (otherPlayers.length > 0) {
        const title = "Battle Arena Challenger!";
        const body = `${currentUser.name} is playing in multiplayer. If you want to play with ${currentUser.name}, you can join!`;

        const serviceAccountSnap = await get(ref(db, 'adminConfig/serviceAccount'));
        const serviceAccount = serviceAccountSnap.val();

        for (const player of otherPlayers) {
          // 1. Live RTDB notification banner
          const alertRef = push(ref(db, `users/${player.id}/liveAlerts`));
          await set(alertRef, {
            title: "Join Multiplayer Battle!",
            body: `${currentUser.name} is looking for a challenger in Multiplayer. Click to join right now!`,
            timestamp: Date.now()
          });

          // Auto remove banner after 30 sec to prevent old stale items
          setTimeout(async () => {
             try {
               await remove(ref(db, `users/${player.id}/liveAlerts/${alertRef.key}`));
             } catch (e){}
          }, 30000);

          // 2. Real Push FCM notification
          if (serviceAccount && settings?.pushNotificationsEnabled !== false) {
             try {
               const tokensSnap = await get(ref(db, `fcmTokens/${player.id}`));
               if (tokensSnap.exists()) {
                 const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
                 for (const token of tokens) {
                   await NotificationService.sendToToken(serviceAccount, token, title, body);
                 }
               }
             } catch (fSnapErr) {
               console.error("FCM custom ticket error:", fSnapErr);
             }
          }
        }
      }
    } catch (pushErr) {
      console.error("Matchmaking active alert broadcast error:", pushErr);
    }
  };

  const startOnlineMatch = async () => {
    if (!currentUser) return;
    setMatching(true);
    setError('');

    const targetTeamMode = quickBattleMode !== 'solo';
    const targetTeamSize = quickBattleMode === '2v2' ? 2 : quickBattleMode === '3v3' ? 3 : quickBattleMode === '4v4' ? 4 : undefined;

    try {
       const matchesSnap = await get(ref(db, 'matches'));
       if (matchesSnap.exists()) {
          const matches = matchesSnap.val();
          const joinable = Object.values(matches).find((m: any) => 
             m.status === 'waiting' && 
             !m.joinCode &&
             m.hostId !== currentUser.id &&
             !!m.isTeamBattle === targetTeamMode &&
             (!targetTeamMode || m.teamSize === targetTeamSize) &&
             Object.keys(m.participants || {}).length < (m.isTeamBattle ? (m.teamSize * 2) : 2)
          ) as any;

          if (joinable) {
             let assignedTeam: 'blue' | 'red' | undefined = undefined;
             if (joinable.isTeamBattle) {
                const blueCount = Object.values(joinable.participants || {}).filter((p: any) => p.team === 'blue').length;
                const redCount = Object.values(joinable.participants || {}).filter((p: any) => p.team === 'red').length;
                assignedTeam = blueCount <= redCount ? 'blue' : 'red';
             }

             const playerProgress: any = {
                userId: currentUser.id,
                userName: currentUser.name,
                score: 0,
                currentIndex: 0,
                finished: false,
                accuracy: 0
             };
             if (assignedTeam) {
                playerProgress.team = assignedTeam;
             }

             const updates = {
                [`participants/${currentUser.id}`]: playerProgress
             };
             await update(ref(db, `matches/${joinable.id}`), updates);
             setMatching(false);
             onStartMatch(joinable.id, false);
             return;
          }
       }
    } catch (e) {
       console.error("Matchmaking error: ", e);
    }

    // Since no waiting public match is available, host a public matching room
    await createPublicPendingRoom(targetTeamMode, targetTeamSize);
  };

  if (!currentUser) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 dark:bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-lg bg-white dark:bg-[#050505] rounded-[2.5rem] border border-black/10 dark:border-white/5 overflow-hidden flex flex-col max-h-[90vh] text-neutral-900 dark:text-white shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 md:p-8 flex items-center justify-between border-b border-black/10 dark:border-white/5">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
               <Swords size={24} />
             </div>
             <div>
               <h2 className="text-xl font-black tracking-tighter">BATTLE HUB</h2>
               <p className="text-[10px] font-bold text-neutral-500 dark:text-white/40 uppercase tracking-widest px-1">Multiplayer Competition</p>
             </div>
           </div>
           {!matching && (
             <button 
               onClick={onClose}
               className="p-3 bg-neutral-100 dark:bg-white/5 rounded-2xl hover:bg-neutral-200 dark:hover:bg-white/10 transition-all text-neutral-500 dark:text-white/40"
             >
               <X size={20} />
             </button>
           )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
           {matching ? (
            <div className="py-12 flex flex-col items-center text-center space-y-6">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  className="absolute w-28 h-28 border-4 border-solid border-neutral-100 dark:border-white/5 border-t-primary rounded-full"
                />
                {/* Inner Counter-Clockwise Spin Ring */}
                <motion.div 
                  animate={{ rotate: -360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="absolute w-18 h-18 border-2 border-dashed border-[#32befa]/35 border-t-[#32befa] rounded-full"
                />
                {/* Center pulsing indicator */}
                <div className="absolute w-5 h-5 bg-primary/25 rounded-full animate-pulse flex items-center justify-center border border-primary/45">
                   <div className="w-2.5 h-2.5 bg-primary rounded-full animate-ping" />
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-black mb-1 text-neutral-800 dark:text-neutral-100 uppercase tracking-widest">Finding Opponent</h3>
                <p className="text-[10px] font-bold text-neutral-400 dark:text-white/20 uppercase tracking-widest mt-1 animate-pulse font-mono">
                  Connecting to global channels...
                </p>
              </div>

              <button
                onClick={cancelMatchmaking}
                className="mt-4 px-6 py-2.5 bg-red-500/10 hover:bg-red-500/15 text-red-500 text-[10px] font-black uppercase tracking-wider rounded-full border border-red-500/20 transition-all font-sans"
              >
                Cancel Search
              </button>
            </div>
          ) : lobbyRoom ? (
            <div className="space-y-8">
               <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">Room Code</span>
                  <div className="flex items-center gap-3 bg-neutral-100 dark:bg-white/5 border border-black/10 dark:border-white/5 px-6 py-4 rounded-3xl">
                     <span className="text-3xl font-black tracking-[0.2em]">{lobbyRoom.joinCode}</span>
                     <button onClick={() => navigator.clipboard.writeText(lobbyRoom.joinCode || '')} className="p-2 hover:text-primary transition-colors text-neutral-550 dark:text-white/80">
                        <Copy size={20} />
                     </button>
                  </div>
               </div>

                {lobbyRoom.isTeamBattle ? (
                  <div className="grid grid-cols-2 gap-4">
                     {/* Team Blue Card */}
                     <div className="bg-blue-500/5 border border-blue-500/10 p-5 rounded-[2rem] flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-blue-500/10 pb-2">
                           <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-1">🔵 Team Blue</span>
                           <span className="text-[9px] font-mono font-bold text-blue-400">{Object.values(lobbyRoom.participants).filter((p: any) => p.team === 'blue').length} / {lobbyRoom.teamSize}</span>
                        </div>
                        <div className="space-y-2 min-h-[120px] max-h-[180px] overflow-y-auto">
                           {Object.values(lobbyRoom.participants).filter((p: any) => p.team === 'blue').map((p: any, idx: number) => (
                              <div key={`blue-${p.userId || idx}-${idx}`} className="flex items-center justify-between text-left bg-neutral-100 dark:bg-white/5 p-2 px-3 rounded-xl border border-black/5 dark:border-white/5 gap-1.5 animate-fade-in">
                                 <div className="truncate pr-1">
                                    <p className="font-bold text-xs uppercase truncate text-neutral-900 dark:text-white">{p.userName}</p>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {p.userId === lobbyRoom.hostId && <span className="text-[6px] bg-blue-500 text-black px-1 rounded-sm font-black tracking-widest uppercase">Host</span>}
                                      {p.isBot && currentUser?.role === 'admin' && <span className="text-[6px] bg-amber-400 text-black px-1 rounded-sm font-black tracking-widest uppercase">BOT</span>}
                                    </div>
                                 </div>
                                 {p.userId === currentUser.id && (
                                    <button 
                                      onClick={() => toggleTeam(p.userId)}
                                      className="text-[7px] bg-[#32befa]/20 hover:bg-[#32befa]/30 text-[#32befa] dark:text-white font-black uppercase px-1.5 py-1 rounded transition-all"
                                    >
                                      Switch
                                    </button>
                                 )}
                              </div>
                           ))}
                        </div>
                     </div>

                     {/* Team Red Card */}
                     <div className="bg-red-500/5 border border-red-500/10 p-5 rounded-[2rem] flex flex-col gap-3">
                        <div className="flex items-center justify-between border-b border-red-500/10 pb-2">
                           <span className="text-[10px] font-black text-red-505 uppercase tracking-widest flex items-center gap-1 flex-1 min-w-0">🔴 Team Red</span>
                           <span className="text-[9px] font-mono font-bold text-red-400">{Object.values(lobbyRoom.participants).filter((p: any) => p.team === 'red').length} / {lobbyRoom.teamSize}</span>
                        </div>
                        <div className="space-y-2 min-h-[120px] max-h-[180px] overflow-y-auto">
                           {Object.values(lobbyRoom.participants).filter((p: any) => p.team === 'red').map((p: any, idx: number) => (
                              <div key={`red-${p.userId || idx}-${idx}`} className="flex items-center justify-between text-left bg-neutral-100 dark:bg-white/5 p-2 px-3 rounded-xl border border-black/5 dark:border-white/5 gap-1.5 animate-fade-in">
                                 <div className="truncate pr-1">
                                    <p className="font-bold text-xs uppercase truncate text-neutral-900 dark:text-white">{p.userName}</p>
                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                      {p.userId === lobbyRoom.hostId && <span className="text-[6px] bg-red-500 text-black px-1 rounded-sm font-black tracking-widest uppercase">Host</span>}
                                      {p.isBot && currentUser?.role === 'admin' && <span className="text-[6px] bg-amber-400 text-black px-1 rounded-sm font-black tracking-widest uppercase">BOT</span>}
                                    </div>
                                 </div>
                                 {p.userId === currentUser.id && (
                                    <button 
                                      onClick={() => toggleTeam(p.userId)}
                                      className="text-[7px] bg-[#32befa]/20 hover:bg-[#32befa]/30 text-[#32befa] dark:text-white font-black uppercase px-1.5 py-1 rounded transition-all"
                                    >
                                      Switch
                                    </button>
                                 )}
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                     {/* Player 1 */}
                     <div className="bg-neutral-100 dark:bg-white/5 border border-black/5 dark:border-white/5 p-6 rounded-[2rem] flex flex-col items-center gap-3">
                        <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
                           <UserIcon size={32} />
                        </div>
                        <p className="font-black text-sm uppercase truncate w-full text-center text-neutral-900 dark:text-white">{currentUser?.name || "You"}</p>
                        <span className="text-[8px] font-black text-primary uppercase tracking-widest px-2 py-1 bg-primary/10 rounded-lg border border-primary/20">Host</span>
                     </div>

                     {/* Player 2 */}
                     <div className={cn(
                       "p-6 rounded-[2rem] flex flex-col items-center gap-3 transition-all duration-500",
                       Object.keys(lobbyRoom.participants).length > 1 
                         ? "bg-neutral-100 dark:bg-white/5 border border-black/5 dark:border-white/5" 
                         : "bg-neutral-50/[0.3] dark:bg-white/[0.02] border border-dashed border-black/10 dark:border-white/10 opacity-60"
                     )}>
                        {Object.keys(lobbyRoom.participants).length > 1 ? (
                          <>
                            <div className="w-16 h-16 bg-neutral-200 dark:bg-white/10 rounded-2xl flex items-center justify-center text-neutral-500 dark:text-white/40 border border-black/10 dark:border-white/10">
                               <UserIcon size={32} />
                            </div>
                            <p className="font-black text-sm uppercase truncate w-full text-center text-neutral-900 dark:text-white">
                              {((Object.values(lobbyRoom.participants) as MatchProgress[]).find((p) => p.userId !== currentUser?.id))?.userName || 'Player 2'}
                            </p>
                            <span className="text-[8px] font-black text-neutral-500 dark:text-white/40 uppercase tracking-widest">
                              {((Object.values(lobbyRoom.participants) as MatchProgress[]).find((p) => p.userId !== currentUser?.id))?.isBot && currentUser?.role === 'admin' ? 'BOT' : 'Joined'}
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="w-16 h-16 rounded-2xl border border-dashed border-black/20 dark:border-white/20 flex items-center justify-center text-neutral-400 dark:text-white/10">
                               <Plus size={32} />
                            </div>
                            <p className="font-black text-xs text-neutral-400 dark:text-white/20 uppercase tracking-tighter">Waiting...</p>
                          </>
                        )}
                     </div>
                  </div>
                )}

               <div className="bg-neutral-100 dark:bg-white/5 rounded-3xl p-6 border border-black/5 dark:border-white/5 space-y-4">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <Clock size={16} className={cn(lobbyRoom.timerEnabled ? "text-primary" : "text-neutral-450 dark:text-white/20")} />
                     <span className="text-[10px] font-black uppercase tracking-widest text-neutral-700 dark:text-white/80">Match Timer</span>
                   </div>
                   <span className={cn("text-xs font-black", lobbyRoom.timerEnabled ? "text-primary" : "text-neutral-450 dark:text-white/20")}>
                     {lobbyRoom.timerEnabled ? `${lobbyRoom.totalTime} Minutes` : 'Disabled'}
                   </span>
                 </div>
                 {lobbyRoom.timerEnabled && (
                   <div className="w-full h-1 bg-neutral-200 dark:bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all" 
                        style={{ width: `${(lobbyRoom.totalTime / 160) * 100}%` }} 
                      />
                   </div>
                 )}

                 <div className="flex items-center justify-between pt-2 border-t border-black/10 dark:border-white/5">
                    <div className="flex items-center gap-2">
                       <Zap size={16} className={cn(lobbyRoom.whoFirstMode ? "text-[#facc15]" : "text-neutral-450 dark:text-white/20")} />
                       <span className="text-[10px] font-black uppercase tracking-widest text-neutral-700 dark:text-white/80">Who First Mode</span>
                    </div>
                    <span className={cn("text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md", lobbyRoom.whoFirstMode ? "bg-[#facc15]/20 text-[#facc15]" : "bg-neutral-200 dark:bg-white/5 text-neutral-500 dark:text-white/20")}>
                       {lobbyRoom.whoFirstMode ? 'Enabled' : 'Disabled'}
                    </span>
                 </div>
               </div>

               <div className="pt-4">
                 {lobbyRoom.hostId === currentUser.id && Object.keys(lobbyRoom.participants).length < (lobbyRoom.isTeamBattle ? (lobbyRoom.teamSize! * 2) : 2) && (
                    <button 
                      onClick={() => fillWithBots(lobbyRoom)}
                      className="w-full mb-3 bg-neutral-100 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 text-neutral-900 dark:text-white font-black py-4 rounded-[1.2rem] uppercase tracking-widest text-[9px] transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                    >
                       <Users size={14} className="text-primary" />
                       Fill Slots with Bots
                    </button>
                 )}

                 {lobbyRoom.hostId === currentUser.id ? (
                    <button 
                      disabled={!lobbyRoom.isTeamBattle && Object.keys(lobbyRoom.participants).length < 2}
                      onClick={startMatchAsHost}
                      className="w-full bg-primary text-black font-black py-5 rounded-[1.5rem] uppercase tracking-widest text-xs shadow-[0_10px_30px_rgba(var(--primary-color),0.2)] disabled:opacity-50 disabled:grayscale transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-3"
                    >
                       <Play size={20} fill="black" />
                       Start Game {lobbyRoom.isTeamBattle && `(${Object.keys(lobbyRoom.participants).length}/${lobbyRoom.teamSize! * 2})`}
                    </button>
                 ) : (
                    <div className="w-full bg-neutral-100 dark:bg-white/5 py-5 rounded-[1.5rem] flex items-center justify-center gap-3 text-neutral-500 dark:text-white/40 border border-black/10 dark:border-white/5 animate-pulse">
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
                  className="w-full mt-4 py-2 text-[10px] font-bold text-neutral-400 dark:text-white/20 uppercase tracking-widest hover:text-red-500 transition-colors"
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
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-white/40">Play with Friend</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setActiveMode('friend')}
                    className="flex flex-col items-center gap-4 bg-neutral-150 dark:bg-white/5 border border-black/10 dark:border-white/5 p-6 rounded-[2.5rem] hover:border-primary/30 transition-all group"
                  >
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:scale-110 transition-all">
                      <Plus size={28} />
                    </div>
                    <span className="font-black text-xs uppercase tracking-tighter text-neutral-800 dark:text-white">Create Room</span>
                  </button>
                  <button 
                    onClick={() => setActiveMode('friend')}
                    className="flex flex-col items-center gap-4 bg-neutral-150 dark:bg-white/5 border border-black/10 dark:border-white/5 p-6 rounded-[2.5rem] hover:border-primary/30 transition-all group"
                  >
                    <div className="w-14 h-14 bg-neutral-200 dark:bg-white/5 rounded-2xl flex items-center justify-center text-neutral-500 dark:text-white/40 group-hover:scale-110 transition-all">
                      <LogIn size={28} />
                    </div>
                    <span className="font-black text-xs uppercase tracking-tighter text-neutral-800 dark:text-white">Join Room</span>
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
                      <div className="bg-neutral-100 dark:bg-white/5 rounded-[2rem] p-6 border border-black/5 dark:border-white/5 space-y-6">
                        <div className="space-y-4">
                          <label className="flex items-center justify-between p-4 bg-neutral-200/50 dark:bg-white/5 rounded-2xl cursor-pointer hover:bg-neutral-200 dark:hover:bg-white/10 transition-all">
                             <div className="flex items-center gap-3">
                                <Clock size={18} className={cn(useTimer ? "text-primary" : "text-neutral-400 dark:text-white/20")} />
                                <span className="text-xs font-black uppercase tracking-widest text-neutral-800 dark:text-white">Shared Timer</span>
                             </div>
                             <input 
                                type="checkbox" 
                                checked={useTimer} 
                                onChange={(e) => setUseTimer(e.target.checked)}
                                className="w-5 h-5 accent-primary bg-white dark:bg-black border-neutral-300 dark:border-white/10 rounded text-neutral-900 dark:text-white"
                             />
                          </label>

                          <label className="flex items-center justify-between p-4 bg-neutral-200/50 dark:bg-white/5 rounded-2xl cursor-pointer hover:bg-neutral-200 dark:hover:bg-white/10 transition-all">
                             <div className="flex items-center gap-3">
                                <Zap size={18} className={cn(whoFirst ? "text-[#facc15]" : "text-neutral-400 dark:text-white/20")} />
                                <div>
                                   <span className="text-xs font-black uppercase tracking-widest block text-neutral-800 dark:text-white">Who First Solve</span>
                                   <p className="text-[8px] text-neutral-500 dark:text-white/40 uppercase font-bold">First clicker claims the point</p>
                                </div>
                             </div>
                             <input 
                                type="checkbox" 
                                checked={whoFirst} 
                                onChange={(e) => setWhoFirst(e.target.checked)}
                                className="w-5 h-5 accent-[#facc15] bg-white dark:bg-black border-neutral-300 dark:border-white/10 rounded text-neutral-900 dark:text-white"
                             />
                          </label>

                          <label className="flex items-center justify-between p-4 bg-neutral-200/50 dark:bg-white/5 rounded-2xl cursor-pointer hover:bg-neutral-200 dark:hover:bg-white/10 transition-all">
                             <div className="flex items-center gap-3">
                                <Users size={18} className={cn(isTeamMode ? "text-primary" : "text-neutral-400 dark:text-white/20")} />
                                <div>
                                   <span className="text-xs font-black uppercase tracking-widest block font-sans text-neutral-800 dark:text-white">Team Battle</span>
                                   <p className="text-[8px] text-neutral-500 dark:text-white/40 uppercase font-bold">Play in teams with friends</p>
                                </div>
                             </div>
                             <input 
                                type="checkbox" 
                                checked={isTeamMode} 
                                onChange={(e) => setIsTeamMode(e.target.checked)}
                                className="w-5 h-5 accent-primary bg-white dark:bg-black border-neutral-300 dark:border-white/10 rounded text-neutral-900 dark:text-white"
                             />
                          </label>

                          {isTeamMode && (
                             <div className="space-y-2 p-3 bg-neutral-50/[0.3] dark:bg-white/[0.02] rounded-2xl border border-black/5 dark:border-white/5">
                               <span className="text-[8px] font-black uppercase tracking-widest text-neutral-500 dark:text-white/40 pl-1">Select Team Size</span>
                               <div className="grid grid-cols-3 gap-2">
                                 {([2, 3, 4] as const).map((sz) => (
                                   <button
                                     key={sz}
                                     type="button"
                                     onClick={() => setTeamSize(sz)}
                                     className={cn(
                                       "py-2 rounded-xl text-xs font-black transition-all uppercase",
                                       teamSize === sz 
                                         ? "bg-primary text-black" 
                                         : "bg-neutral-200 dark:bg-white/5 text-neutral-700 dark:text-white/60 hover:bg-neutral-300 dark:hover:bg-white/10"
                                     )}
                                   >
                                     {sz}v{sz}
                                   </button>
                                 ))}
                               </div>
                             </div>
                          )}
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
                              className="w-full h-1 bg-neutral-200 dark:bg-white/10 rounded-full appearance-none accent-primary cursor-pointer"
                            />
                            <div className="flex justify-between text-[8px] font-bold text-neutral-400 dark:text-white/20">
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
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-white/20 font-black">#</div>
                        <input 
                          type="text" 
                          maxLength={6}
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="Enter 6-digit Code"
                          className="w-full bg-neutral-100 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 pl-10 text-xl font-black tracking-[0.3em] outline-none focus:border-primary transition-all text-center text-neutral-900 dark:text-white"
                        />
                        {error && <p className="text-red-500 text-[10px] font-bold mt-2 px-2">{error}</p>}
                        <button 
                          disabled={joinCode.length < 6}
                          onClick={joinFriendRoom}
                          className="w-full mt-3 bg-neutral-900 dark:bg-white text-white dark:text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-20 transition-all uppercase tracking-widest text-[11px] hover:bg-neutral-800 dark:hover:bg-neutral-100"
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
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-[#32befa]" />
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-500 dark:text-white/40">Online Match</h3>
                  </div>
                </div>

                {/* Matchmaking Mode Selection */}
                <div className="p-3 bg-neutral-100 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 space-y-2">
                  <div className="text-[8px] font-black uppercase tracking-widest text-neutral-500 dark:text-white/40 pl-1">Matchmaking Mode</div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['solo', '2v2', '3v3', '4v4'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setQuickBattleMode(mode)}
                        className={cn(
                          "py-2 rounded-lg text-[10px] font-black transition-all uppercase",
                          quickBattleMode === mode 
                            ? "bg-[#32befa] text-black shadow-md shadow-[#32befa]/20" 
                            : "bg-neutral-200 dark:bg-white/5 text-neutral-700 dark:text-white/60 hover:bg-neutral-300 dark:hover:bg-white/10"
                        )}
                      >
                        {mode === 'solo' ? '1v1' : mode}
                      </button>
                    ))}
                  </div>
                </div>
                
                <button 
                  onClick={startOnlineMatch}
                  className="w-full group relative overflow-hidden bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-[#111] to-white dark:to-[#050505] border border-black/15 dark:border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between hover:border-[#32befa]/30 transition-all text-neutral-950 dark:text-white shadow-md hover:shadow-lg"
                >
                  <div className="relative z-10 text-left">
                    <h4 className="text-2xl font-black mb-1">Quick Battle</h4>
                    <p className="text-neutral-500 dark:text-white/40 text-[10px] font-bold uppercase tracking-widest">
                      Find and battle with active system users
                    </p>
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
