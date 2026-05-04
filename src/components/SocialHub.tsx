import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase/config';
import { ref, set, update, push, get } from 'firebase/database';
import { User } from '../types';
import { useUser } from '../contexts/UserContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useDialog } from '../contexts/DialogContext';
import { Search, UserPlus, UserCheck, UserMinus, X, Users, Clock, Shield, Search as SearchIcon, Swords } from 'lucide-react';
import { cn } from '../lib/utils';
import ScoreCard from './ScoreCard';
import { translations } from '../translations';
import { NotificationService } from '../services/notificationService';

interface SocialHubProps {
  onClose: () => void;
  allUsers: User[];
  totalQuizzesCount: number;
}

export default function SocialHub({ onClose, allUsers, totalQuizzesCount }: SocialHubProps) {
  const { currentUser } = useUser();
  const { serviceAccount } = useNotifications();
  const { confirm } = useDialog();
  const [activeTab, setActiveTab] = useState<'search' | 'friends' | 'pending'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [sentChallenges, setSentChallenges] = useState<string[]>([]);

  if (!currentUser) return null;
  const lang = currentUser.language || 'en';
  const t = translations[lang] || translations.en;

  const friends = allUsers.filter(u => currentUser.friends?.[u.id]);
  const pendingIncoming = allUsers.filter(u => currentUser.pendingRequests?.[u.id] === 'incoming');
  const pendingOutgoing = allUsers.filter(u => currentUser.pendingRequests?.[u.id] === 'outgoing');

  const filteredUsers = searchQuery.trim() 
    ? allUsers.filter(u => {
        if (u.id === currentUser.id) return false;
        if (u.isBot && currentUser.role !== 'admin') return false;
        
        const query = searchQuery.trim().toLowerCase();
        const isFriend = currentUser.friends?.[u.id];
        
        // If they are a friend, allow partial matching for convenience
        if (isFriend) {
          return (u.name || '').toLowerCase().includes(query) || 
                 (u.username && u.username.toLowerCase().includes(query));
        }
        
        // If not a friend, only show if the query EXACTLY matches their username
        // This prevents "Unknown" players from appearing in partial searches
        return u.username && u.username.toLowerCase() === query;
      }).slice(0, 5)
    : [];

  const sendFriendRequest = async (targetUserId: string) => {
    await update(ref(db, `users/${currentUser.id}/pendingRequests`), {
      [targetUserId]: 'outgoing'
    });
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

  const acceptFriendRequest = async (targetUserId: string) => {
    await update(ref(db, `users/${currentUser.id}/friends`), { [targetUserId]: true });
    await update(ref(db, `users/${targetUserId}/friends`), { [currentUser.id]: true });
    await set(ref(db, `users/${currentUser.id}/pendingRequests/${targetUserId}`), null);
    await set(ref(db, `users/${targetUserId}/pendingRequests/${currentUser.id}`), null);

    // Send FCM Notification to the requester
    try {
      const tokensSnap = await get(ref(db, `fcmTokens/${targetUserId}`));
      if (tokensSnap.exists()) {
        const tokens = Object.values(tokensSnap.val()) as string[];
        const templateSnap = await get(ref(db, 'customNotifications/friendAccept'));
        let title = 'Friend Request Accepted';
        let body = `${currentUser.name} accepted your friend request!`;

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
      console.error("Failed to send friend accept notification:", e);
    }
  };

  const cancelOrDeclineRequest = async (targetUserId: string) => {
    await set(ref(db, `users/${currentUser.id}/pendingRequests/${targetUserId}`), null);
    await set(ref(db, `users/${targetUserId}/pendingRequests/${currentUser.id}`), null);
  };

  const removeFriend = async (targetUserId: string) => {
    const verified = await confirm({
      title: "Remove Friend",
      description: "Are you sure you want to remove this friend? You'll have to search for them again if you want to reconnect.",
      type: 'confirm'
    });
    
    if (verified) {
      await set(ref(db, `users/${currentUser.id}/friends/${targetUserId}`), null);
      await set(ref(db, `users/${targetUserId}/friends/${currentUser.id}`), null);
    }
  };

  const sendChallenge = async (targetUserId: string) => {
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
        [currentUser.id]: { userId: currentUser.id, score: 0, currentIndex: 0, finished: false, accuracy: 0 }
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
    if (serviceAccount) {
      try {
        // Get target user's tokens
        const tokensSnapshot = await get(ref(db, `fcmTokens/${targetUserId}`));
        if (tokensSnapshot.exists()) {
          const tokens = Object.values(tokensSnapshot.val()) as string[];
          
          // Get template
          const templateSnapshot = await get(ref(db, 'customNotifications/challenge'));
          let title = "New Challenge";
          let body = `${currentUser.name} Challenging You For A Match`;
          
          if (templateSnapshot.exists()) {
            const template = templateSnapshot.val();
            if (template?.title) title = template.title;
            if (template?.body) body = template.body.replace('{player}', currentUser.name);
          }

          for (const token of tokens) {
            await NotificationService.sendToToken(serviceAccount, token, title, body);
          }
        }
      } catch (err) {
        console.error("FCM Send failed:", err);
      }
    }
    
    setSentChallenges(prev => [...prev, targetUserId]);
  };

  return (
    <div className="bg-white dark:bg-[#0a0a0a] rounded-[2.5rem] border border-black/5 dark:border-white/5 overflow-hidden flex flex-col h-full max-h-[85vh]">
        {/* Header */}
        <div className="p-6 md:p-8 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-white/40 dark:bg-black/40 backdrop-blur-xl">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
               <Users size={24} />
             </div>
             <div>
               <h2 className="text-xl font-black tracking-tighter text-black dark:text-white uppercase">{t.friends}</h2>
               <p className="text-[10px] font-bold text-black/30 dark:text-white/40 uppercase tracking-widest px-1">Connect with friends</p>
             </div>
           </div>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-1 bg-black/5 dark:bg-white/5 mx-6 mt-6 rounded-2xl">
          {[
            { id: 'search', label: t.search, icon: SearchIcon },
            { id: 'friends', label: t.friends, icon: Users, count: friends.length },
            { id: 'pending', label: 'Requests', icon: Clock, count: pendingIncoming.length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                activeTab === tab.id ? "bg-primary text-black" : "text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5"
              )}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className={cn(
                  "px-1.5 py-0.5 rounded-md text-[8px]",
                  activeTab === tab.id ? "bg-black/20 text-black" : "bg-primary/20 text-primary"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'search' && (
            <div className="space-y-6">
              <div className="relative">
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-black/20 dark:text-white/20" size={20} />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or @username..."
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl p-5 pl-12 text-black dark:text-white outline-none focus:border-primary/30 transition-all font-bold"
                />
              </div>

              <div className="space-y-3">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map(user => (
                    <motion.div 
                      key={user.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between group hover:border-primary/20 transition-all"
                    >
                      <div 
                        className="flex items-center gap-4 cursor-pointer"
                        onClick={() => setSelectedUser(user)}
                      >
                         <div className="w-12 h-12 bg-black/5 dark:bg-white/10 rounded-xl flex items-center justify-center text-black/40 dark:text-white/40 font-black text-xl border border-black/5 dark:border-white/5">
                            {(user.name || 'P')[0].toUpperCase()}
                         </div>
                         <div className="text-left">
                            <h4 className="font-bold text-sm text-black dark:text-white">{user.name}</h4>
                            <p className="text-[10px] text-primary font-mono lowercase">@{user.username || user.id}</p>
                         </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {currentUser.friends?.[user.id] ? (
                          <div className="p-2 text-green-500 bg-green-500/10 rounded-xl">
                            <UserCheck size={18} />
                          </div>
                        ) : currentUser.pendingRequests?.[user.id] === 'outgoing' ? (
                          <button 
                            onClick={() => cancelOrDeclineRequest(user.id)}
                            className="text-[10px] font-bold text-black/30 dark:text-white/20 hover:text-red-500 dark:hover:text-red-500 uppercase px-3 py-2 bg-black/5 dark:bg-white/5 rounded-xl transition-all"
                          >
                            Cancel
                          </button>
                        ) : currentUser.pendingRequests?.[user.id] === 'incoming' ? (
                          <button 
                            onClick={() => acceptFriendRequest(user.id)}
                            className="text-[10px] font-bold text-black uppercase px-3 py-2 bg-primary rounded-xl transition-all"
                          >
                            Accept
                          </button>
                        ) : (
                          <button 
                            onClick={() => sendFriendRequest(user.id)}
                            className="p-3 bg-primary text-black rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_5px_15px_rgba(var(--primary-color),0.2)]"
                          >
                            <UserPlus size={18} />
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))
                ) : searchQuery.trim() !== '' ? (
                  <div className="text-center py-12 opacity-40">
                    <SearchIcon size={48} className="mx-auto mb-4 text-black dark:text-white" />
                    <p className="text-sm font-bold text-black dark:text-white">No players found matching "{searchQuery}"</p>
                  </div>
                ) : (
                  <div className="text-center py-12 opacity-20">
                     <Users size={48} className="mx-auto mb-4 text-black dark:text-white" />
                     <p className="text-xs font-bold uppercase tracking-widest leading-loose text-black dark:text-white">Search for players to<br/>start a competition</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'friends' && (
            <div className="space-y-3">
              {friends.length > 0 ? (
                friends.map(user => (
                  <div 
                    key={user.id}
                    className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between group hover:border-primary/20 transition-all"
                  >
                    <div 
                      className="flex items-center gap-4 cursor-pointer"
                      onClick={() => setSelectedUser(user)}
                    >
                       <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black text-xl border border-primary/20 overflow-hidden">
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                          ) : (
                            (user.name || 'P')[0].toUpperCase()
                          )}
                       </div>
                       <div className="text-left">
                          <h4 className="font-bold text-sm text-black dark:text-white">{user.name}</h4>
                          <div className="flex items-center gap-2">
                            <Shield size={10} className="text-primary" />
                            <span className="text-[10px] font-bold text-black/30 dark:text-white/40 uppercase tracking-widest">Rank {user.rank || 1}</span>
                          </div>
                       </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <button 
                         onClick={() => !sentChallenges.includes(user.id) && sendChallenge(user.id)}
                         disabled={sentChallenges.includes(user.id)}
                         className={cn(
                           "p-3 rounded-xl transition-all flex items-center gap-2",
                           sentChallenges.includes(user.id) 
                             ? "bg-green-500/10 text-green-500 cursor-default" 
                             : "bg-primary/10 text-primary hover:bg-primary hover:text-black"
                         )}
                         title={sentChallenges.includes(user.id) ? "Challenge Requested" : "Challenge to a Match"}
                       >
                         {sentChallenges.includes(user.id) ? <UserCheck size={18} /> : <Swords size={18} />}
                         <span className="hidden md:inline text-[8px] font-black uppercase tracking-widest">
                           {sentChallenges.includes(user.id) ? "Requested" : "Challenge"}
                         </span>
                       </button>
                       <button 
                         onClick={() => removeFriend(user.id)}
                         className="p-3 bg-red-500/10 text-red-500 rounded-xl md:opacity-0 md:group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                       >
                         <UserMinus size={18} />
                       </button>
                    </div>
                  </div>
                )
              )) : (
                <div className="text-center py-12 opacity-40">
                  <Users size={48} className="mx-auto mb-4 text-black dark:text-white" />
                  <p className="text-sm font-bold text-black dark:text-white">No friends yet. Start searching!</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'pending' && (
            <div className="space-y-6">
              {pendingIncoming.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest px-2">Incoming Requests</p>
                  {pendingIncoming.map(user => (
                    <div key={user.id} className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl border border-black/5 dark:border-white/5 flex items-center justify-between">
                       <div className="flex items-center gap-4 text-black dark:text-white">
                          <div className="w-10 h-10 bg-black/5 dark:bg-white/10 rounded-xl flex items-center justify-center text-black/30 dark:text-white/40 overflow-hidden">
                             {user.avatarUrl ? (
                               <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                             ) : (
                               (user.name || 'P')[0].toUpperCase()
                             )}
                          </div>
                          <div className="text-left">
                             <h4 className="font-bold text-sm">{user.name}</h4>
                             <p className="text-[8px] text-black/30 dark:text-white/40 uppercase tracking-widest">Wants to be friends</p>
                          </div>
                       </div>
                       <div className="flex gap-2">
                          <button 
                             onClick={() => cancelOrDeclineRequest(user.id)}
                             className="p-2 text-black/30 dark:text-white/40 hover:text-red-500 transition-colors"
                          >
                             <X size={20} />
                          </button>
                          <button 
                             onClick={() => acceptFriendRequest(user.id)}
                             className="p-2 bg-primary text-black rounded-xl hover:scale-105 transition-all"
                          >
                             <UserCheck size={20} />
                          </button>
                       </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingOutgoing.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-black/30 dark:text-white/40 uppercase tracking-widest px-2">Pending Requests</p>
                  {pendingOutgoing.map(user => (
                    <div key={user.id} className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl border border-black/5 dark:border-white/5 flex items-center justify-between opacity-60">
                       <div className="flex items-center gap-4 text-black dark:text-white">
                          <div className="w-10 h-10 bg-black/5 dark:bg-white/10 rounded-xl flex items-center justify-center text-black/20 dark:text-white/20 overflow-hidden">
                             {user.avatarUrl ? (
                               <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                             ) : (
                               (user.name || 'P')[0].toUpperCase()
                             )}
                          </div>
                          <div className="text-left">
                             <h4 className="font-bold text-sm">{user.name}</h4>
                             <p className="text-[8px] text-black/20 dark:text-white/20 uppercase tracking-widest font-mono">@{user.username || user.id}</p>
                          </div>
                       </div>
                       <button 
                          onClick={() => cancelOrDeclineRequest(user.id)}
                          className="text-[8px] font-black uppercase text-red-500/60 tracking-widest hover:text-red-500"
                       >
                          Cancel
                       </button>
                    </div>
                  ))}
                </div>
              )}

              {pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
                <div className="text-center py-12 opacity-40">
                  <Clock size={48} className="mx-auto mb-4 text-black dark:text-white" />
                  <p className="text-sm font-bold text-black dark:text-white">No pending requests</p>
                </div>
              )}
            </div>
          )}
        </div>

      {/* Profile/ScoreCard Modal */}
      <AnimatePresence>
        {selectedUser && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
             <ScoreCard 
                user={selectedUser} 
                onClose={() => setSelectedUser(null)} 
                totalQuizzesCount={totalQuizzesCount}
             />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
