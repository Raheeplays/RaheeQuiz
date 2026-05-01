import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { db, auth } from '../firebase/config';
import { ref, set, get } from 'firebase/database';
import { signInAnonymously } from 'firebase/auth';
import { useUser } from '../contexts/UserContext';
import { User } from '../types';
import { cn } from '../lib/utils';
import { Shield, UserCircle } from 'lucide-react';
import { translations } from '../translations';

export default function Auth() {
  const { setCurrentUser } = useUser();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isAdminRequest, setIsAdminRequest] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const lang = 'en'; 
  const t = translations[lang];

  useEffect(() => {
    const bootstrapAuth = async () => {
      // Silent background guest login to ensure we have an auth session for rules
      if (!auth.currentUser) {
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Silent login failed:", err);
          return; // Can't proceed without auth
        }
      }

      // Create admin if not exists
      const adminId = 'rahee';
      const adminUid = 'uSSd2PFd8UUJSH4xmWpVs9pKKpm1';
      const adminRef = ref(db, `users/${adminId}`);
      
      try {
        const snapshot = await get(adminRef);
        if (!snapshot.exists()) {
          await set(adminRef, {
            id: adminId,
            name: 'Rahee',
            username: adminId,
            password: '786',
            role: 'admin',
            status: 'approved',
            xp: 1000000,
            rank: 1,
            currentRound: 1,
            currentQuizIndex: 0,
            raheeCoins: 999999,
            lifelines: { 'fiftyFifty': 99, 'changeQuiz': 99 },
            language: 'en',
            fbUid: adminUid,
            scores: {}
          });

          // Also bootstrap the mapping for rules if we are the admin
          if (auth.currentUser?.uid === adminUid) {
            await set(ref(db, `uidToUsername/${adminUid}`), adminId);
          }
        }
      } catch (e) {
        console.warn("Bootstrap admin check skipped due to permissions");
      }

      // Create aiza admin if not exists
      const aizaId = 'aiza';
      const aizaRef = ref(db, `users/${aizaId}`);
      
      try {
        const aizaSnap = await get(aizaRef);
        if (!aizaSnap.exists()) {
          await set(aizaRef, {
            id: aizaId,
            name: 'Aiza',
            username: aizaId,
            password: '78692',
            role: 'admin',
            status: 'approved',
            xp: 1000000,
            rank: 2,
            currentRound: 1,
            currentQuizIndex: 0,
            raheeCoins: 999999,
            lifelines: { 'fiftyFifty': 99, 'changeQuiz': 99 },
            language: 'en',
            fbUid: 'bootstrap-aiza', // Will be updated on first login
            scores: {}
          });
        }
      } catch (e) {
        console.warn("Bootstrap aiza check skipped due to permissions");
      }
    };
    bootstrapAuth();
  }, []);

  const handleGuestLogin = async () => {
    // This is now purely internal or can be removed. 
    // We'll keep it as a fallback function if needed but remove the button.
    setLoading(true);
    setError('');
    try {
      const result = await signInAnonymously(auth);
      const fbUid = result.user.uid;
      
      const guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
      const newUser: User = {
        id: guestId,
        fbUid: fbUid,
        name: `Guest ${guestId.slice(6, 10).toUpperCase()}`,
        username: guestId,
        role: 'user',
        status: 'approved',
        xp: 0,
        rank: 0,
        currentRound: 1,
        currentQuizIndex: 0,
        selectedTopicId: null,
        language: 'en',
        raheeCoins: 50,
        lifelines: { fiftyFifty: 0, changeQuiz: 1 },
        scores: {}
      };

      await set(ref(db, `uidToUsername/${fbUid}`), guestId);
      await set(ref(db, `users/${guestId}`), newUser);
      setCurrentUser(newUser);
    } catch (err: any) {
      console.error(err);
      setError('Guest login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!isLogin && !name) || !username || !password) {
      setError('Please fill all fields');
      return;
    }
    
    if (isLogin && !username) {
       setError('Please enter your Username (UID)');
       return;
    }
    setError('');
    setLoading(true);

    try {
      const authResult = await signInAnonymously(auth);
      const fbUid = authResult.user.uid;

      if (isLogin) {
        const userRef = ref(db, `users/${username.toLowerCase()}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
          const userMatch = snapshot.val() as User;
          
          if (userMatch.password === password) {
            if (userMatch.status === 'revoked' || userMatch.status === 'banned') {
              setError(`Your account has been ${userMatch.status}. Contact Rahee for help.`);
              setLoading(false);
              return;
            }
            
            if (userMatch.fbUid !== fbUid) {
              const { update: updateFB } = await import('firebase/database');
              await updateFB(userRef, { fbUid: fbUid });
              userMatch.fbUid = fbUid;
            }
            
            const { update: updateDB } = await import('firebase/database');
            await updateDB(ref(db), {
               [`uidToUsername/${fbUid}`]: userMatch.username
            });

            setCurrentUser(userMatch);
          } else {
            setError('Invalid credentials');
          }
        } else {
          setError('User not found');
        }
      } else {
        const cleanId = username.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
        const userRef = ref(db, `users/${cleanId}`);
        const snapshot = await get(userRef);
        
        if (snapshot.exists()) {
          setError('Username already taken');
          setLoading(false);
          return;
        }
        
        await completeSignup(fbUid);
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed. Check your network.');
    } finally {
      setLoading(false);
    }
  };

  const completeSignup = async (fbUid: string) => {
    const cleanId = username.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    
    const newUser: any = {
      id: cleanId,
      fbUid: fbUid,
      name,
      username: cleanId,
      password,
      role: isAdminRequest ? 'admin' : 'user',
      status: 'approved',
      xp: 0,
      rank: 0,
      currentRound: 1,
      currentQuizIndex: 0,
      selectedTopicId: null,
      fixedTopicId: null,
      canSwitchTopic: false,
      language: 'en',
      raheeCoins: 100,
      lifelines: {
        'fiftyFifty': 1,
        'changeQuiz': 1
      },
      scores: {},
      createdAt: new Date().toISOString()
    };

    await set(ref(db, `uidToUsername/${fbUid}`), cleanId);
    await set(ref(db, `users/${cleanId}`), newUser);
    setCurrentUser(newUser as User);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4 font-sans selection:bg-[#32befa]/30">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md bg-[#1d1d1d] p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none text-[#32befa]">
          <Shield size={120} />
        </div>

        <div className="text-center mb-8 relative z-10">
          <div className="w-16 h-16 bg-[#32befa]/20 text-[#32befa] rounded-3xl flex items-center justify-center mx-auto mb-4 border border-[#32befa]/20">
             <Shield size={32} />
          </div>
          <h1 className="text-3xl font-black text-white mb-1 uppercase tracking-tighter">
            {isLogin ? 'Rahee Login' : 'Join Rahee'}
          </h1>
          <p className="text-white/40 text-[10px] font-black uppercase tracking-widest leading-relaxed">
            {isLogin ? 'Pick your entry method' : 'Create an account or join instantly'}
          </p>
        </div>

        {/* Removed Quick Guest Play button per user request */}

        <div className="relative mb-8 z-10">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/5"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-black tracking-widest">
            <span className="px-4 bg-[#1d1d1d] text-white/20">Or Enter Rahee Portal</span>
          </div>
        </div>

        <form onSubmit={handleAuth} className="space-y-6 relative z-10">
          <div className="space-y-4">
            {(!isLogin) && (
              <div>
                <label className="block text-[10px] font-black text-[#32befa] uppercase mb-2 ml-1 tracking-[0.2em]">Player Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!isLogin) {
                      setUsername(e.target.value.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, ''));
                    }
                  }}
                  className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-white font-bold focus:border-[#32befa] outline-none transition-all placeholder:text-white/10"
                  placeholder="Rahee Player"
                />
              </div>
            )}
            
            <div>
              <label className="block text-[10px] font-black text-[#32befa] uppercase mb-2 ml-1 tracking-[0.2em]">Username (UID)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#32befa] font-black">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 pl-10 text-white font-bold focus:border-[#32befa] outline-none transition-all placeholder:text-white/10"
                  placeholder="rahee_id"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-[#32befa] uppercase mb-2 ml-1 tracking-[0.2em]">Raheekey</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-2xl p-4 text-white font-bold focus:border-[#32befa] outline-none transition-all placeholder:text-white/10"
                placeholder="••••••••"
              />
            </div>

            {!isLogin && (
              <div 
                onClick={() => setIsAdminRequest(!isAdminRequest)}
                className="flex items-center gap-3 p-4 bg-black/20 rounded-2xl border border-white/5 cursor-pointer hover:bg-black/40 transition-all"
              >
                <div className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                  isAdminRequest ? "bg-[#32befa] border-[#32befa]" : "bg-transparent border-white/10"
                )}>
                  {isAdminRequest && <Shield size={12} className="text-black" />}
                </div>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-widest transition-all",
                  isAdminRequest ? "text-[#32befa]" : "text-white/20"
                )}>
                  Request Admin Access
                </span>
              </div>
            )}
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }} 
              animate={{ opacity: 1, x: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-center"
            >
              {error}
            </motion.div>
          )}

          <button
            disabled={loading}
            className="w-full bg-[#32befa] text-black font-black p-5 rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-[0_10px_30px_rgba(50,190,250,0.3)]"
          >
            {loading ? (
              <div className="w-6 h-6 border-4 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <span className="uppercase tracking-[0.2em]">{isLogin ? 'Login' : 'Signup'}</span>
            )}
          </button>
        </form>

        <div className="mt-8 text-center relative z-10">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-white/20 hover:text-[#32befa] transition-all text-[10px] font-black uppercase tracking-widest"
          >
            {isLogin ? 'No Rahee Key? Create one' : 'Already have a Rahee Key? Login'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
