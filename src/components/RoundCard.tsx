import React from 'react';
import { motion } from 'motion/react';
import { Trophy, Star, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface RoundCardProps {
  round: number;
  correctCount: number;
  incorrectCount: number;
  total: number;
  onNext: () => void;
}

export default function RoundCard({ round, correctCount, incorrectCount, total, onNext }: RoundCardProps) {
  const accuracy = (correctCount / total) * 100;
  
  // Calculate star rating (0 to 5)
  const getRating = () => {
    if (accuracy === 100) return 5;
    if (accuracy >= 80) return 4;
    if (accuracy >= 60) return 3;
    if (accuracy >= 40) return 2;
    if (accuracy >= 20) return 1;
    return 0;
  };

  const rating = getRating();

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="w-full max-w-sm bg-white dark:bg-[#0a0a0a] rounded-[2.5rem] border border-black/5 dark:border-white/5 p-8 shadow-2xl relative overflow-hidden"
    >
      {/* Background Glow */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-primary/20 blur-[80px] rounded-full" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-primary/10 blur-[80px] rounded-full" />

      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6 shadow-sm border border-primary/20">
          <Trophy size={40} />
        </div>

        <h2 className="text-sm font-black text-primary uppercase tracking-widest mb-1">Round {round} Complete</h2>
        <h3 className="text-3xl font-black mb-6 tracking-tighter">Excellent Effort!</h3>

        {/* Stars */}
        <div className="flex gap-1 mb-8">
          {[1, 2, 3, 4, 5].map((s) => (
            <motion.div
              key={s}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 * s }}
            >
              <Star 
                size={32} 
                className={cn(
                  "transition-all",
                  s <= rating ? "fill-yellow-400 text-yellow-400" : "text-black/10 dark:text-white/10"
                )} 
              />
            </motion.div>
          ))}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 w-full mb-8">
          <div className="bg-green-500/5 dark:bg-green-500/10 border border-green-500/10 p-4 rounded-3xl">
            <div className="flex items-center justify-center gap-2 mb-1">
              <CheckCircle2 size={14} className="text-green-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-green-500/60">Correct</span>
            </div>
            <p className="text-2xl font-black text-green-500">{correctCount}</p>
          </div>

          <div className="bg-red-500/5 dark:bg-red-500/10 border border-red-500/10 p-4 rounded-3xl">
            <div className="flex items-center justify-center gap-2 mb-1">
              <XCircle size={14} className="text-red-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-red-500/60">Incorrect</span>
            </div>
            <p className="text-2xl font-black text-red-500">{incorrectCount}</p>
          </div>
        </div>

        <div className="w-full bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-3xl p-4 mb-8 flex justify-between items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Performance</span>
            <span className="text-sm font-black text-primary">{Math.round(accuracy)}% Accuracy</span>
        </div>

        <button
          onClick={onNext}
          className="w-full bg-primary text-black font-black py-5 rounded-[2rem] uppercase tracking-widest text-[11px] shadow-[0_10px_30px_rgba(var(--primary-rgb),0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
        >
          Proceed to Round {round + 1}
          <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </motion.div>
  );
}
