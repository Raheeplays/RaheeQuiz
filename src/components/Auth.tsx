import React, { useState } from 'react';
import { motion } from 'motion/react';
import { db } from '../firebase/config';
import { ref, set, get, push } from 'firebase/database';
import { useUser } from '../contexts/UserContext';
import { User } from '../types';
import { cn } from '../lib/utils';
import { LogIn, UserPlus, Shield } from 'lucide-react';
import { translations } from '../translations';
import { logAdminNotification } from '../activityService';

export default function Auth() {
  const { setCurrentUser, login } = useUser();
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [tempUserMatch, setTempUserMatch] = useState<{ uid: string, user: User } | null>(null);
  const lang = 'en'; 
  const t = translations[lang];

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempUserMatch) return;
    
    if (otpInput === '181855') {
      setError('');
      setLoading(true);
      try {
        await logAdminNotification('login', tempUserMatch.user.name);
        login(tempUserMatch.uid, tempUserMatch.user);
      } catch (err: any) {
        setError('Login failed: ' + err.message);
        setLoading(false);
      }
    } else {
      setError('Wrong OTP verification code. Login Denied!');
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name) {
      setError(isLogin ? 'Please enter your Name or Username' : 'Please enter your Full Name');
      return;
    }
    if (!isLogin && !usernameInput) {
      setError('Please choose a Username');
      return;
    }
    if (!password) {
      setError('Please enter your Rahee Key');
      return;
    }

    const cleanUsername = isLogin 
      ? name.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '')
      : usernameInput.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');

    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        try {
          const usersRef = ref(db, 'users');
          const snapshot = await get(usersRef);
          let userMatch: User | null = null;
          let matchUid = '';

          const inputNameLower = name.trim().toLowerCase();
          if (inputNameLower === 'rahee' && password === 'Rahee786') {
            let adminFound = false;
            if (snapshot.exists()) {
              const usersData = snapshot.val();
              for (const uid of Object.keys(usersData)) {
                const u = usersData[uid];
                if (
                  (u.username && u.username.toLowerCase() === 'rahee') ||
                  (u.name && u.name.toLowerCase() === 'rahee')
                ) {
                  userMatch = u;
                  matchUid = uid;
                  adminFound = true;
                  break;
                }
              }
            }

            if (!adminFound) {
              matchUid = 'admin_rahee';
              userMatch = {
                id: matchUid,
                name: 'Rahee',
                email: 'rahee@Rahee.in',
                username: 'rahee',
                password: 'Rahee786',
                role: 'admin',
                status: 'approved',
                xp: 1000,
                dailyXP: 100,
                weeklyXP: 100,
                rank: 1,
                currentRound: 1,
                currentQuizIndex: 0,
                selectedTopicId: null,
                language: 'en',
                raheeCoins: 1000,
                lifelines: {
                  fiftyFifty: 999,
                  changeQuiz: 999,
                  audiencePoll: 999,
                  hint: 999
                },
                scores: {}
              };
              await set(ref(db, `users/${matchUid}`), userMatch);
            } else if (userMatch && (userMatch.role !== 'admin' || userMatch.password !== 'Rahee786' || userMatch.status !== 'approved')) {
              userMatch.role = 'admin';
              userMatch.password = 'Rahee786';
              userMatch.status = 'approved';
              await set(ref(db, `users/${matchUid}`), userMatch);
            }
          } else {
            if (snapshot.exists()) {
              const usersData = snapshot.val();
              for (const uid of Object.keys(usersData)) {
                const u = usersData[uid];
                if (
                  (u.username && u.username.toLowerCase() === inputNameLower) ||
                  (u.name && u.name.toLowerCase() === inputNameLower)
                ) {
                  userMatch = u;
                  matchUid = uid;
                  break;
                }
              }
            }
          }

          if (!userMatch) {
            setError('User not found. Please sign up or check your spelling.');
            setLoading(false);
            return;
          }

          if (userMatch.password !== password) {
            setError('Incorrect Rahee Key (password).');
            setLoading(false);
            return;
          }

          if (userMatch.role === 'admin' || userMatch.username?.toLowerCase() === 'rahee') {
            setTempUserMatch({ uid: matchUid, user: userMatch });
            setShowOtp(true);
            setLoading(false);
            return;
          }

          if (userMatch.status === 'pending') {
            await logAdminNotification('login', userMatch.name);
            login(matchUid, { ...userMatch, id: matchUid });
            return;
          }
          if (userMatch.status === 'revoked' || userMatch.status === 'banned') {
            setError(`Your account has been ${userMatch.status}. Contact Rahee for help.`);
            setLoading(false);
            return;
          }

          await logAdminNotification('login', userMatch.name);
          login(matchUid, { ...userMatch, id: matchUid });
        } catch (err: any) {
          setError('Login failed: ' + err.message);
        }
      } else {
        try {
          const cleanUsername = usernameInput.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
          if (cleanUsername === 'rahee') {
            setError('The name / username "Rahee" is reserved for the Admin.');
            setLoading(false);
            return;
          }
          const usersRef = ref(db, 'users');
          const snapshot = await get(usersRef);
          
          if (snapshot.exists()) {
            const usersData = snapshot.val();
            const inputNameLower = name.trim().toLowerCase();
            for (const uid of Object.keys(usersData)) {
              const u = usersData[uid];
              if (
                (u.username && u.username.toLowerCase() === cleanUsername) ||
                (u.name && u.name.toLowerCase() === inputNameLower)
              ) {
                setError('Name / Username already taken. Choose another.');
                setLoading(false);
                return;
              }
            }
          }

          const fbUid = `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
          const email = `${cleanUsername}@Rahee.in`;
          await completeSignup(fbUid, email, cleanUsername);
        } catch (err: any) {
          setError('Signup failed: ' + err.message);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed. Please try again.');
    } finally {
      if (error) setLoading(false);
    }
  };

  const completeSignup = async (fbUid: string, email: string, cleanUsername: string) => {
    const newUser: User = {
      id: fbUid,
      name,
      email: email,
      username: cleanUsername,
      password: password,
      role: 'user',
      status: 'pending',
      privacyEnabled: true,
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
        'changeQuiz': 1,
        'audiencePoll': 1,
        'hint': 1
      },
      scores: {}
    };

    await set(ref(db, `users/${fbUid}`), newUser);
    await logAdminNotification('signup', name, cleanUsername);
    login(fbUid, newUser);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 bg-[radial-gradient(circle_at_center,_var(--primary-color)_0%,_transparent_100%)] bg-opacity-5">
      {loading ? (
        <div className="text-center space-y-6">
          <div className="w-24 h-24 bg-primary/20 rounded-[2.5rem] flex items-center justify-center text-primary mx-auto border border-primary/20 animate-pulse">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-black text-white tracking-widest uppercase">Authenticating...</h2>
          <p className="text-white/40 text-[10px] font-mono tracking-widest uppercase">Connecting to Rahee Secure Servers</p>
        </div>
      ) : (
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
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.3em] mt-2">Challenge Your Mind</p>
          </div>

          {showOtp ? (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1 text-center">
                    Enter Admin OTP Verification Code
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white text-center text-3xl tracking-[0.5em] focus:border-primary outline-none transition-all font-black font-mono"
                    placeholder="000000"
                  />
                  <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest text-center mt-3">Enter the 6-digit administrative safety security PIN (OTP)</p>
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
                Verify & Log In
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOtp(false);
                  setOtpInput('');
                  setTempUserMatch(null);
                  setError('');
                }}
                className="w-full bg-white/5 border border-white/10 text-white font-black p-5 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/10 active:scale-[0.98] transition-all uppercase tracking-widest text-xs"
              >
                Cancel
              </button>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">
                    {isLogin ? "Name or Username" : "Full Name"}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white focus:border-primary outline-none transition-all font-bold"
                    placeholder={isLogin ? "Enter your Name or Username" : "Enter your Full Name"}
                  />
                </div>

                {!isLogin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2"
                  >
                    <label className="block text-xs font-bold text-white/40 uppercase mb-2 ml-1">Username</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-black">@</span>
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        className="w-full bg-black border border-white/10 rounded-2xl p-4 pl-10 text-white focus:border-primary outline-none transition-all font-bold"
                        placeholder="choose_username"
                      />
                    </div>
                  </motion.div>
                )}

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
                {isLogin ? (
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
          )}

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
      )}
    </div>
  );
}
