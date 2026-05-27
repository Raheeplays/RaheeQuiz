import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle, XCircle, Search, HelpCircle, ChevronRight, Clock, Trophy, RefreshCw, AlertCircle, MessageSquare, Zap, Award, Download } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { db } from '../firebase/config';
import { ref, onValue, set, update } from 'firebase/database';
import { Quiz, SessionHistory, User, QuizHistory } from '../types';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { generateCertificate } from '../utils/certificate';
import { downloadAnswerSheetPDF } from '../utils/quizDownload';

interface HistoryProps {
  onClose: () => void;
  onPlayAgain?: (topicId: string) => void;
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

export default function History({ onClose, onPlayAgain }: HistoryProps) {
  const { currentUser } = useUser();
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  const [quizzes, setQuizzes] = useState<Record<string, Quiz>>({});
  const [topics, setTopics] = useState<Record<string, any>>({});
  const [individualHistory, setIndividualHistory] = useState<QuizHistory[]>([]);
  const [activeHistoryTab, setActiveHistoryTab] = useState<'sessions' | 'recent'>('sessions');
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<SessionHistory | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    
    const sessionsRef = ref(db, 'sessionHistory');
    onValue(sessionsRef, (snapshot) => {
      const data = snapshot.val();
      console.log('History data fetched:', data);
      if (data) {
        const list = Object.entries(data)
          .filter(([id, val]) => val !== null)
          .map(([id, val]: [string, any]) => ({ ...val, id: id })) // Use the Firebase key directly as ID
          .filter((s: any) => s.userId === currentUser.id) as SessionHistory[];
        console.log('Filtered sessions for user:', currentUser.id, list);
        setSessions(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      } else {
        setSessions([]);
      }
    });

    const historyRef = ref(db, 'history');
    onValue(historyRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const list = Object.entries(data)
          .filter(([id, val]) => val !== null)
          .map(([id, val]: [string, any]) => ({ ...val, id }))
          .filter((h: any) => h.userId === currentUser.id) as QuizHistory[];
        setIndividualHistory(list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
      } else {
        setIndividualHistory([]);
      }
    });

    onValue(ref(db, 'topicQuizzes'), (snapshot) => {
      if (snapshot.exists()) {
        const allQuizzes: Record<string, Quiz> = {};
        Object.values(snapshot.val()).forEach((topicQuizzes: any) => {
          Object.entries(topicQuizzes).forEach(([id, q]: [string, any]) => {
            allQuizzes[id] = q;
          });
        });
        setQuizzes(allQuizzes);
      }
    });

    onValue(ref(db, 'topics'), (snapshot) => {
      if (snapshot.exists()) setTopics(snapshot.val());
      setLoading(false);
    });
  }, [currentUser]);

  const requestExtension = async () => {
    if (!currentUser) return;
    await update(ref(db, `users/${currentUser.id}`), {
      extraTriesRequested: true
    });
    alert('Extension request sent to admin!');
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#050505]">
      <div className="p-6 border-b border-white/5 bg-[#0a0a0a] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="p-2.5 bg-primary/20 text-primary rounded-xl shadow-[0_0_15px_rgba(var(--primary-color),0.2)]">
               <Trophy size={20} />
             </div>
             <h3 className="font-black tracking-tight text-white uppercase italic">QUIZ HISTORY</h3>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white/5 rounded-full text-white/40 hover:bg-white/10 hover:text-white transition-all"><X size={20} /></button>
        </div>

        <div className="flex p-1 bg-white/5 rounded-xl">
           <button 
             onClick={() => setActiveHistoryTab('sessions')}
             className={cn(
               "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
               activeHistoryTab === 'sessions' ? "bg-primary text-black" : "text-white/40 hover:text-white"
             )}
           >
             Sessions
           </button>
           <button 
             onClick={() => setActiveHistoryTab('recent')}
             className={cn(
               "flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
               activeHistoryTab === 'recent' ? "bg-primary text-black" : "text-white/40 hover:text-white"
             )}
           >
             Recent Quizzes
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
         {loading ? (
           <div className="space-y-4 max-w-3xl mx-auto">
            {['h1', 'h2', 'h3', 'h4', 'h5'].map(i => <div key={`history-skeleton-${i}`} className="h-28 bg-white/5 rounded-3xl animate-pulse" />)}
          </div>
         ) : activeHistoryTab === 'sessions' ? (
           sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-12 opacity-30">
               <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                 <Search size={40} />
               </div>
               <p className="font-black text-xs uppercase tracking-widest">No completed sessions found</p>
               <p className="text-[10px] font-bold mt-2 max-w-[200px]">Complete a full round of 10 questions to see session history here.</p>
            </div>
           ) : (
            <div className="max-w-3xl mx-auto space-y-4">
              {sessions.map((session, sIdx) => {
                const topicName = getTopicName(session.topicId, topics);
                const isCooldown = Date.now() - session.timestamp < 24 * 60 * 60 * 1000;
                const canPlayAgain = !isCooldown || currentUser?.extraTriesAllowed;
                const isWin = session.score >= session.total * 0.7; 

                return (
                  <motion.div 
                    key={`session-card-${session.id || sIdx}-${sIdx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="group p-5 bg-[#0a0a0a] border border-white/5 rounded-[2rem] hover:border-primary/30 transition-all cursor-pointer relative overflow-hidden"
                    onClick={() => setSelectedSession(session)}
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight size={20} className="text-primary" />
                    </div>

                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border",
                        isWin ? "bg-green-500/10 border-green-500/20 text-green-500" : "bg-red-500/10 border-red-500/20 text-red-500"
                      )}>
                        {isWin ? <CheckCircle size={24} /> : <XCircle size={24} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <h4 className="font-black text-sm uppercase tracking-tight text-white/90 truncate pr-8">{topicName}</h4>
                          <span className="text-[10px] font-bold text-white/20 whitespace-nowrap">{format(session.timestamp, 'MMM d, HH:mm')}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="px-2 py-0.5 bg-white/5 rounded-full text-[9px] font-black tracking-widest text-[#32befa]">
                            SCORE: {session.score}/{session.total}
                          </div>
                          <div className={cn(
                            "px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase",
                            isWin ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                          )}>
                            {isWin ? 'VICTORY' : 'DEFEATED'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-3">
                      {!canPlayAgain ? (
                        <div className="flex-1 flex items-center gap-2">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/5 text-red-500/60 rounded-full text-[9px] font-black tracking-widest uppercase">
                            <Clock size={12} />
                            Cooldown active
                          </div>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              requestExtension();
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-[9px] font-black tracking-widest uppercase hover:bg-primary/20 transition-all"
                          >
                            <MessageSquare size={12} />
                            Request Retry
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-full text-[10px] font-black tracking-widest uppercase hover:scale-105 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onPlayAgain) {
                              onPlayAgain(session.topicId);
                            } else {
                              onClose();
                            }
                          }}
                        >
                          <RefreshCw size={14} />
                          Play Again
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )
         ) : (
           individualHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-12 opacity-30">
               <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                 <Zap size={40} />
               </div>
               <p className="font-black text-xs uppercase tracking-widest">No recent quiz activity</p>
               <p className="text-[10px] font-bold mt-2 max-w-[200px]">Play any quiz to see your individual question history here.</p>
            </div>
           ) : (
            <div className="max-w-3xl mx-auto space-y-3">
               {individualHistory.slice(0, 50).map((h, idx) => {
                 const quiz = quizzes[h.quizId];
                 return (
                   <motion.div 
                     key={`recent-ans-${h.id || idx}-${idx}`}
                     initial={{ opacity: 0, x: -10 }}
                     animate={{ opacity: 1, x: 0 }}
                     className="bg-[#0a0a0a] border border-white/5 p-4 rounded-2xl flex items-center justify-between"
                   >
                     <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          h.isCorrect ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                        )}>
                          {h.isCorrect ? <CheckCircle size={20} /> : <XCircle size={20} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white/90 line-clamp-1 max-w-[200px] md:max-w-md">
                            {quiz?.question?.en || 'Question data missing'}
                          </p>
                          <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">
                            {format(h.timestamp || Date.now(), 'MMM d, HH:mm')}
                          </p>
                        </div>
                     </div>
                     <span className={cn(
                       "text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full whitespace-nowrap",
                       h.isCorrect ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                     )}>
                       {h.isCorrect ? "+100 XP" : "INCORRECT"}
                     </span>
                   </motion.div>
                 );
               })}
            </div>
           )
         )}
      </div>

      <AnimatePresence>
        {selectedSession && (
          <SessionDetail 
            session={selectedSession} 
            quizzes={quizzes} 
            topics={topics}
            onClose={() => setSelectedSession(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SessionDetail({ session, quizzes, topics, onClose }: { session: SessionHistory, quizzes: Record<string, Quiz>, topics: Record<string, any>, onClose: () => void }) {
  const { currentUser } = useUser();

  const handleDownloadCertificate = () => {
    if (!currentUser) return;
    const resolvedTopicName = getTopicName(session.topicId, topics);
    generateCertificate({
      userName: currentUser.name || 'Player',
      score: session.score,
      total: session.total,
      date: new Date(session.timestamp).toLocaleDateString(),
      topicName: resolvedTopicName,
      certificateColor: '#32befa'
    });
  };

  const handleDownloadAnswerSheet = () => {
    if (!currentUser) return;
    const resolvedTopicName = getTopicName(session.topicId, topics);
    
    // Construct session quizzes list from record map
    const sessionQuizzesList: Quiz[] = session.answers
      .map(ans => quizzes[ans.quizId])
      .filter((q): q is Quiz => q !== undefined);

    downloadAnswerSheetPDF({
      eventTitle: 'Rahee Historic Session',
      topicName: resolvedTopicName,
      quizzes: sessionQuizzesList,
      candidateName: currentUser.name || 'Player',
      results: {
        score: session.score,
        total: session.total,
        completedAt: session.timestamp,
        answers: session.answers
      }
    });
  };

  return (
    <motion.div 
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[210] flex flex-col bg-[#050505]"
    >
      <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#0a0a0a]">
         <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-colors">
               <ChevronRight size={24} className="rotate-180" />
            </button>
            <div>
               <h3 className="font-black tracking-tight text-white uppercase italic text-sm">QUIZ DETAILS</h3>
               <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{getTopicName(session.topicId, topics)}</p>
            </div>
         </div>
         <div className="px-4 py-2 bg-primary/10 rounded-2xl border border-primary/20">
            <span className="text-xs font-black text-primary">{Math.round((session.score / session.total) * 100)}% ACCURACY</span>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-6 bg-[#0a0a0a] border border-white/5 rounded-[2rem] text-center">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Correct Answers</p>
              <p className="text-3xl font-black text-green-500">{session.score}</p>
            </div>
            <div className="p-6 bg-[#0a0a0a] border border-white/5 rounded-[2rem] text-center">
              <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mb-1">Total Questions</p>
              <p className="text-3xl font-black text-[#32befa]">{session.total}</p>
            </div>
          </div>

          {/* Downloads Action Panel */}
          <div className="bg-[#0a0a0a] border border-[#32befa]/20 p-5 rounded-[2rem] text-left space-y-3 shadow-[0_0_20px_rgba(50,190,250,0.05)]">
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
                className="flex-1 bg-white/5 hover:bg-[#32befa]/20 hover:text-white border border-white/5 hover:border-[#32befa]/40 text-white text-[11px] font-black tracking-wider py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Download size={15} className="text-emerald-400" />
                OMR SHEET
              </button>
            </div>
          </div>

          <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2 px-2">Questions Review</p>
          
          {session.answers.map((answer, idx) => {
            const quiz = quizzes[answer.quizId];
            if (!quiz) return (
              <div key={`ans-miss-${session.id}-${idx}`} className="p-5 bg-white/5 rounded-[1.5rem] border border-white/5 opacity-50">
                <p className="text-xs font-bold text-white/40 italic text-center">Question data no longer available</p>
              </div>
            );

            return (
              <div key={`ans-card-${session.id}-${idx}`} className="p-5 bg-[#0a0a0a] border border-white/5 rounded-[2rem] space-y-4 relative overflow-hidden">
                <div className={cn(
                  "absolute top-0 left-0 w-1.5 h-full",
                  answer.isCorrect ? "bg-green-500" : "bg-red-500"
                )} />
                
                <div className="flex items-start justify-between gap-4">
                  <h5 className="font-bold text-sm leading-relaxed text-white/90">
                    <span className="text-white/20 mr-2 font-black italic">{idx + 1}.</span>
                    {quiz.question?.en}
                  </h5>
                  <div className={cn(
                    "p-1.5 rounded-full",
                    answer.isCorrect ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                  )}>
                    {answer.isCorrect ? <CheckCircle size={16} /> : <XCircle size={16} />}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="p-3 bg-white/5 rounded-2xl flex items-center justify-between gap-4">
                    <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">Your Answer</span>
                    <span className={cn(
                      "text-xs font-bold",
                      answer.isCorrect ? "text-green-500" : "text-red-500"
                    )}>
                      {quiz.options?.en?.[answer.userAnswerIndex] || 'N/A'}
                    </span>
                  </div>
                  {!answer.isCorrect && (
                    <div className="p-3 bg-green-500/5 rounded-2xl flex items-center justify-between gap-4 border border-green-500/10">
                      <span className="text-[9px] font-black text-green-500/40 uppercase tracking-widest">Correct Answer</span>
                      <span className="text-xs font-bold text-green-500">
                        {quiz.options?.en?.[quiz.correctAnswerIndex]}
                      </span>
                    </div>
                  )}
                </div>

                {quiz.explanation?.en && (
                   <div className="pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2 mb-2 text-primary">
                        <HelpCircle size={14} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Explanation</span>
                      </div>
                      <p className="text-xs font-bold text-white/40 leading-relaxed italic">
                        {quiz.explanation.en}
                      </p>
                   </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
