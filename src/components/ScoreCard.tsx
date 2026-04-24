import React from 'react';
import { User } from '../types';
import { motion } from 'motion/react';
import { Trophy, Star, Target, Zap, Award, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface ScoreCardProps {
  user: User;
  onClose?: () => void;
  isAdminView?: boolean;
  totalQuizzesCount?: number;
}

export default function ScoreCard({ user, onClose, isAdminView, totalQuizzesCount = 0 }: ScoreCardProps) {
  // Aggregate stats
  const aggregateStats = Object.values(user.scores || {}).reduce(
    (acc, curr) => {
      acc.correct += curr.correct;
      acc.total += curr.total;
      return acc;
    },
    { correct: 0, total: 0 }
  );

  const incorrect = aggregateStats.total - aggregateStats.correct;
  const unsolved = Math.max(0, totalQuizzesCount - aggregateStats.total);

  const accuracy = aggregateStats.total > 0 
    ? Math.round((aggregateStats.correct / aggregateStats.total) * 100) 
    : 0;

  // Calculate rating (0-5 stars)
  // Logic: 0-20% = 1, 21-40% = 2, 41-60% = 3, 61-80% = 4, 81-100% = 5
  // If total < 5, maybe weight it differently? Let's just use accuracy for now.
  const rating = aggregateStats.total === 0 ? 0 : Math.ceil(accuracy / 20);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl w-full max-w-md mx-auto"
    >
      {/* Header with Background Pattern */}
      <div className="relative p-8 bg-gradient-to-br from-[#32befa]/20 to-transparent overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#32befa]/10 rounded-full blur-3xl" />
        
        <div className="flex justify-between items-start relative z-10">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#32befa] mb-2 block">
              Performance Index
            </span>
            <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase">
              {user.name}
            </h2>
          </div>
          <div className="bg-white/5 backdrop-blur-md p-3 rounded-2xl border border-white/10">
            <Trophy className="text-yellow-500" size={24} />
          </div>
        </div>

        {/* Rating Stars */}
        <div className="flex gap-1 mt-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star 
              key={star}
              size={18}
              className={cn(
                "transition-all duration-500",
                star <= rating ? "text-yellow-400 fill-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.4)]" : "text-white/10"
              )}
            />
          ))}
          <span className="ml-2 text-[10px] font-black text-white/40 self-center uppercase tracking-widest">
            {rating}.0 RATING
          </span>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 p-5 rounded-3xl border border-white/5 hover:border-white/10 transition-colors group">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-[#32befa]/20 rounded-xl text-[#32befa] group-hover:scale-110 transition-transform">
                <Target size={16} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Accuracy</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{accuracy}</span>
              <span className="text-sm font-bold text-white/20">%</span>
            </div>
          </div>

          <div className="bg-white/5 p-5 rounded-3xl border border-white/5 hover:border-white/10 transition-colors group">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-yellow-500/20 rounded-xl text-yellow-500 group-hover:scale-110 transition-transform">
                <Zap size={16} />
              </div>
              <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Total XP</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{user.xp}</span>
              <span className="text-[10px] font-bold text-yellow-500/40 italic">PTS</span>
            </div>
          </div>
        </div>

        {/* Secondary Stats List */}
        <div className="bg-white/5 rounded-3xl border border-white/5 p-6 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={16} className="text-green-500" />
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Correct Answers</span>
            </div>
            <span className="font-black text-green-500">{aggregateStats.correct}</span>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <XCircle size={16} className="text-red-500" />
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Incorrect Answers</span>
            </div>
            <span className="font-black text-red-500">{incorrect}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <HelpCircle size={16} className="text-white/40" />
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">System Questions</span>
            </div>
            <span className="font-black text-white">{totalQuizzesCount}</span>
          </div>

          <div className="flex justify-between items-center border-t border-white/5 pt-4">
            <div className="flex items-center gap-3">
              <Target size={16} className="text-white/20" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Attempted</span>
            </div>
            <span className="font-black text-white/40">{aggregateStats.total} / {totalQuizzesCount}</span>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Award size={16} className="text-[#32befa]" />
              <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Global Rank</span>
            </div>
            <span className="font-black text-white">#{user.rank}</span>
          </div>
        </div>

        {/* Topic Breakdown (Mini) */}
        {Object.entries(user.scores || {}).length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">Topic Mastery</h4>
            <div className="flex flex-wrap gap-2">
              {Object.entries(user.scores || {}).map(([topicId, score]) => (
                <div key={topicId} className="bg-white/5 px-3 py-2 rounded-full border border-white/10 flex items-center gap-2">
                  <span className="text-[9px] font-black text-white/80 uppercase">{topicId}</span>
                  <div className="h-1 w-8 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#32befa]" 
                      style={{ width: `${(score.correct / Math.max(score.total, 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {onClose && (
          <button 
            onClick={onClose}
            className={cn(
              "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all active:scale-95",
              isAdminView 
                ? "bg-white/5 text-white/40 border border-white/10" 
                : "bg-white text-black hover:bg-white/90"
            )}
          >
            {isAdminView ? "Close Stats" : "Back to Rahee Pass"}
          </button>
        )}
      </div>
    </motion.div>
  );
}
