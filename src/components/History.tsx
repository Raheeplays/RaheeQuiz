import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, CheckCircle, XCircle, Search, HelpCircle } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { db } from '../firebase/config';
import { ref, onValue } from 'firebase/database';
import { Quiz, QuizHistory } from '../types';
import { cn } from '../lib/utils';

export default function History({ onClose }: { onClose: () => void }) {
  const { currentUser } = useUser();
  const [history, setHistory] = useState<QuizHistory[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, Quiz>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    
    // In a real app we'd filter by userId in a specific history collection
    // For now we'll look at the 'history' path which we should have pushed to
    const historyRef = ref(db, 'history');
    onValue(historyRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data)
          .map(([key, val]: [string, any]) => ({ ...val, id: key }))
          .filter((h: any) => h.userId === currentUser.id) as QuizHistory[];
        setHistory(list.sort((a, b) => b.timestamp - a.timestamp));
      }
    });

    onValue(ref(db, 'quizzes'), (snapshot) => {
      if (snapshot.exists()) setQuizzes(snapshot.val());
      setLoading(false);
    });
  }, [currentUser]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black">
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#111]">
         <div className="flex items-center gap-3">
            <div className="p-2 bg-[#32befa]/20 text-[#32befa] rounded-xl"><ClockIcon size={20} /></div>
            <h3 className="font-black">QUIZ HISTORY</h3>
         </div>
         <button onClick={onClose} className="p-2 bg-white/5 rounded-full text-white/40"><X size={20} /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
         {loading ? (
           <div className="space-y-4">
              {[1,2,3,4,5].map(i => <div key={i} className="h-24 bg-white/5 rounded-2xl animate-pulse" />)}
           </div>
         ) : history.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-20">
              <Search size={64} className="mb-4" />
              <p className="font-bold">No history found yet</p>
           </div>
         ) : (
           history.map((h, idx) => {
             const quiz = quizzes[h.quizId];
             if (!quiz) return null;
             return (
               <motion.div 
                 key={idx}
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="p-5 bg-[#111] border border-white/5 rounded-2xl space-y-3"
               >
                  <div className="flex justify-between items-start">
                     <p className="text-sm font-bold flex-1 pr-4">{quiz.question?.en || 'Untitled'}</p>
                     {h.isCorrect ? <CheckCircle size={20} className="text-green-500 shrink-0" /> : <XCircle size={20} className="text-red-500 shrink-0" />}
                  </div>
                  <div className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider">
                     <div className="flex items-center gap-2">
                        <span className="text-white/20">Your Answer:</span>
                        <span className={h.isCorrect ? "text-green-500" : "text-red-500"}>{quiz.options?.en?.[h.userAnswerIndex] || 'N/A'}</span>
                     </div>
                     {!h.isCorrect && (
                       <div className="flex items-center gap-2">
                          <span className="text-white/20">Correction:</span>
                          <span className="text-[#32befa]">{quiz.options?.en?.[quiz.correctAnswerIndex] || 'N/A'}</span>
                       </div>
                     )}
                  </div>
               </motion.div>
             );
           })
         )}
      </div>
    </div>
  );
}

function ClockIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
