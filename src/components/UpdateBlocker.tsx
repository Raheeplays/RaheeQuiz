import React, { useState, useEffect } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase/config';
import { useUser } from '../contexts/UserContext';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Download, Smartphone, Layers, ShieldCheck, KeyRound, ArrowRight, Check } from 'lucide-react';

interface UpdateBlockerProps {
  children: React.ReactNode;
}

export default function UpdateBlocker({ children }: UpdateBlockerProps) {
  const { currentUser } = useUser();
  const [globalCode, setGlobalCode] = useState<string | null>(null);
  const [globalUrl, setGlobalUrl] = useState<string>('');
  const [globalMessage, setGlobalMessage] = useState<string>('');
  const [checkedPathPattern, setCheckedPathPattern] = useState<string>('users/{userId}/AppCode');
  const [customPathOverride, setCustomPathOverride] = useState<string | null>(null);
  const [userAppCode, setUserAppCode] = useState<string | null>(null);
  const [isBypassed, setIsBypassed] = useState(() => localStorage.getItem('__admin_update_bypass_2') === 'true');
  const [showBypassInput, setShowBypassInput] = useState(false);
  const [bypassPasscode, setBypassPasscode] = useState('');
  const [bypassError, setBypassError] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [loading, setLoading] = useState(true);

  // 1. Subscribe to Global Required Update Node Config
  useEffect(() => {
    const globalUpdateRef = ref(db, 'Update');
    const unsubscribe = onValue(globalUpdateRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setGlobalCode(val.Code !== undefined ? String(val.Code).trim() : null);
        setGlobalUrl(val.Url || '');
        setGlobalMessage(val.Message || "We've added amazing new features and fixed bugs to make your experience even better. Please get the latest version to continue playing.");
        if (val.CheckedPathPattern) {
          setCheckedPathPattern(String(val.CheckedPathPattern).trim());
        } else {
          setCheckedPathPattern('users/{userId}/AppCode');
        }
      } else {
        setGlobalCode(null);
        setCheckedPathPattern('users/{userId}/AppCode');
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
    ? activePattern.replace(/{userId}/g, currentUser.id)
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

  // Handle instant sync/pairing option directly at the dynamically resolved path
  const handleInstantLink = async () => {
    if (!currentUser?.id || !globalCode || !resolvedPath) return;
    setIsLinking(true);
    try {
      // Dynamic set directly to whichever node path is configuration-binding (even outside users node)
      const updates: any = {};
      updates[resolvedPath] = globalCode;
      await update(ref(db), updates);
    } catch (err) {
      console.error("Failed to link AppCode instantly at path:", resolvedPath, err);
    } finally {
      setIsLinking(false);
    }
  };

  const handleBypassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = bypassPasscode.trim().toLowerCase();
    if (['admin', '786', 'sketchware', 'rahee', 'bypass', 'raheex'].includes(val)) {
      localStorage.setItem('__admin_update_bypass_2', 'true');
      setIsBypassed(true);
      setBypassError('');
    } else {
      setBypassError('Invalid Passcode! Try "admin", "786" or "rahee"');
    }
  };

  const handleDownload = () => {
    if (globalUrl) {
      window.open(globalUrl, '_blank');
    } else {
      window.open('https://github.com', '_blank');
    }
  };

  // If loading global node configuration, wait at entry
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 font-mono text-[10px] uppercase tracking-widest animate-pulse">Initializing update nodes...</p>
      </div>
    );
  }

  // Determine if update is required
  const isMismatch = globalCode !== null && userAppCode !== globalCode;
  const showBlocker = currentUser && isMismatch && !isBypassed;

  if (showBlocker) {
    return (
      <div className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col justify-center items-center p-4 overflow-y-auto font-sans select-none antialiased">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm bg-slate-900 border border-slate-800/80 rounded-[32px] p-6 text-center shadow-2xl relative overflow-hidden flex flex-col items-center"
        >
          {/* Top aesthetic flare */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500"></div>

          {/* Glowing Warning Orb */}
          <div className="w-14 h-14 bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center border border-amber-500/20 mb-4 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
            <AlertTriangle className="w-8 h-8 animate-bounce" />
          </div>

          <h3 className="text-xl font-black uppercase tracking-tight text-white mb-2 leading-none">
            Update Required!
          </h3>
          <p className="text-xs text-slate-400 font-medium px-2 leading-relaxed mb-6">
            {globalMessage}
          </p>

          {/* Interactive Dual Badges Comparison Dashboard */}
          <div className="w-full grid grid-cols-2 gap-3 bg-slate-950/60 rounded-3xl p-4 border border-slate-800/60 mb-5 text-left">
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Your AppCode</span>
              <div className={`flex items-center gap-1.5 font-mono text-xs px-2.5 py-1.5 rounded-full border font-bold ${userAppCode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'}`}>
                <Smartphone className="w-3.5 h-3.5" />
                <span className="truncate max-w-[90px]">{userAppCode !== null ? `"${userAppCode}"` : 'Null (Missing)'}</span>
              </div>
            </div>
            <div>
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-1">Required Code</span>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 font-mono text-xs px-2.5 py-1.5 rounded-full border border-emerald-500/20 font-bold">
                <Layers className="w-3.5 h-3.5" />
                <span className="truncate max-w-[90px]">"{globalCode}"</span>
              </div>
            </div>
          </div>

          {/* Live Debug Paths */}
          <div className="w-full text-[10px] text-slate-500 bg-slate-950/40 p-3.5 rounded-2xl border border-slate-900 mb-6 text-left leading-relaxed">
            <p className="font-bold text-slate-400 flex items-center gap-1.5 mb-2 text-[11px]">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              Live Validation Paths:
            </p>
            <div className="space-y-1 font-mono text-[9px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Server node Required Code:</span>
                <span className="text-emerald-400">Update/Code</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Active Dynamic Path Pattern:</span>
                <span className="text-blue-400 truncate max-w-[140px]" title={activePattern}>{activePattern}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 shrink-0">Your Resolved Live Node:</span>
                <span className="text-red-400 truncate max-w-[140px]" title={resolvedPath}>{resolvedPath}</span>
              </div>
            </div>
          </div>

          {/* Instant Pairing Creator (Convenience for testing in-app or transferring) */}
          <div className="w-full mb-6">
            <button
              onClick={handleInstantLink}
              disabled={isLinking}
              className="w-full h-11 bg-indigo-650 hover:bg-indigo-500 disabled:bg-indigo-900 border border-indigo-500/20 text-white rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase tracking-widest transition-all hover:scale-[1.01] active:scale-95"
            >
              {isLinking ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              {isLinking ? 'Pairing Account...' : 'Link My Account AppCode Now'}
            </button>
            <p className="text-[10px] text-slate-500 mt-1.5 max-w-xs mx-auto leading-normal">
              Clicking above will instantly write <code className="text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded font-mono">"{globalCode}"</code> into your user node in Realtime DB to let you bypass instantly.
            </p>
          </div>

          {/* Download Action button */}
          <button
            onClick={handleDownload}
            className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-[20px] font-black uppercase tracking-wider text-xs transition-transform flex items-center justify-center gap-2 active:scale-95 mb-4 shadow-lg shadow-orange-500/10"
          >
            <Download className="w-4.5 h-4.5" />
            Download APK Update
          </button>

          {/* Backdoor Bypass for Admin */}
          <div className="w-full mt-2">
            {!showBypassInput ? (
              <button 
                onClick={() => {
                  setShowBypassInput(true);
                  setBypassError('');
                }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 flex items-center justify-center gap-1 mx-auto transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Admin Bypass Access
              </button>
            ) : (
              <form onSubmit={handleBypassSubmit} className="space-y-2.5 p-3.5 bg-slate-950/40 rounded-2xl border border-slate-900">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Enter Admin Passcode</span>
                  <button 
                    type="button" 
                    onClick={() => setShowBypassInput(false)}
                    className="text-[9px] font-black uppercase tracking-widest text-red-500"
                  >
                    Close
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="e.g. admin"
                    value={bypassPasscode}
                    onChange={(e) => setBypassPasscode(e.target.value)}
                    className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-amber-500 font-mono text-center"
                  />
                  <button
                    type="submit"
                    className="aspect-square w-9 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl flex items-center justify-center font-bold active:scale-95"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
                {bypassError && (
                  <p className="text-[9px] font-bold text-red-400 leading-none">{bypassError}</p>
                )}
              </form>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // Otherwise, render full viewport game contents
  return <>{children}</>;
}
