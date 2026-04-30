import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { db, auth } from '../firebase/config';
import { ref, set, get, push } from 'firebase/database';
import { signInAnonymously } from 'firebase/auth';
import { useUser } from '../contexts/UserContext';
import { User } from '../types';
import { cn } from '../lib/utils';
import { LogIn, UserPlus } from 'lucide-react';
// import { CLASSES, SUBJECTS } from '../constants';
import { translations } from '../translations';

export default function Auth() {
  const { setCurrentUser } = useUser();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const lang = 'en'; 
  const t = translations[lang];

  // ... bootstrap admin code etc ...

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || (!isLogin && !username) || !password) {
      setError('Please fill all fields');
      return;
    }
    setError('');
    setLoading(true);

    try {
      console.log("[Auth] Starting authentication process...");
      
      // Explicitly call signInAnonymously if no user is currently authenticated
      if (!auth.currentUser) {
        console.log("[Auth] No current user found. Signing in anonymously...");
        const result = await signInAnonymously(auth);
        console.log("[Auth] Anonymous sign-in successful. UID:", result.user.uid);
      } else {
        console.log("[Auth] Already signed in. UID:", auth.currentUser.uid);
      }

      // Check auth state again to be sure
      if (!auth.currentUser) {
        console.error("[Auth] Authentication failed after attempt.");
        setError('Authentication failed. Please check your internet connection.');
        setLoading(false);
        return;
      }

      if (isLogin) {
        console.log("[Auth] Proceeding with login lookup...");
        const usersRef = ref(db, 'users');
        
        // Log access attempt
        console.log("[Auth] Querying /users node...");
        let snapshot;
        try {
          snapshot = await get(usersRef);
          console.log("[Auth] Database query successful.");
        } catch (dbErr: any) {
          console.error("[Auth] Database access denied:", dbErr.message);
          if (dbErr.message.includes("permission_denied")) {
            setError("Access denied. Database rules error.");
          } else {
            setError("Database error: " + dbErr.message);
          }
          setLoading(false);
          return;
        }

        if (snapshot.exists()) {
          const users = snapshot.val();
          console.log("[Auth] Users found:", Object.keys(users).length);
          
          const userMatch = Object.values(users).find(
            (u: any) => (
              (u.name || '').toLowerCase() === name.toLowerCase() || 
              (u.username || '').toLowerCase() === name.toLowerCase() || 
              (u.id || '').toLowerCase() === name.toLowerCase()
            ) && u.password === password
          ) as User | undefined;

          if (userMatch) {
            console.log("[Auth] Login match found for user:", userMatch.username);
            
            if (userMatch.status === 'pending') {
              console.warn("[Auth] Account pending approval:", userMatch.username);
              setError('Account pending admin approval. Please wait.');
              setLoading(false);
              return;
            }
            if (userMatch.status === 'revoked' || userMatch.status === 'banned') {
              console.error("[Auth] Account restricted:", userMatch.status);
              setError(`Your account has been ${userMatch.status}. Contact Rahee for help.`);
              setLoading(false);
              return;
            }
            setCurrentUser(userMatch);
          } else {
            console.warn("[Auth] No matching user found for provided credentials.");
            setError('Invalid credentials');
          }
        } else {
          console.warn("[Auth] Users node is empty.");
          setError('User not found');
        }
      } else {
        console.log("[Auth] Proceeding with signup...");
        // Signup logic
        if (!username || !name || !password) {
          setError('Please fill all fields');
          setLoading(false);
          return;
        }
        
        const authUser = auth.currentUser;
        console.log("[Auth] Current Auth User for signup:", authUser.uid);

        const usersRef = ref(db, 'users');
        const snapshot = await get(usersRef);
        const users = snapshot.val() || {};
        const cleanUsername = username.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
        
        const usernameTaken = Object.values(users).some((u: any) => (u.username || '').toLowerCase() === cleanUsername);
        
        if (usernameTaken) {
          console.warn("[Auth] Username already taken:", cleanUsername);
          setError('Username already taken');
          setLoading(false);
          return;
        }
        
        console.log("[Auth] Completing signup...");
        await completeSignup();
        console.log("[Auth] Signup complete.");
      }
    } catch (err: any) {
      console.error("[Auth] Critical error during authentication:", err);
      setError('Something went wrong: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const completeSignup = async () => {
    const authUser = auth.currentUser;
    if (!authUser) {
      setError('Internal error: not authenticated');
      return;
    }

    const firebaseUid = authUser.uid;
    const cleanUsername = username.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    
    const newUser: any = {
      id: firebaseUid,
      name,
      username: cleanUsername,
      password,
      role: 'user',
      status: 'pending',
      xp: 0,
      rank: 1,
      currentRound: 1,
      currentQuizIndex: 0,
      selectedTopicId: null,
      language: 'en',
      raheeCoins: 100,
      lifelines: {
        'fiftyFifty': 1,
        'changeQuiz': 1
      },
      scores: {}
    };

    await set(ref(db, `users/${firebaseUid}`), newUser);
    setCurrentUser(newUser as User);
  };


  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md bg-[#111] p-8 rounded-3xl border border-white/5 shadow-2xl"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-[#32befa] mb-2 font-mono">RAHEE</h1>
          <p className="text-white/60">
            {isLogin ? 'Welcome back, let\'s quiz!' : 'Create an account to play'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">
                {isLogin ? 'Player ID / Name' : 'Display Name'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-[#32befa] outline-none transition-all font-bold"
                placeholder={isLogin ? "Enter your name or ID" : "Your full name"}
              />
            </div>
            {!isLogin && (
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Username (UID)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#32befa] font-black">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, ''))}
                    className="w-full bg-black border border-white/10 rounded-2xl p-4 pl-10 text-white focus:border-[#32befa] outline-none transition-all font-bold"
                    placeholder="Rahee"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Raheekey</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-[#32befa] outline-none transition-all font-bold"
                placeholder="Enter RaheeKey"
              />
            </div>
          </div>
          
          <div className="space-y-3">
            <button
              disabled={loading}
              className="w-full bg-[#32befa] text-black font-black p-5 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-[#32befa]/20"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : isLogin ? (
                <>
                  <LogIn size={20} />
                  {t.login}
                </>
              ) : (
                <>
                  <UserPlus size={20} />
                  {t.signup}
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-white/40 hover:text-white transition-colors text-sm"
          >
            {isLogin ? 'New here? Create an account' : 'Already have an account? Login'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
