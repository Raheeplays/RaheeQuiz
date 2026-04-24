import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase/config';
import { ref, set, update } from 'firebase/database';
import { User } from '../types';
import { useUser } from '../contexts/UserContext';
import { Search, UserPlus, UserCheck, UserMinus, X, Users, Clock, Shield, Search as SearchIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import ScoreCard from './ScoreCard';
import { translations } from '../translations';

interface SocialHubProps {
  onClose: () => void;
  allUsers: User[];
  totalQuizzesCount: number;
}

export default function SocialHub({ onClose, allUsers, totalQuizzesCount }: SocialHubProps) {
  const { currentUser } = useUser();
  const [activeTab, setActiveTab] = useState<'search' | 'friends' | 'pending'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  if (!currentUser) return null;
  const lang = currentUser.language || 'en';
  const t = translations[lang] || translations.en;

  const friends = allUsers.filter(u => currentUser.friends?.[u.id]);
  const pendingIncoming = allUsers.filter(u => currentUser.pendingRequests?.[u.id] === 'incoming');
  const pendingOutgoing = allUsers.filter(u => currentUser.pendingRequests?.[u.id] === 'outgoing');

  const filteredUsers = searchQuery.trim() 
    ? allUsers.filter(u => 
        u.id !== currentUser.id && 
        (u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
         (u.username && u.username.toLowerCase().includes(searchQuery.toLowerCase())))
      ).slice(0, 5)
    : [];

  const sendFriendRequest = async (targetUserId: string) => {
    await update(ref(db, `users/${currentUser.id}/pendingRequests`), {
      [targetUserId]: 'outgoing'
    });
    await update(ref(db, `users/${targetUserId}/pendingRequests`), {
      [currentUser.id]: 'incoming'
    });
  };

  const acceptFriendRequest = async (targetUserId: string) => {
    await update(ref(db, `users/${currentUser.id}/friends`), { [targetUserId]: true });
    await update(ref(db, `users/${targetUserId}/friends`), { [currentUser.id]: true });
    await set(ref(db, `users/${currentUser.id}/pendingRequests/${targetUserId}`), null);
    await set(ref(db, `users/${targetUserId}/pendingRequests/${currentUser.id}`), null);
  };

  const cancelOrDeclineRequest = async (targetUserId: string) => {
    await set(ref(db, `users/${currentUser.id}/pendingRequests/${targetUserId}`), null);
    await set(ref(db, `users/${targetUserId}/pendingRequests/${currentUser.id}`), null);
  };

  const removeFriend = async (targetUserId: string) => {
    if (confirm("Remove this friend?")) {
      await set(ref(db, `users/${currentUser.id}/friends/${targetUserId}`), null);
      await set(ref(db, `users/${targetUserId}/friends/${currentUser.id}`), null);
    }
  };

  return (
    <div className="bg-[#0a0a0a] rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col h-full max-h-[85vh]">
        {/* Header */}
        <div className="p-6 md:p-8 flex items-center justify-between border-b border-white/5 bg-black/40 backdrop-blur-xl">
           <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary border border-primary/20">
               <Users size={24} />
             </div>
             <div>
               <h2 className="text-xl font-black tracking-tighter text-white uppercase">{t.friends}</h2>
               <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest px-1">Connect with friends</p>
             </div>
           </div>
        </div>

        {/* Tabs */}
        <div className="flex p-2 gap-1 bg-white/5 mx-6 mt-6 rounded-2xl">
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
                activeTab === tab.id ? "bg-primary text-black" : "text-white/40 hover:bg-white/5"
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
                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={20} />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or @username..."
                  className="w-full bg-white/5 border border-white/5 rounded-2xl p-5 pl-12 text-white outline-none focus:border-primary/30 transition-all font-bold"
                />
              </div>

              <div className="space-y-3">
                {filteredUsers.length > 0 ? (
                  filteredUsers.map(user => (
                    <motion.div 
                      key={user.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-primary/20 transition-all"
                    >
                      <div 
                        className="flex items-center gap-4 cursor-pointer"
                        onClick={() => setSelectedUser(user)}
                      >
                         <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center text-white/40 font-black text-xl border border-white/5">
                            {(user.name || 'P')[0].toUpperCase()}
                         </div>
                         <div>
                            <h4 className="font-bold text-sm text-white">{user.name}</h4>
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
                            className="text-[10px] font-bold text-white/20 hover:text-red-500 uppercase px-3 py-2 bg-white/5 rounded-xl transition-all"
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
                    <SearchIcon size={48} className="mx-auto mb-4 text-white" />
                    <p className="text-sm font-bold text-white">No players found matching "{searchQuery}"</p>
                  </div>
                ) : (
                  <div className="text-center py-12 opacity-20">
                     <Users size={48} className="mx-auto mb-4 text-white" />
                     <p className="text-xs font-bold uppercase tracking-widest leading-loose text-white">Search for players to<br/>start a competition</p>
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
                    className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-primary/20 transition-all"
                  >
                    <div 
                      className="flex items-center gap-4 cursor-pointer"
                      onClick={() => setSelectedUser(user)}
                    >
                       <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary font-black text-xl border border-primary/20">
                          {(user.name || 'P')[0].toUpperCase()}
                       </div>
                       <div>
                          <h4 className="font-bold text-sm text-white">{user.name}</h4>
                          <div className="flex items-center gap-2">
                            <Shield size={10} className="text-primary" />
                            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Rank {user.rank || 1}</span>
                          </div>
                       </div>
                    </div>
                    <button 
                      onClick={() => removeFriend(user.id)}
                      className="p-3 bg-red-500/10 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"
                    >
                      <UserMinus size={18} />
                    </button>
                  </div>
                )
              )) : (
                <div className="text-center py-12 opacity-40">
                  <Users size={48} className="mx-auto mb-4 text-white" />
                  <p className="text-sm font-bold text-white">No friends yet. Start searching!</p>
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
                    <div key={user.id} className="bg-white/5 p-4 rounded-3xl border border-white/5 flex items-center justify-between">
                       <div className="flex items-center gap-4 text-white">
                          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white/40">
                             {(user.name || 'P')[0].toUpperCase()}
                          </div>
                          <div>
                             <h4 className="font-bold text-sm">{user.name}</h4>
                             <p className="text-[8px] text-white/40 uppercase tracking-widest">Wants to be friends</p>
                          </div>
                       </div>
                       <div className="flex gap-2">
                          <button 
                             onClick={() => cancelOrDeclineRequest(user.id)}
                             className="p-2 text-white/40 hover:text-red-500 transition-colors"
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
                  <p className="text-[10px] font-black text-white/40 uppercase tracking-widest px-2">Pending Requests</p>
                  {pendingOutgoing.map(user => (
                    <div key={user.id} className="bg-white/5 p-4 rounded-3xl border border-white/5 flex items-center justify-between opacity-60">
                       <div className="flex items-center gap-4 text-white">
                          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-white/20">
                             {(user.name || 'P')[0].toUpperCase()}
                          </div>
                          <div>
                             <h4 className="font-bold text-sm">{user.name}</h4>
                             <p className="text-[8px] text-white/20 uppercase tracking-widest font-mono">@{user.username || user.id}</p>
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
                  <Clock size={48} className="mx-auto mb-4 text-white" />
                  <p className="text-sm font-bold text-white">No pending requests</p>
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
