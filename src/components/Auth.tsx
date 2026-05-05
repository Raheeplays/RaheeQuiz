import React, { useState } from 'react';
import { motion } from 'motion/react';
import { db, auth } from '../firebase/config';
import { ref, set, get, update } from 'firebase/database';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { User } from '../types';
import { cn } from '../lib/utils';
import { LogIn, UserPlus, Shield } from 'lucide-react';
import { translations } from '../translations';

export default function Auth() {
  const { setCurrentUser } = useUser();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { isDark } = useTheme();
  const lang = 'en'; 
  const t = translations[lang];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name && !isLogin) {
      setError('Please enter your Name');
      return;
    }
    if (!username && !isLogin) {
      setError('Please choose a Username');
      return;
    }
    if (!password) {
      setError('Please enter your Rahee Key');
      return;
    }

    if (!isLogin && password.length < 6) {
      setError('Rahee Key must be at least 6 characters');
      return;
    }

    // Use name as identifier for legacy or derive from username/name
    const identifier = isLogin ? name : username;
    const cleanId = identifier.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    const email = `${cleanId}@Rahee.in`;

    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        try {
          const authResult = await signInWithEmailAndPassword(auth, email, password);
          const fbUid = authResult.user.uid;

          const userRef = ref(db, `users/${fbUid}`);
          const snapshot = await get(userRef);
          if (snapshot.exists()) {
            const userMatch = snapshot.val();
            
            // Sync public profile on login
            await update(ref(db, `public_profiles/${fbUid}`), {
              id: fbUid,
              name: userMatch.name,
              username: userMatch.username || userMatch.name.toLowerCase().replace(/\s+/g, ''),
              avatarUrl: userMatch.avatarUrl || null,
              xp: userMatch.xp || 0,
              rank: userMatch.rank || 1,
              weeklyXP: userMatch.weeklyXP || 0,
              dailyXP: userMatch.dailyXP || 0
            });

            // Also ensure username node exists if it doesn't
            if (userMatch.username) {
              const uName = userMatch.username.toLowerCase();
              await set(ref(db, `usernames/${uName}`), fbUid);
            }

            if (userMatch.status === 'pending') {
              setError(`Your account is waiting for approval by Rahee.`);
              setLoading(false);
              return;
            }
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
        try {
          const authResult = await createUserWithEmailAndPassword(auth, email, password);
          await completeSignup(authResult.user.uid, email);
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            setError('Name already taken. Choose another.');
          } else {
            setError('Signup failed: ' + err.message);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed. Please try again.');
    } finally {
      if (error) setLoading(false);
    }
  };

  const completeSignup = async (fbUid: string, email: string) => {
    const cleanUsername = username.toLowerCase().replace(/\s+/g, '');
    const newUser: User = {
      id: fbUid,
      name,
      username: cleanUsername,
      email: email,
      role: 'user',
      status: 'pending',
      xp: 0,
      dailyXP: 0,
      weeklyXP: 0,
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

    await set(ref(db, `users/${fbUid}`), newUser);
    
    // Create public profile on signup
    await set(ref(db, `public_profiles/${fbUid}`), {
      id: fbUid,
      name: newUser.name,
      username: newUser.username,
      avatarUrl: null,
      xp: 0,
      rank: 1,
      weeklyXP: 0,
      dailyXP: 0
    });

    // Duplicate username node for easy search and lookup
    await set(ref(db, `usernames/${cleanUsername}`), fbUid);

    await auth.signOut(); // Sign out immediately after signup so they can't log in yet
    setError('Signup successful! Waiting for Approval by Rahee.');
    setLoading(false);
  };

  return (
    <div className={cn(
      "min-h-screen flex items-center justify-center p-6 transition-colors duration-300",
      isDark ? "bg-black" : "bg-white"
    )}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-black/5 dark:bg-white/5 backdrop-blur-2xl p-8 rounded-[3rem] border border-black/5 dark:border-white/10 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-primary rounded-[2.5rem] flex items-center justify-center text-black mb-4 shadow-[0_0_30px_rgba(var(--primary-color),0.3)]">
            <Shield size={40} />
          </div>
          <h1 className="text-3xl font-black text-black dark:text-white tracking-tighter uppercase italic">Rahee Quiz</h1>
          <p className="text-black/40 dark:text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mt-2 leading-none">Secure Arena Access</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-4 text-left font-sans">
            <div>
              <label className="block text-[10px] font-black text-black/40 dark:text-white/40 uppercase mb-2 ml-1 tracking-widest">
                {isLogin ? "Username / Name" : "Full Name"}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white focus:border-primary outline-none transition-all font-bold"
                placeholder={isLogin ? "Enter your Username" : "Enter your Full Name"}
              />
            </div>

            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
              >
                <label className="block text-[10px] font-black text-black/40 dark:text-white/40 uppercase mb-2 ml-1 tracking-widest">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white focus:border-primary outline-none transition-all font-bold"
                  placeholder="Choose a username"
                />
              </motion.div>
            )}

            <div>
              <label className="block text-[10px] font-black text-black/40 dark:text-white/40 uppercase mb-2 ml-1 tracking-widest">Rahee Key</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white focus:border-primary outline-none transition-all font-bold"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="bg-red-500/10 border border-red-500/20 text-red-500 p-4 rounded-2xl text-xs font-black uppercase tracking-widest text-center"
            >
              {error}
            </motion.div>
          )}

          <button
            disabled={loading}
            className="w-full bg-primary text-black font-black p-5 rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-primary/20 uppercase tracking-widest text-xs"
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

        <div className="mt-8 text-center border-t border-white/5 pt-8">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-white/40 hover:text-primary transition-colors text-[10px] font-black uppercase tracking-widest"
          >
            {isLogin ? "Don't have an account? Create one" : "Already have an account? Login"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
