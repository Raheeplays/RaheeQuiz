import React, { useState } from 'react';
import { motion } from 'motion/react';
import { db, auth } from '../firebase/config';
import { ref, set, get } from 'firebase/database';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useUser } from '../contexts/UserContext';
import { User } from '../types';
import { cn } from '../lib/utils';
import { LogIn, UserPlus, Shield } from 'lucide-react';
import { translations } from '../translations';

export default function Auth() {
  const { setCurrentUser } = useUser();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const lang = 'en'; 
  const t = translations[lang];

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name) {
      setError('Please enter your Name');
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

    const cleanName = name.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    const email = `${cleanName}@Rahee.in`;

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
    const newUser: User = {
      id: fbUid,
      name,
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
    await auth.signOut(); // Sign out immediately after signup so they can't log in yet
    setError('Signup successful! Waiting for Approval by Rahee.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--primary-color)_0%,_transparent_100%)] bg-opacity-5">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/10 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 bg-primary rounded-[2.5rem] flex items-center justify-center text-black mb-4 shadow-[0_0_30px_rgba(var(--primary-color),0.3)]">
            <Shield size={40} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tighter">Rahee Quiz</h1>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mt-2">Secure Arena Access</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-primary outline-none transition-all font-bold"
                placeholder={isLogin ? "Enter your Name" : "Choose a Name"}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Rahee Key</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-primary outline-none transition-all font-bold"
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
