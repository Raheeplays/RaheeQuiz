import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase/config';
import { useUser } from '../contexts/UserContext';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Smartphone, Layers, KeyRound, ArrowRight } from 'lucide-react';

interface UpdateBlockerProps {
  children: React.ReactNode;
}

export default function UpdateBlocker({ children }: UpdateBlockerProps) {
  const { currentUser } = useUser();
  const [globalCode, setGlobalCode] = useState<string | null>(null);
  const [globalMessage, setGlobalMessage] = useState<string>('');
  const [globalHelpMessage, setGlobalHelpMessage] = useState<string>('Please Contact Developer Or Admin For More Info');
  const [checkedPathPattern, setCheckedPathPattern] = useState<string>('users/{userId}/AppCode');
  const [customPathOverride, setCustomPathOverride] = useState<string | null>(null);
  const [userAppCode, setUserAppCode] = useState<string | null>(null);
  const [isBypassed, setIsBypassed] = useState(() => localStorage.getItem('__admin_update_bypass_2') === 'true');
  
  // Stealth trigger states
  const [showBypassInput, setShowBypassInput] = useState(false);
  const [bypassPasscode, setBypassPasscode] = useState('');
  const [bypassError, setBypassError] = useState('');
  const [loading, setLoading] = useState(true);

  // Press & Hold Logic
  const [pressProgress, setPressProgress] = useState(0); 
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 1. Subscribe to Global Required Update Node Config
  useEffect(() => {
    const globalUpdateRef = ref(db, 'Update');
    const unsubscribe = onValue(globalUpdateRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setGlobalCode(val.Code !== undefined ? String(val.Code).trim() : null);
        setGlobalMessage(val.Message || "We've added amazing new features and fixed bugs to make your experience even better. Please get the latest version to continue playing.");
        setGlobalHelpMessage(val.HelpMessage || "Please Contact Developer Or Admin For More Info");
        if (val.CheckedPathPattern) {
          setCheckedPathPattern(String(val.CheckedPathPattern).trim());
        } else {
          setCheckedPathPattern('users/{userId}/AppCode');
        }
      } else {
        setGlobalCode(null);
        setCheckedPathPattern('users/{userId}/AppCode');
        setGlobalHelpMessage("Please Contact Developer Or Admin For More Info");
      }
      setLoading(false);
    }, (error) => {
      console.error("Global Update node fetch failed:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Subscribe to individual user's Custom Path override if configured
  useEffect(() => {
    if (!currentUser?.id) {
      setCustomPathOverride(null);
      return;
    }

    const overrideRef = ref(db, `users/${currentUser.id}/CustomAppCodePath`);
    const unsubscribe = onValue(overrideRef, (snapshot) => {
      if (snapshot.exists() && snapshot.val()) {
        setCustomPathOverride(String(snapshot.val()).trim());
      } else {
        setCustomPathOverride(null);
      }
    }, (error) => {
      console.error("User custom path override fetch failed:", error);
    });

    return () => unsubscribe();
  }, [currentUser?.id]);

  // Determine active pattern & final resolved live DB path
  const activePattern = customPathOverride || checkedPathPattern;
  const resolvedPath = currentUser?.id 
    ? activePattern
        .replace(/{userId}/g, currentUser.id)
        .replace(/{deviceUid}/g, currentUser.deviceUid || '')
    : '';

  // 3. Dynamic Realtime Subscription to userAppCode at resolvedPath
  useEffect(() => {
    if (!resolvedPath) {
      setUserAppCode(null);
      return;
    }

    const userAppCodeRef = ref(db, resolvedPath);
    const unsubscribe = onValue(userAppCodeRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setUserAppCode(val !== null ? String(val).trim() : null);
      } else {
        setUserAppCode(null);
      }
    }, (error) => {
      console.error(`AppCode fetch failed at dynamic path [${resolvedPath}]:`, error);
      setUserAppCode(null);
    });

    return () => unsubscribe();
  }, [resolvedPath]);

  // Press & Hold Handler triggers
  const startPress = () => {
    endPress();

    // Start 16s timeout
    pressTimerRef.current = setTimeout(() => {
      setShowBypassInput(true);
      setBypassError('');
      setBypassPasscode('');
      endPress();
    }, 16000);

    // Track state holding progress
    const start = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min((elapsed / 16000) * 100, 100);
      setPressProgress(progress);
    }, 100);
  };

  const endPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setPressProgress(0);
  };

  // Clean timer cleanup on unmount
  useEffect(() => {
    return () => {
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  const handleBypassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = bypassPasscode.trim();
    if (val === '181855') {
      localStorage.setItem('__admin_update_bypass_2', 'true');
      setIsBypassed(true);
      setBypassError('');
      setShowBypassInput(false);
    } else {
      setBypassError('Incorrect bypass code!');
    }
  };

  // If loading global node configuration, wait at entry
  if (loading) {
    return (
      <div className="min-h-screen dark:bg-slate-950 bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#32befa] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="dark:text-slate-400 text-slate-500 font-mono text-[10px] uppercase tracking-widest animate-pulse">Initializing update nodes...</p>
      </div>
    );
  }

  // Determine if update is required
  const isMismatch = globalCode !== null && userAppCode !== globalCode;
  const showBlocker = currentUser && isMismatch && !isBypassed;

  if (showBlocker) {
    // Inhibition on click, context menu and select behavior
    const inhibitionStyles: React.CSSProperties = {
      userSelect: 'none',
      WebkitUserSelect: 'none',
      WebkitTouchCallout: 'none',
      KhtmlUserSelect: 'none',
      MozUserSelect: 'none',
      msUserSelect: 'none',
      touchAction: 'none'
    };

    const pressHandlers = {
      onMouseDown: startPress,
      onMouseUp: endPress,
      onMouseLeave: endPress,
      onTouchStart: startPress,
      onTouchEnd: endPress,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };

    return (
      <div 
        className="fixed inset-0 z-[9999] dark:bg-[#070b13] bg-slate-50 text-slate-900 dark:text-white flex flex-col justify-center items-center p-6 overflow-y-auto select-none antialiased"
        onContextMenu={(e) => e.preventDefault()}
        style={inhibitionStyles}
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm dark:bg-[#0d1527]/90 bg-white border border-slate-200 dark:border-slate-800/80 rounded-[32px] p-8 text-center shadow-2xl relative overflow-hidden flex flex-col items-center"
        >
          {/* Subtle top branding line with color #32befa */}
          <div className="absolute top-0 inset-x-0 h-1.5 bg-[#32befa]"></div>

          {/* Steamy backglow blur */}
          <div className="absolute -top-16 -left-16 w-32 h-32 bg-[#32befa]/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* Clean minimal update indicator (Stealth interactive press area) */}
          <div 
            {...pressHandlers}
            style={inhibitionStyles}
            className="w-16 h-16 dark:bg-[#32befa]/10 bg-[#32befa]/5 text-[#32befa] rounded-full flex items-center justify-center border border-[#32befa]/20 mb-6 relative transition-transform cursor-pointer hover:scale-105 active:scale-95 select-none"
            title="Update Icon"
          >
            <RefreshCw className="w-8 h-8 animate-spin" style={{ animationDuration: '6s' }} />
          </div>

          {/* Update Text header (Stealth hold trigger) */}
          <h3 
            {...pressHandlers}
            style={inhibitionStyles}
            className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white mb-2 leading-none cursor-pointer select-none"
          >
            Update Required
          </h3>

          <p className="text-xs text-slate-550 dark:text-slate-400 font-medium px-2 leading-relaxed mb-6 select-none">
            {globalMessage}
          </p>

          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wide select-none mb-4">
            {globalHelpMessage}
          </p>

          {/* Stealth admin verification passcode modal */}
          <AnimatePresence>
            {showBypassInput && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="w-full mt-6 p-4 dark:bg-[#070b13] bg-slate-100/90 rounded-2xl border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 leading-none">
                    <KeyRound className="w-3.5 h-3.5 text-[#32befa]" />
                    Admin Verification
                  </span>
                  <button 
                    type="button" 
                    onClick={() => {
                      setShowBypassInput(false);
                      setBypassPasscode('');
                      setBypassError('');
                    }}
                    className="text-[9px] font-bold uppercase tracking-wider text-red-500 hover:text-red-400 bg-red-500/10 px-2 py-0.5 rounded"
                  >
                    Cancel
                  </button>
                </div>
                
                <form onSubmit={handleBypassSubmit} className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Enter bypass code"
                      value={bypassPasscode}
                      onChange={(e) => setBypassPasscode(e.target.value)}
                      className="flex-1 min-w-0 bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-[#32befa] font-mono text-center text-slate-900 dark:text-white"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="aspect-square w-9 bg-[#32befa] hover:bg-[#209ecc] text-white rounded-xl flex items-center justify-center font-bold active:scale-95 transition-all"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                  {bypassError && (
                    <p className="text-[10px] font-bold text-red-500 text-left leading-none mt-1">{bypassError}</p>
                  )}
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  return <>{children}</>;
}
