import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trophy, Star, Clock, Home, RotateCcw, MessageCircle, AlertTriangle, Award, FileDown, Download } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useDialog } from '../contexts/DialogContext';
import { db } from '../firebase/config';
import { ref, set, onValue } from 'firebase/database';
import { QuizHistory, Quiz } from '../types';
import { cn } from '../lib/utils';
import { generateCertificate } from '../utils/certificate';
import { downloadAnswerSheetPDF } from '../utils/quizDownload';

interface WinnerLoserScreenProps {
  history: QuizHistory[];
  onClose: () => void;
  total?: number;
  topicId?: string;
  quizzes?: Quiz[];
}

function getTopicName(topicId: string, topicsData: any): string {
  if (!topicsData) return 'Unknown Topic';
  if (topicsData[topicId]) return topicsData[topicId].name;
  for (const key in topicsData) {
    if (topicsData[key].children) {
      const found = getTopicName(topicId, topicsData[key].children);
      if (found !== 'Unknown Topic') return found;
    }
  }
  return topicId === 'general' ? 'General Knowledge' : 'Unknown Topic';
}

export default function WinnerLoserScreen({ history, onClose, total, topicId, quizzes }: WinnerLoserScreenProps) {
  const { currentUser } = useUser();
  const { alert } = useDialog();
  const [seconds, setSeconds] = useState(86400); // 24 hours
  const [topics, setTopics] = useState<any>(null);
  
  const correctCount = history.filter(h => h.isCorrect).length;
  const totalCount = total || quizzes?.length || 10; 
  const scorePercentage = (correctCount / totalCount) * 100;
  
  const stars = Math.max(1, Math.min(5, Math.ceil(scorePercentage / 20)));

  useEffect(() => {
    const unsub = onValue(ref(db, 'topics'), (snapshot) => {
      if (snapshot.exists()) {
        setTopics(snapshot.val());
      }
    });

    const interval = setInterval(() => {
      setSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleRequestMore = async () => {
    if (!currentUser) return;
    await set(ref(db, `users/${currentUser.id}/extraTriesRequested`), true);
    await alert({
      title: "Request Sent",
      description: "Request sent to Rahee! Please wait for approval to get extra tries.",
      type: 'success'
    });
  };

  const resolvedTopicName = topicId ? getTopicName(topicId, topics) : 'General Knowledge';

  const handleDownloadCertificate = () => {
    if (!currentUser) return;
    generateCertificate({
      userName: currentUser.name || 'Player',
      score: correctCount,
      total: totalCount,
      date: new Date().toLocaleDateString(),
      topicName: resolvedTopicName,
      certificateColor: '#32befa'
    });
  };

  const handleDownloadAnswerSheet = () => {
    if (!currentUser || !quizzes) return;
    const results = {
      score: correctCount,
      total: totalCount,
      completedAt: Date.now(),
      answers: history.map(h => ({
        quizId: h.quizId,
        userAnswerIndex: h.userAnswerIndex,
        isCorrect: h.isCorrect
      }))
    };
    downloadAnswerSheetPDF({
      eventTitle: 'Rahee Quiz Battle',
      topicName: resolvedTopicName,
      quizzes,
      candidateName: currentUser.name || 'Player',
      results
    });
  };

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col items-center justify-center p-8 overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
         {/* Simple Particle Effect or Glow */}
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#32befa]/20 blur-[120px] rounded-full" />
      </div>

      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative text-center w-full max-w-md"
      >
        <div className="w-32 h-32 bg-[#32befa] rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_50px_rgba(50,190,250,0.4)]">
           <Trophy size={64} className="text-black" />
        </div>

        <h1 className="text-4xl font-black text-white mb-2 leading-none uppercase tracking-tighter">
          QUIZ COMPLETED
        </h1>
        <p className="text-white/40 font-bold mb-8 uppercase tracking-widest">Global Ranking Results</p>

        <div className="flex justify-center gap-2 mb-12">
          {[1,2,3,4,5].map(s => (
            <motion.div
              key={`winner-star-${s}`}
              initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 + (s * 0.1) }}
            >
               <Star 
                 size={40} 
                 fill={s <= stars ? "#32befa" : "none"} 
                 className={cn(s <= stars ? "text-[#32befa]" : "text-white/10")} 
               />
            </motion.div>
          ))}
        </div>

        <div className="bg-[#111] border border-white/5 p-8 rounded-[2.5rem] mb-8 space-y-6">
           <div className="flex justify-between">
              <span className="text-white/40 font-bold uppercase tracking-widest text-xs">Correct Quizzes</span>
              <span className="font-black text-white">{correctCount} / {totalCount}</span>
           </div>
           <div className="flex justify-between">
              <span className="text-white/40 font-bold uppercase tracking-widest text-xs">Performance</span>
              <span className="font-black text-[#32befa]">{scorePercentage.toFixed(1)}%</span>
           </div>
           <div className="flex items-center gap-3 pt-6 border-t border-white/5 justify-center">
              <Clock className="text-white/20" size={16} />
              <span className="text-white/40 font-bold uppercase tracking-widest text-xs">Next play in:</span>
              <span className="font-black text-white">{formatTime(seconds)}</span>
           </div>
        </div>

        {/* Document Downloads Section */}
        <div className="bg-[#111] border border-[#32befa]/20 p-5 rounded-[2rem] mb-6 text-left space-y-3 shadow-[0_0_20px_rgba(50,190,250,0.05)]">
          <p className="text-[#32befa] text-[10px] font-black uppercase tracking-[0.2em] px-1">
            Score Verification Docs
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={handleDownloadCertificate}
              className="flex-1 bg-white/5 hover:bg-[#32befa]/20 hover:text-white border border-white/5 hover:border-[#32befa]/40 text-white text-[11px] font-black tracking-wider py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Award size={15} className="text-[#32befa]" />
              GET CERTIFICATE
            </button>
            <button
              onClick={handleDownloadAnswerSheet}
              className="flex-1 bg-white/5 hover:bg-emerald-500/20 hover:text-white border border-white/5 hover:border-emerald-500/40 text-white text-[11px] font-black tracking-wider py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 animate-pulse"
            >
              <Download size={15} className="text-emerald-400" />
              OMR SHEET
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
           <button 
             onClick={onClose}
             className="bg-white/5 border border-white/10 text-white font-bold h-16 rounded-2xl flex items-center justify-center gap-2"
           >
             <Home size={20} />
             FINISH BATTLE
           </button>
           <button 
             onClick={handleRequestMore}
             className="bg-[#32befa] text-black font-black h-16 rounded-2xl flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(50,190,250,0.3)] active:scale-95 transition-all"
           >
             <MessageCircle size={20} />
             REQUEST TRY
           </button>
        </div>
      </motion.div>
    </div>
  );
}
