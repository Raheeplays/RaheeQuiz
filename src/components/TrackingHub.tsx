import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue, set, push, remove, update } from 'firebase/database';
import { useUser } from '../contexts/UserContext';
import { useDialog } from '../contexts/DialogContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Activity, 
  Database, 
  Plus, 
  Trash2, 
  Edit2, 
  X, 
  Settings, 
  Compass, 
  ListFilter,
  Check,
  RotateCcw,
  RefreshCw,
  Eye,
  Sliders,
  ChevronRight,
  Sparkles
} from 'lucide-react';

const REAL_TIME_FALLBACK_NAMES = [
  "settings/gameSessionTimeLimit",
  "settings/triviaRoundSize",
  "settings/multiplier",
  "settings/defaultThemeLuxThreshold",
  "settings/matchMakingTimeout",
  "counters/totalUsers",
  "counters/totalMatches",
  "quizTimer/countdownDuration"
];

const PRESET_COLORS = [
  '#a855f7', // Purple
  '#32befa', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
];

// Sub-component to bind to a specific real-time Firebase RTDB node and showcase a gorgeous circular progress ring.
const RtdbLiveCircularNode = ({ 
  config, 
  onEdit, 
  onDelete, 
  isAdmin 
}: { 
  config: any; 
  onEdit: (c: any) => void; 
  onDelete: (id: string) => void; 
  isAdmin: boolean;
  key?: string;
}) => {
  const [liveValue, setLiveValue] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const nodeRef = ref(db, config.path);
      const unsubscribe = onValue(nodeRef, (snapshot) => {
        setLiveValue(snapshot.exists() ? snapshot.val() : null);
        setLoading(false);
      }, (err) => {
        console.error("Error reading RTDB path in circular progress live node:", config.path, err);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Subscription validation error:", e);
      setLoading(false);
    }
  }, [config.path]);

  // Handle various states of the live value for computing and display
  const maxExpected = config.maxExpectedVal ? Number(config.maxExpectedVal) : 100;
  const isNumeric = typeof liveValue === 'number' || (typeof liveValue === 'string' && !isNaN(Number(liveValue)) && liveValue.trim() !== '');
  const numericVal = isNumeric ? Number(liveValue) : 0;
  
  let stringRep = 'N/A';
  if (liveValue !== null && liveValue !== undefined) {
    if (typeof liveValue === 'object') {
      stringRep = 'Object 📦';
    } else if (typeof liveValue === 'boolean') {
      stringRep = liveValue ? 'True' : 'False';
    } else {
      stringRep = String(liveValue);
    }
  }

  // Ring properties
  const radius = 38;
  const strokeCircumference = 2 * Math.PI * radius; // Outer circle circumference: ~238.76
  const percentage = Math.min(Math.max((numericVal / maxExpected) * 100, 0), 100);
  const strokeDashoffset = isNumeric 
    ? strokeCircumference - (strokeCircumference * percentage) / 100 
    : (liveValue === true || liveValue === 'true') 
      ? 0 
      : strokeCircumference;

  const colorHex = config.color || '#32befa';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ duration: 0.25 }}
      className="bg-white dark:bg-[#111] border border-black/5 dark:border-white/5 p-6 rounded-[2rem] shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 relative group transition-all"
    >
      {/* Absolute badge floating or hover edit details */}
      {isAdmin && (
        <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10">
          <button
            onClick={() => onEdit(config)}
            className="p-2 bg-neutral-150 dark:bg-zinc-800 text-neutral-500 hover:text-primary rounded-xl transition-all"
            title="Edit Visual Node"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => onDelete(config.id)}
            className="p-2 bg-neutral-150 dark:bg-zinc-800 text-neutral-500 hover:text-red-500 rounded-xl transition-all"
            title="Delete Visual Node"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      {/* Circle Animation Panel */}
      <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
        <svg className="absolute inset-0 w-full h-full -rotate-90 select-none pointer-events-none" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="currentColor"
            strokeWidth="5.5"
            className="text-neutral-100 dark:text-neutral-900"
            fill="transparent"
          />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            stroke={colorHex}
            strokeWidth="5.5"
            fill="transparent"
            strokeDasharray={strokeCircumference}
            animate={{ strokeDashoffset }}
            transition={{ type: "spring", stiffness: 45, damping: 12 }}
            strokeLinecap="round"
          />
        </svg>

        {/* update animation flash */}
        <motion.div 
          key={stringRep}
          initial={{ scale: 0.95, opacity: 0.4 }}
          animate={{ scale: 1.05, opacity: 0 }}
          transition={{ duration: 0.6 }}
          style={{ borderColor: colorHex }}
          className="absolute inset-2 border border-dashed rounded-full pointer-events-none"
        />

        {/* Central Display */}
        <div className="flex flex-col items-center justify-center px-1 text-center z-10 max-w-[80px] overflow-hidden">
          <span className="text-[7.5px] font-mono uppercase tracking-widest text-neutral-400 font-black">
            Value
          </span>
          <span 
            className="text-xs sm:text-sm font-black tracking-tight text-neutral-850 dark:text-white truncate max-w-full font-mono mt-0.5"
            title={stringRep}
          >
            {loading ? '...' : stringRep}
          </span>
          {isNumeric && (
            <span className="text-[8px] font-mono text-neutral-400 dark:text-neutral-500 font-bold mt-0.5">
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      </div>

      {/* Details Stack on Right - Responsive alignment */}
      <div className="flex-1 text-center md:text-left min-w-0 space-y-2 w-full">
        <div className="space-y-0.5">
          <span className="text-[8px] font-black uppercase text-neutral-400 tracking-widest block font-sans">
            Path Node Visualizer
          </span>
          <h4 className="text-sm font-black uppercase text-neutral-850 dark:text-white tracking-tight truncate font-sans">
            {config.label || 'Unnamed Node'}
          </h4>
        </div>

        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
          <span 
            title={config.path}
            className="text-[8.5px] font-mono font-bold text-neutral-500 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 rounded-xl uppercase tracking-tight select-all truncate max-w-full"
          >
            /{config.path}
          </span>
          {isNumeric && (
            <span className="text-[7.5px] font-mono bg-neutral-100 dark:bg-neutral-900 border border-black/5 dark:border-white/5 font-bold px-2 py-1.5 rounded-xl text-neutral-500 dark:text-neutral-400">
              MAX: {maxExpected}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default function TrackingHub({ onClose }: { onClose?: () => void }) {
  const { currentUser } = useUser();
  const { alert, confirm } = useDialog();

  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // States for CRUD popup/sheet configuration
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');
  const [activeId, setActiveId] = useState<string | null>(null);

  // Form Fields
  const [fPath, setFPath] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fColor, setFColor] = useState('#32befa');
  const [fMaxExpected, setFMaxExpected] = useState('100');

  // Load registered path visualizers from Firebase database
  useEffect(() => {
    try {
      const parentRef = ref(db, 'adminCustomGridConfigs');
      const unsubscribe = onValue(parentRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const items = Object.entries(val).map(([id, node]: any) => ({
            id,
            ...node
          }));
          setConfigs(items);
        } else {
          // Preset default metrics so the dashboard always has a gorgeous, functional pre-filled starting point
          const defaults = {
            default_game_timer: {
              path: 'settings/gameSessionTimeLimit',
              label: 'Quiz Session duration',
              color: '#a855f7',
              maxExpectedVal: 120
            },
            default_trivia_size: {
              path: 'settings/triviaRoundSize',
              label: 'Questions Per Set',
              color: '#32befa',
              maxExpectedVal: 20
            },
            default_multiplier: {
              path: 'settings/multiplier',
              label: 'Global Coin Multiplier',
              color: '#10b981',
              maxExpectedVal: 5
            },
            default_lux_threshold: {
              path: 'settings/defaultThemeLuxThreshold',
              label: 'Ambient Auto Light Auto Threshold',
              color: '#f59e0b',
              maxExpectedVal: 1000
            }
          };
          set(parentRef, defaults);
        }
        setLoading(false);
      }, (err) => {
        console.error("RTDB custom configurations fetch error:", err);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, []);

  const isAdmin = currentUser?.role === 'admin';

  const handleStartAdd = () => {
    setEditorMode('add');
    setActiveId(null);
    setFPath('');
    setFLabel('');
    setFColor('#32befa');
    setFMaxExpected('100');
    setIsEditorOpen(true);
  };

  const handleStartEdit = (config: any) => {
    setEditorMode('edit');
    setActiveId(config.id);
    setFPath(config.path);
    setFLabel(config.label);
    setFColor(config.color || '#32befa');
    setFMaxExpected(String(config.maxExpectedVal || 100));
    setIsEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    const isConfirmed = await confirm({
      title: "Delete Node Tracker",
      description: "Are you certain you want to remove this database path visualizer? This action will immediately remove it from all user dashboards."
    });
    if (!isConfirmed) return;

    try {
      await remove(ref(db, `adminCustomGridConfigs/${id}`));
      await alert({
        title: "Tracker Removed",
        description: "The dynamic database path visualizer was gracefully deleted.",
        type: "success"
      });
    } catch (err: any) {
      await alert({
        title: "Deletion Failed",
        description: err.message,
        type: "error"
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fPath.trim() || !fLabel.trim()) {
      await alert({
        title: "Validation Error",
        description: "Database path node and custom descriptive label cannot be empty.",
        type: "error"
      });
      return;
    }

    // Clean leading/trailing slashes in route paths for safety
    const cleanPath = fPath.trim().replace(/^\/+/g, '').replace(/\/+$/g, '');

    const targetConfigObj = {
      path: cleanPath,
      label: fLabel.trim(),
      color: fColor,
      maxExpectedVal: Number(fMaxExpected) || 100
    };

    try {
      if (editorMode === 'add') {
        const createRef = push(ref(db, 'adminCustomGridConfigs'));
        await set(createRef, targetConfigObj);
        await alert({
          title: "Tracker Registered",
          description: `Custom node path "${cleanPath}" successfully registered for live circular status tracking.`,
          type: "success"
        });
      } else if (activeId) {
        await update(ref(db, `adminCustomGridConfigs/${activeId}`), targetConfigObj);
        await alert({
          title: "Tracker Saved",
          description: `Successfully modified properties for "${fLabel}".`,
          type: "success"
        });
      }
      setIsEditorOpen(false);
    } catch (err: any) {
      await alert({
        title: "Save Failed",
        description: err.message,
        type: "error"
      });
    }
  };

  return (
    <div className="w-full min-h-screen bg-slate-50 dark:bg-[#08080c] px-4 py-8 sm:px-6 md:px-8 space-y-8 animate-fade-in pb-28">
      
      {onClose && (
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary hover:text-[#32befa] transition-colors bg-white dark:bg-zinc-900 px-4 py-2.5 rounded-2xl shadow-sm border border-black/5 dark:border-white/5 cursor-pointer self-start animate-fade-in"
        >
          <span>←</span> <span>Back to Home</span>
        </button>
      )}

      {/* Banner / Header visual Section */}
      <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 border-b border-zinc-200 dark:border-zinc-800 pb-6">
        <div className="text-center md:text-left space-y-1 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#32befa]/10 dark:bg-[#32befa]/5 border border-[#32befa]/20 rounded-full text-primary">
            <Activity size={12} className="animate-pulse" />
            <span className="text-[9px] font-black uppercase tracking-wider font-mono">
              Live Real-Time Monitoring
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter text-neutral-900 dark:text-neutral-50 font-sans mt-1">
            System Grid Tracking Engine
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium leading-relaxed">
            A comprehensive tracking visualizer monitoring database node values in real time through animated circular indicators. Admin users can seamlessly modify target paths and display names on the fly.
          </p>
        </div>

        {/* Trigger addition button for Admins */}
        {isAdmin && (
          <button
            onClick={handleStartAdd}
            className="flex items-center justify-center gap-2 px-5 py-3.5 bg-primary hover:bg-opacity-90 text-black dark:text-[#050505] rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all w-full md:w-auto mt-2 shrink-0 cursor-pointer"
          >
            <Plus size={14} strokeWidth={3} />
            <span>Add Live Node</span>
          </button>
        )}
      </div>

      {/* Grid of live circular tracking elements */}
      {loading ? (
        <div className="py-24 text-center space-y-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
            Establishing WebSockets Database Connection...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
          <AnimatePresence mode="popLayout">
            {configs.map((config) => (
              <RtdbLiveCircularNode 
                key={`circular-node-${config.id}`}
                config={config}
                onEdit={handleStartEdit}
                onDelete={handleDelete}
                isAdmin={isAdmin}
              />
            ))}
          </AnimatePresence>

          {configs.length === 0 && (
            <div className="col-span-full py-20 text-center bg-white dark:bg-[#111] border border-dashed border-zinc-200 dark:border-zinc-800 rounded-[2.5rem] p-12">
              <Database size={44} className="mx-auto select-none opacity-20 text-[#32befa] mb-3 animate-bounce" />
              <p className="text-xs font-black uppercase tracking-widest text-neutral-500">
                Zero custom circular visual tracking nodes registered.
              </p>
              {isAdmin && (
                <button
                  onClick={handleStartAdd}
                  className="mt-4 text-[10px] font-black uppercase px-4 py-2 bg-primary text-black rounded-xl cursor-pointer"
                >
                  Create Pre-seeded Configurations
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Editor Modal Sheet for interactive administration */}
      <AnimatePresence>
        {isEditorOpen && isAdmin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
              onClick={() => setIsEditorOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-[#0f0f15] border border-black/10 dark:border-white/10 rounded-[2.5rem] w-full max-w-md p-8 relative z-10 text-left space-y-6 text-neutral-900 dark:text-neutral-50 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
                <div>
                  <div className="flex items-center gap-1.5 text-primary">
                    <Settings size={13} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Database Schema Admin
                    </span>
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-50 mt-1 font-sans">
                    {editorMode === 'add' ? 'Setup Dynamic Node' : 'Edit Live Properties'}
                  </h3>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="p-2 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-400 hover:text-red-500 rounded-full transition-all cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#a855f7] block ml-1 font-sans">
                    Realtime Firebase DB Path node
                  </label>
                  <div className="flex items-center gap-2 bg-neutral-100 dark:bg-black p-3.5 rounded-2xl border border-black/5 dark:border-white/5 font-mono">
                    <span className="text-xs text-neutral-400 font-bold select-none">/</span>
                    <input 
                      type="text"
                      value={fPath}
                      onChange={(e) => setFPath(e.target.value)}
                      placeholder="settings/gameSessionTimeLimit"
                      className="bg-transparent outline-none flex-1 font-mono text-neutral-850 dark:text-neutral-50 border-0 p-0 focus:ring-0 text-xs"
                      required
                    />
                  </div>
                  <p className="text-[8px] text-neutral-400 ml-1 font-semibold italic">
                    Type database key address, e.g. "counters/totalMatches" or "settings/multiplier"
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest text-[#32befa] block ml-1 font-sans">
                    Custom Display Name
                  </label>
                  <input 
                    type="text"
                    value={fLabel}
                    onChange={(e) => setFLabel(e.target.value)}
                    placeholder="e.g. Current Time Limit"
                    className="w-full text-xs p-3.5 bg-neutral-100 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl font-bold text-neutral-850 dark:text-neutral-50 placeholder-neutral-400 outline-none focus:border-primary/50 transition-all font-sans"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[#10b981] block ml-1 font-sans">
                      Progress Max Value
                    </label>
                    <input 
                      type="number"
                      value={fMaxExpected}
                      onChange={(e) => setFMaxExpected(e.target.value)}
                      placeholder="100"
                      min="1"
                      className="w-full text-xs p-3.5 bg-neutral-100 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl font-bold text-neutral-850 dark:text-neutral-50 placeholder-neutral-400 outline-none focus:border-primary/50 transition-all font-mono"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[#f59e0b] block ml-1 font-sans">
                      Circle Ring Color
                    </label>
                    <div className="flex items-center gap-1.5 p-3.5 bg-neutral-100 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl">
                      <input 
                        type="color"
                        value={fColor}
                        onChange={(e) => setFColor(e.target.value)}
                        className="w-7 h-7 rounded border-0 outline-none cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={fColor.toUpperCase()}
                        onChange={(e) => setFColor(e.target.value)}
                        placeholder="#32BEFA"
                        className="bg-transparent outline-none flex-1 font-mono text-neutral-850 dark:text-neutral-50 border-0 p-0 focus:ring-0 text-xs w-full uppercase"
                        maxLength={7}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
                  <span className="text-[7.5px] font-black uppercase tracking-widest text-primary block">Color Swatches</span>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFColor(color)}
                        style={{ backgroundColor: color }}
                        className={cn(
                          "w-5 h-5 rounded-full transition-shadow cursor-pointer border border-white/20",
                          fColor === color ? "ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-black" : ""
                        )}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-4.5 bg-primary hover:bg-opacity-90 text-black dark:text-[#020202] rounded-2xl font-black text-[10.5px] uppercase tracking-widest cursor-pointer hover:scale-[1.01] transition-transform duration-150"
                  >
                    {editorMode === 'add' ? 'Add Visualization' : 'Save Config Transformations'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
