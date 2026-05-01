import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { db, auth } from '../firebase/config';
import { ref, set, get, push, query, orderByChild, equalTo } from 'firebase/database';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
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
  const RaheeKey = 'RaheeKey';
  const lang = 'en'; 
  const t = translations[lang];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || (!isLogin && !name) || !password) {
      setError('Please fill all fields');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const cleanId = username.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
      const email = `${cleanId}@Rahee.in`;

      if (isLogin) {
        // Step 1: Sign in with derived email/password
        try {
          const authResult = await signInWithEmailAndPassword(auth, email, password);
          const fbUid = authResult.user.uid;

          // Step 2: Get user data from RTDB using fbUid as key
          const userRef = ref(db, `users/${fbUid}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            const userMatch = snapshot.val();
            if (userMatch.status === 'revoked' || userMatch.status === 'banned') {
              setError(`Your account has been ${userMatch.status}. Contact Rahee for help.`);
              setLoading(false);
              return;
            }
            setCurrentUser({ ...userMatch, id: fbUid });
          } else {
            setError('User profile not found in database');
          }
        } catch (err: any) {
          if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            setError('Invalid username or password');
          } else {
            setError('Login failed: ' + err.message);
          }
        }
      } else {
        // Signup logic - we check availability by searching the users node for the username
        try {
          const usersRef = ref(db, 'users');
          const usernameQuery = query(usersRef, orderByChild('username'), equalTo(cleanId));
          const nameCheck = await get(usernameQuery);
          
          if (nameCheck.exists()) {
            setError('Username already taken');
            setLoading(false);
            return;
          }

          const authResult = await createUserWithEmailAndPassword(auth, email, password);
          await completeSignup(authResult.user.uid, cleanId);
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            setError('Username already taken');
          } else {
            setError('Signup failed: ' + err.message);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const completeSignup = async (fbUid: string, cleanId: string) => {
    const newUser: any = {
      id: fbUid,
      fbUid: fbUid,
      name,
      username: cleanId,
      password: password,
      role: 'user',
      status: 'pending',
      xp: 0,
      rank: 1,
      currentRound: 1,
      currentQuizIndex: 0,
      selectedTopicId: null,
      fixedTopicId: null,
      canSwitchTopic: false,
      language: 'en',
      raheeCoins: 0,
      lifelines: {
        'fiftyFifty': 0,
        'changeQuiz': 0
      },
      scores: {}
    };

    // Store in users indexed by UID
    await set(ref(db, `users/${fbUid}`), newUser);
    
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
                {isLogin ? 'Name (Optional)' : 'Display Name'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!isLogin) {
                    setUsername(e.target.value.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, ''));
                  }
                }}
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-[#32befa] outline-none transition-all"
                placeholder={isLogin ? "Enter your name" : "Enter your display name"}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Username (ID)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#32befa] font-black">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-2xl p-4 pl-10 text-white focus:border-[#32befa] outline-none transition-all"
                  placeholder="rahee_rock"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-[#32befa] outline-none transition-all"
                placeholder="Enter password"
              />
            </div>
          </div>
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
