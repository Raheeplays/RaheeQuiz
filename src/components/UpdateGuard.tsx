import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase/config';
import { motion } from 'motion/react';
import { ShieldAlert, Download, Smartphone, RefreshCw, Layers } from 'lucide-react';

interface UpdateGuardProps {
  children: React.ReactNode;
}

// Strictly typed version settings matching RTDB paths
interface VersionState {
  latestVersionCode: string | null;
  userAppCode: string | null;
  loading: boolean;
  error: string | null;
}

export default function UpdateGuard({ children }: UpdateGuardProps) {
  // Extract deviceID dynamically from URL Search Params (?id=)
  const [deviceId, setDeviceId] = useState<string>('');
  const [versions, setVersions] = useState<VersionState>({
    latestVersionCode: null,
    userAppCode: null,
    loading: true,
    error: null,
  });

  // Detect Device ID from Webview URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || params.get('deviceId');
    
    if (id) {
      setDeviceId(id.trim());
    } else {
      // Graceful fallback for browser/development previews to keep it testable.
      // Generates a mock local device ID so developers can interact with the app.
      let mockId = localStorage.getItem('__dev_mock_device_id');
      if (!mockId) {
        mockId = 'DEV_' + Math.random().toString(36).substring(2, 13).toUpperCase();
        localStorage.setItem('__dev_mock_device_id', mockId);
      }
      setDeviceId(mockId);
    }
  }, []);

  useEffect(() => {
    if (!deviceId) return;

    setVersions(prev => ({ ...prev, loading: true, error: null }));

    // Define Realtime Database references
    const latestVersionRef = ref(db, 'SystemSettings/LatestVersionCode');
    const userAppVersionRef = ref(db, `UserDevices/${deviceId}/appCode`);

    // Live listener for Global Required Version Code
    const unsubscribeLatest = onValue(
      latestVersionRef,
      (snapshot) => {
        const val = snapshot.val();
        setVersions(prev => ({
          ...prev,
          latestVersionCode: val !== null ? String(val).trim() : '1',
          loading: prev.userAppCode === null && prev.loading, // Only keep loading if both aren't received yet
        }));
      },
      (err) => {
        console.error('Error fetching SystemSettings/LatestVersionCode:', err);
        setVersions(prev => ({
          ...prev,
          error: 'Database connection failed. Please check network connection.',
          loading: false,
        }));
      }
    );

    // Live listener for specific Device App Code version
    const unsubscribeUser = onValue(
      userAppVersionRef,
      (snapshot) => {
        const val = snapshot.val();
        setVersions(prev => ({
          ...prev,
          userAppCode: val !== null ? String(val).trim() : null,
          loading: false,
        }));
      },
      (err) => {
        console.error(`Error fetching UserDevices/${deviceId}/appCode:`, err);
        setVersions(prev => ({
          ...prev,
          error: 'Failed to authenticate your device version.',
          loading: false,
        }));
      }
    );

    // Dynamic timeout to handle extreme lag without leaving user stranded
    const fallbackTimer = setTimeout(() => {
      setVersions(prev => {
        if (prev.loading) {
          return {
            ...prev,
            loading: false,
            error: 'Database response timed out. Reconnect or try again.',
          };
        }
        return prev;
      });
    }, 8000);

    return () => {
      unsubscribeLatest();
      unsubscribeUser();
      clearTimeout(fallbackTimer);
    };
  }, [deviceId]);

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleDownloadApk = () => {
    // Dynamic or fallback download URL
    window.open('https://github.com', '_blank', 'noopener,noreferrer');
  };

  // 1. Loading State - Sleek minimal splash spinner
  if (versions.loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6 select-none font-sans">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
          <Smartphone className="absolute w-6 h-6 text-emerald-500 animate-pulse" />
        </div>
        <p className="mt-6 text-sm text-slate-400 font-medium tracking-wide animate-pulse">
          Validating Device Authentication & Version...
        </p>
      </div>
    );
  }

  // 2. Error State - Graceful network or database configuration fallback UI
  if (versions.error && !versions.latestVersionCode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6 font-sans">
        <div className="max-w-md w-full bg-slate-900 border border-red-500/20 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent"></div>
          <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-white mb-2">Connection Failure</h2>
          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            {versions.error}
          </p>
          <button
            onClick={handleRefresh}
            className="w-full h-12 bg-red-500 hover:bg-red-600 transition-colors rounded-2xl flex items-center justify-center gap-2 font-medium text-white shadow-lg shadow-red-500/20 active:scale-[0.98] transform"
          >
            <RefreshCw className="w-4 h-4" />
            Retry System Check
          </button>
        </div>
      </div>
    );
  }

  // 3. Comparison Logic
  // Match check: User app version code vs global latest version code.
  // Note: if userAppCode doesn't exist yet for this deviceID, we treat it as mismatch so they update or registers correctly.
  const isMatch = versions.latestVersionCode && versions.userAppCode && 
                  versions.latestVersionCode === versions.userAppCode;

  if (isMatch) {
    // Versions match! Render the main game seamlessly
    return <>{children}</>;
  }

  // 4. Mismatch State - Blur-Glassmorphic Fullscreen Update Overlay Lockout
  const isDeveloperPreview = deviceId.startsWith('DEV_');

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-950 select-none overflow-hidden font-sans p-4">
      {/* Background Ambience Decoration */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>

      {/* Main Glassmorphic Card Overlay */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative max-w-md w-full backdrop-blur-md bg-slate-900/80 border border-slate-800 rounded-[32px] p-8 text-center shadow-2xl overflow-hidden"
      >
        {/* Colorful top bar indicating update status */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 via-amber-500 to-red-500 animate-gradient-x"></div>

        {/* Header Icon */}
        <div className="w-16 h-16 bg-red-500/10 rounded-[22px] flex items-center justify-center mx-auto mb-6 border border-red-500/20">
          <ShieldAlert className="w-8 h-8 text-red-500 animate-bounce" />
        </div>

        {/* Main Banner Heading */}
        <h1 className="text-2xl font-extrabold tracking-tight text-white mb-2">
          Update Required
        </h1>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed max-w-sm mx-auto">
          Your current application version is outdated. To maintain real-time database synchronization and premium gameplay features, please update immediately.
        </p>

        {/* Dynamic Version Badges (Visual Comparison Panel) */}
        <div className="grid grid-cols-2 gap-4 bg-slate-950/60 rounded-3xl p-4 mb-6 border border-slate-800/60 leading-normal">
          <div className="flex flex-col items-center justify-center">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Your Version</span>
            <div className="flex items-center gap-1.5 bg-red-500/10 text-red-400 font-mono text-sm px-3 py-1 rounded-full border border-red-500/20 font-semibold">
              <Smartphone className="w-3.5 h-3.5" />
              {versions.userAppCode || 'Outdated'}
            </div>
          </div>
          <div className="flex flex-col items-center justify-center">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Required</span>
            <div className="flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 font-mono text-sm px-3 py-1 rounded-full border border-emerald-500/20 font-semibold">
              <Layers className="w-3.5 h-3.5" />
              {versions.latestVersionCode || 'Latest'}
            </div>
          </div>
        </div>

        {/* Interactive download action button */}
        <button
          onClick={handleDownloadApk}
          className="w-full h-14 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 transition-all rounded-[18px] flex items-center justify-center gap-2.5 font-bold text-white shadow-lg shadow-red-500/20 active:scale-[0.98] transform mb-4"
        >
          <Download className="w-5 h-5 text-white animate-pulse" />
          Download Latest APK
        </button>

        {/* Real-time Re-check Button */}
        <button
          onClick={handleRefresh}
          className="w-full h-11 bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-755 transition-colors rounded-[16px] flex items-center justify-center gap-2 text-xs font-semibold text-slate-300 active:scale-[0.98] transform"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Re-verify Updates
        </button>

        {/* Extra helper information for Developer previews in AI Studio */}
        {isDeveloperPreview && (
          <div className="mt-6 pt-4 border-t border-slate-800/85 text-left bg-slate-950/40 p-3 rounded-2xl">
            <div className="flex items-center gap-2 mb-1.5 text-orange-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
              </span>
              <p className="text-[11px] font-bold uppercase tracking-wider">Workspace Dev Preview Mode</p>
            </div>
            <p className="text-[10px] text-slate-500 leading-normal">
              Using auto-generated device ID <span className="font-mono text-slate-400 px-1 bg-slate-900 rounded">{deviceId}</span> because no query string <span className="font-mono text-slate-400">?id=</span> was supplied. You can adjust values under <span className="font-mono text-slate-400">UserDevices/{deviceId}/appCode</span> or <span className="font-mono text-slate-400">SystemSettings/LatestVersionCode</span> in Firebase RTDB to test this lock interface.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
