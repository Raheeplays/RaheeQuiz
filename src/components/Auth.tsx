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
  const [useEmail, setUseEmail] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const lang = 'en'; 
  const t = translations[lang];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanUsername = username.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    const finalEmail = useEmail ? emailInput : `${cleanUsername}@RaheeGames.in`;

    if (useEmail && !emailInput) {
      setError('Please enter your email');
      return;
    }
    if (!useEmail && !username) {
      setError('Please enter your username');
      return;
    }
    if (!isLogin && !name) {
      setError('Please enter your display name');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // Login Logic
        try {
          const authResult = await signInWithEmailAndPassword(auth, finalEmail, password);
          const fbUid = authResult.user.uid;

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
            setError('Invalid credentials');
          } else {
            setError('Login failed: ' + err.message);
          }
        }
      } else {
        // Signup logic
        try {
          const authResult = await createUserWithEmailAndPassword(auth, finalEmail, password);
          // Now we ARE authenticated, we can check the 'users' node for username conflicts
          // If using derived email, Auth would have already failed if email is in use (which is 1:1 with username)

          const usersRef = ref(db, 'users');
          const usernameQuery = query(usersRef, orderByChild('username'), equalTo(cleanUsername));
          const nameCheck = await get(usernameQuery);
          
          if (nameCheck.exists()) {
            // Someone else has this username
            await authResult.user.delete();
            setError('Username already taken');
            setLoading(false);
            return;
          }

          await completeSignup(authResult.user.uid, cleanUsername);
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            setError(useEmail ? 'Email already in use' : 'Username already taken');
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
      email: useEmail ? emailInput : null,
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
          <h1 className="text-4xl font-black text-[#32befa] mb-2 font-mono text-center">RAHEE</h1>
          <p className="text-white/60">
            {isLogin ? 'Welcome back, let\'s quiz!' : 'Create an account to play'}
          </p>
        </div>

        {/* Auth Toggle */}
        <div className="flex bg-black/50 p-1 rounded-2xl mb-8 border border-white/5">
          <button
            onClick={() => setUseEmail(false)}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
              !useEmail ? "bg-[#32befa] text-black shadow-lg" : "text-white/40 hover:text-white"
            )}
          >
            Username
          </button>
          <button
            onClick={() => setUseEmail(true)}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-bold transition-all",
              useEmail ? "bg-[#32befa] text-black shadow-lg" : "text-white/40 hover:text-white"
            )}
          >
            Email
          </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!useEmail) {
                      setUsername(e.target.value.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, ''));
                    }
                  }}
                  className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-[#32befa] outline-none transition-all"
                  placeholder="Enter your name"
                />
              </div>
            )}

            {useEmail ? (
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Email Address</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-[#32befa] outline-none transition-all"
                  placeholder="your@email.com"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Username (ID)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#34d399] font-black">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-2xl p-4 pl-10 text-white focus:border-[#32befa] outline-none transition-all"
                    placeholder="rahee_rock"
                  />
                </div>
              </div>
            )}

            {!isLogin && useEmail && (
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Unique Username</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#34d399] font-black">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-2xl p-4 pl-10 text-white focus:border-[#32befa] outline-none transition-all"
                    placeholder="choose_username"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-[#32befa] outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-sm font-medium"
            >
              {error}
            </motion.div>
          )}
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
