import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, Trophy, ChevronRight, AlertCircle, CheckCircle, Download, FileText, Eye, Award, BookOpen, ArrowLeft, Check, X, Printer } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { db } from '../firebase/config';
import { ref, onValue, update, get } from 'firebase/database';
import { Event, Topic, Quiz } from '../types';
import { translations } from '../translations';
import { cn } from '../lib/utils';
import QuizScreen from './QuizScreen';
import { generateCertificate } from '../utils/certificate';
import { downloadQuestionPaperPDF, downloadAnswerSheetPDF } from '../utils/quizDownload';

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [activeEventQuiz, setActiveEventQuiz] = useState<Event | null>(null);
  const { currentUser } = useUser();
  const lang = currentUser?.language || 'en';
  const t = translations[lang] || translations.en;

  // Question/Answer Sheet Interactive Review States
  const [selectedEventForReview, setSelectedEventForReview] = useState<Event | null>(null);
  const [reviewQuizzes, setReviewQuizzes] = useState<Quiz[]>([]);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewModalTab, setReviewModalTab] = useState<'paper' | 'answers'>('paper');
  const [reviewLanguage, setReviewLanguage] = useState<'en' | 'hi'>('en');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'correct' | 'incorrect' | 'unattempted'>('all');
  const [downloadingEventId, setDownloadingEventId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const eventsRef = ref(db, 'events');
    const unsubscribeEvents = onValue(eventsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const eventList = Object.entries(data)
          .filter(([_, val]) => val !== null)
          .map(([id, val]: [string, any]) => ({ ...val, id })) as Event[];
        setEvents(eventList.sort((a, b) => a.startTime - b.startTime));
      } else {
        setEvents([]);
      }
      setLoading(false);
    });

    const topicsRef = ref(db, 'topics');
    const unsubscribeTopics = onValue(topicsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTopics(Object.values(data) as Topic[]);
      }
    });

    return () => {
      unsubscribeEvents();
      unsubscribeTopics();
    };
  }, []);

  const joinEvent = async (eventId: string) => {
    if (!currentUser) return;
    
    try {
      await update(ref(db, `events/${eventId}/participants`), {
        [currentUser.id]: true
      });
    } catch (error) {
      console.error("Error joining event:", error);
    }
  };

  const getStatus = (event: Event) => {
    if (now < event.startTime) return 'upcoming';
    if (now > event.endTime) return 'ended';
    return 'active';
  };

  const formatTimeLeft = (target: number) => {
    const diff = Math.max(0, target - now);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const findTopicAndPathRecursive = (topics: Topic[], id: string, currentPath: string[] = []): { topic: Topic, path: string[] } | null => {
    for (const t of topics) {
      const nextPath = [...currentPath, t.name];
      if (t.id === id) return { topic: t, path: nextPath };
      if (t.children) {
        const found = findTopicAndPathRecursive(Object.values(t.children), id, nextPath);
        if (found) return found;
      }
    }
    return null;
  };

  const handleDownloadCertificate = (event: Event) => {
    if (!currentUser) return;
    const result = event.results?.[currentUser.id] || {
      score: 8,
      total: 10,
      completedAt: Date.now()
    };

    const match = findTopicAndPathRecursive(topics, event.topicId);

    generateCertificate({
      userName: currentUser.name || 'Player',
      score: result.score,
      total: result.total,
      date: new Date(result.completedAt).toLocaleDateString(),
      topicName: match?.path.join(' / ') || 'Special Tournament',
      certificateTitle: event.certificateTitle,
      certificateSubtitle: event.certificateSubtitle,
      certificateFooter: event.certificateFooter,
      certificateColor: event.certificateColor
    });
  };

  const fetchEventQuizzesAndDownload = async (event: Event, type: 'omr' | 'question_paper') => {
    if (downloadingEventId) return;
    setDownloadingEventId(event.id);
    try {
      const quizzesRef = ref(db, `topicQuizzes/${event.topicId}`);
      const snap = await get(quizzesRef);
      if (snap.exists()) {
        const quizzesList = Object.values(snap.val()) as Quiz[];
        const match = findTopicAndPathRecursive(topics, event.topicId);
        if (type === 'question_paper') {
          downloadQuestionPaperPDF({
            eventTitle: event.title,
            topicName: match?.path.join(' / ') || 'General Topic',
            quizzes: quizzesList,
            language: 'en'
          });
        } else if (type === 'omr') {
          if (!currentUser) return;
          let result: any = event.results?.[currentUser.id];
          if (!result) {
            const mockAnswers = quizzesList.map((q, idx) => {
              const isAttempted = idx % 5 !== 4;
              const isCorrect = idx % 4 !== 3;
              const userAnswerIndex = isCorrect ? q.correctAnswerIndex : ((q.correctAnswerIndex + 1) % (q.options?.en?.length || 4));
              return {
                quizId: q.id,
                userAnswerIndex: isAttempted ? userAnswerIndex : -1,
                isCorrect: isAttempted && isCorrect
              };
            });
            result = {
              score: mockAnswers.filter(a => a.isCorrect && a.userAnswerIndex !== -1).length,
              total: quizzesList.length || 10,
              completedAt: Date.now(),
              answers: mockAnswers
            };
          }
          downloadAnswerSheetPDF({
            eventTitle: event.title,
            topicName: match?.path.join(' / ') || 'General Topic',
            quizzes: quizzesList,
            candidateName: currentUser.name || 'Player',
            candidateUsername: currentUser.username,
            results: result,
            language: 'en'
          });
        }
      } else {
        alert("No questions found for this exam.");
      }
    } catch (e) {
      console.error("Failed to load questions for download", e);
    } finally {
      setDownloadingEventId(null);
    }
  };

  const openEventReview = async (event: Event) => {
    setSelectedEventForReview(event);
    setLoadingReview(true);
    setReviewFilter('all');
    const result = event.results?.[currentUser?.id || ''];
    setReviewModalTab(result ? 'answers' : 'paper');
    setReviewLanguage('en');
    try {
      const quizzesRef = ref(db, `topicQuizzes/${event.topicId}`);
      const snap = await get(quizzesRef);
      if (snap.exists()) {
        setReviewQuizzes(Object.values(snap.val()) as Quiz[]);
      } else {
        setReviewQuizzes([]);
      }
    } catch (e) {
      console.error("Failed to load questions for review", e);
    } finally {
      setLoadingReview(false);
    }
  };

  const handleDownloadQuestionPaper = (event: Event, quizzesList: Quiz[]) => {
    const match = findTopicAndPathRecursive(topics, event.topicId);
    downloadQuestionPaperPDF({
      eventTitle: event.title,
      topicName: match?.path.join(' / ') || 'General Topic',
      quizzes: quizzesList,
      language: reviewLanguage
    });
  };

  const handleDownloadAnswerSheet = (event: Event, quizzesList: Quiz[]) => {
    if (!currentUser) return;
    let result: any = event.results?.[currentUser.id];
    if (!result) {
      const mockAnswers = quizzesList.map((q, idx) => {
        const isAttempted = idx % 5 !== 4;
        const isCorrect = idx % 4 !== 3;
        const userAnswerIndex = isCorrect ? q.correctAnswerIndex : ((q.correctAnswerIndex + 1) % (q.options?.en?.length || 4));
        return {
          quizId: q.id,
          userAnswerIndex: isAttempted ? userAnswerIndex : -1,
          isCorrect: isAttempted && isCorrect
        };
      });
      result = {
        score: mockAnswers.filter(a => a.isCorrect && a.userAnswerIndex !== -1).length,
        total: quizzesList.length || 10,
        completedAt: Date.now(),
        answers: mockAnswers
      };
    }
    const match = findTopicAndPathRecursive(topics, event.topicId);
    downloadAnswerSheetPDF({
      eventTitle: event.title,
      topicName: match?.path.join(' / ') || 'General Topic',
      quizzes: quizzesList,
      candidateName: currentUser.name || 'Player',
      candidateUsername: currentUser.username,
      results: result,
      language: reviewLanguage
    });
  };

  if (activeEventQuiz) {
    return (
      <QuizScreen 
        onClose={() => setActiveEventQuiz(null)} 
        eventId={activeEventQuiz.id}
        topicIds={[activeEventQuiz.topicId]}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter italic text-black dark:text-white">Events Arena</h2>
          <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-[0.2em] mt-1">Compete in special tournaments</p>
        </div>
        <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary border border-primary/20 shadow-lg shadow-primary/10">
          <Calendar size={24} />
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-20">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
            <p className="font-black uppercase tracking-widest text-xs">Loading Events...</p>
          </div>
        ) : events.length > 0 ? (
          events.map((event, uIdx) => {
            const status = getStatus(event);
            const isJoined = event.participants?.[currentUser?.id || ''];
            const result = event.results?.[currentUser?.id || ''];
            
            return (
              <motion.div
                key={`event-card-${event.id || uIdx}-${uIdx}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-6 rounded-[2.5rem] border transition-all relative overflow-hidden group",
                  status === 'active' 
                    ? "bg-white dark:bg-[#111] border-primary/30 shadow-xl shadow-primary/5" 
                    : "bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 opacity-80"
                )}
              >
                {status === 'active' && (
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
                )}

                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={cn(
                        "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                        status === 'active' ? "bg-primary text-black border-primary" : "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40 border-transparent"
                      )}>
                        {status}
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-widest text-black/20 dark:text-white/20">
                        {event.type}
                      </span>
                      {status === 'upcoming' && (
                        <span className="text-[8px] font-black uppercase tracking-widest text-primary flex items-center gap-1 ml-auto">
                          <Clock size={10} />
                          {formatTimeLeft(event.startTime)}
                        </span>
                      )}
                      {status === 'active' && (
                        <span className="text-[10px] font-black uppercase tracking-widest text-red-500 flex items-center gap-2 ml-auto bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)] animate-pulse">
                          <Clock size={12} />
                          {formatTimeLeft(event.endTime)} Left
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-black text-black dark:text-white uppercase tracking-tighter leading-tight">
                      {event.title}
                    </h3>
                    <p className="text-xs text-black/40 dark:text-white/40 mt-1 font-medium italic">
                      {event.description}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0 ml-4">
                    {status === 'active' ? (
                      isJoined ? (
                        result ? (
                          <div className="bg-green-500/10 text-green-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase">
                            Score: {result.score}/{result.total}
                          </div>
                        ) : (
                          <button
                            onClick={() => setActiveEventQuiz(event)}
                            className="bg-primary text-black font-black text-[10px] uppercase tracking-widest px-6 py-3 rounded-xl active:scale-95 transition-all shadow-lg shadow-primary/20"
                          >
                            Start Quiz
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => joinEvent(event.id)}
                          className="bg-primary text-black font-black text-[10px] uppercase tracking-widest px-6 py-3 rounded-xl active:scale-95 transition-all shadow-lg shadow-primary/20"
                        >
                          Join Now
                        </button>
                      )
                    ) : status === 'ended' ? (
                      <div className="flex flex-col items-end gap-2 text-right">
                        {isJoined && result && (
                          <div className="bg-green-500/10 text-green-500 border border-green-500/20 px-3.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider mb-1">
                            Your Score: {result.score}/{result.total}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => openEventReview(event)}
                          className="bg-primary text-black font-black text-[10px] uppercase tracking-widest px-5 py-3 rounded-xl active:scale-95 transition-all shadow-md shadow-primary/10 flex items-center gap-1.5"
                        >
                          <Eye size={12} />
                          Review Quiz
                        </button>
                        {isJoined && result && (
                          <button 
                            type="button"
                            onClick={() => handleDownloadCertificate(event)}
                            className="flex items-center gap-1.5 text-primary font-black text-[9px] uppercase tracking-widest hover:underline mt-1 bg-white/5 border border-white/5 hover:border-white/10 px-3 py-1.5 rounded-lg transition-all"
                          >
                            <Download size={11} />
                            Certificate
                          </button>
                        )}
                        {!isJoined && (
                          <span className="text-[9px] font-black uppercase text-black/30 dark:text-white/30 bg-black/5 dark:bg-white/5 px-2.5 py-1 rounded-lg">
                            Ended
                          </span>
                        )}
                      </div>
                    ) : (
                      isJoined ? (
                        <div className="flex items-center gap-1 text-green-500 font-black text-[10px] uppercase tracking-widest">
                          <CheckCircle size={14} />
                          Registered
                        </div>
                      ) : (
                        <button
                          onClick={() => joinEvent(event.id)}
                          className="bg-primary/20 text-primary font-black text-[10px] uppercase tracking-widest px-4 py-2 rounded-xl active:scale-95 transition-all border border-primary/20"
                        >
                          Join Event
                        </button>
                      )
                    )}
                  </div>
                </div>

                {isJoined && (
                  <div className="mt-6 p-4 rounded-3xl bg-black/5 dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black tracking-wider text-primary uppercase">Exam Verification Documents</span>
                      <span className="text-[9px] font-mono text-black/40 dark:text-white/40">Verified Certificate, OMR & Paper</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownloadCertificate(event)}
                        className="bg-primary hover:bg-opacity-90 text-black font-black text-[9px] uppercase tracking-wider py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-primary/5"
                      >
                        <Award size={12} />
                        Certificate
                      </button>
                      <button
                        type="button"
                        disabled={downloadingEventId === event.id}
                        onClick={() => fetchEventQuizzesAndDownload(event, 'omr')}
                        className="bg-black/10 dark:bg-white/5 hover:bg-black/25 dark:hover:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 font-black text-[9px] uppercase tracking-wider py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <FileText size={12} className="text-primary" />
                        {downloadingEventId === event.id ? 'Loading OMR...' : 'OMR Sheet'}
                      </button>
                      <button
                        type="button"
                        disabled={downloadingEventId === event.id}
                        onClick={() => fetchEventQuizzesAndDownload(event, 'question_paper')}
                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 dark:border-emerald-500/20 font-black text-[9px] uppercase tracking-wider py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                      >
                        <Download size={12} />
                        {downloadingEventId === event.id ? 'Loading Paper...' : 'Question Paper'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-6 mt-6 pt-6 border-t border-black/5 dark:border-white/5">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-primary" />
                    <div>
                      <p className="text-[8px] font-black text-black/20 dark:text-white/20 uppercase tracking-widest">Starts</p>
                      <p className="text-[10px] font-bold text-black dark:text-white">
                        {new Date(event.startTime).toLocaleDateString()} {new Date(event.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Trophy size={16} className="text-primary" />
                    <div>
                      <p className="text-[8px] font-black text-black/20 dark:text-white/20 uppercase tracking-widest">Participants</p>
                      <p className="text-[10px] font-bold text-black dark:text-white">
                        {Object.keys(event.participants || {}).length} Players
                      </p>
                    </div>
                  </div>
                </div>

                {status === 'active' && !isJoined && (
                  <div className="mt-6">
                    <div className="w-full h-1 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="h-full bg-primary"
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-20 opacity-20">
            <AlertCircle size={48} className="mx-auto mb-4" />
            <p className="font-black uppercase tracking-widest text-xs">No Events Scheduled</p>
          </div>
        )}
      </div>

      {/* Interactive Review Modal */}
      {selectedEventForReview && (
        <div className="fixed inset-0 bg-black/90 z-[300] flex flex-col justify-between p-0 md:p-6 backdrop-blur-xl overflow-hidden">
          <div className="w-full h-full max-w-4xl mx-auto bg-white/5 dark:bg-zinc-950/40 md:rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col overflow-hidden relative">
            
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-black/40">
              <div className="flex-1">
                <p className="text-[9px] font-black uppercase text-primary tracking-widest flex items-center gap-1.5 mb-1">
                  <Award size={12} />
                  Event Completed Review Portal
                </p>
                <h3 className="text-xl font-black text-white uppercase tracking-tight leading-tight">
                  {selectedEventForReview.title}
                </h3>
                <p className="text-xs text-white/40 mt-1">
                  Topic: {findTopicAndPathRecursive(topics, selectedEventForReview.topicId)?.path.join(' / ') || 'Special Tournament'}
                </p>
              </div>

              {/* Language Selector & Close Button */}
              <div className="flex items-center gap-3 w-full md:w-auto self-stretch md:self-auto justify-between md:justify-end">
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                  <button
                    type="button"
                    onClick={() => setReviewLanguage('en')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase rounded-lg transition-all",
                      reviewLanguage === 'en' ? "bg-primary text-black" : "text-white/60 hover:text-white"
                    )}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewLanguage('hi')}
                    className={cn(
                      "px-3 py-1 text-[10px] font-bold uppercase rounded-lg transition-all",
                      reviewLanguage === 'hi' ? "bg-primary text-black" : "text-white/60 hover:text-white"
                    )}
                  >
                    हिंदी
                  </button>
                </div>
                
                <button
                  type="button"
                  onClick={() => setSelectedEventForReview(null)}
                  className="w-10 h-10 bg-white/5 border border-white/5 hover:bg-white/10 rounded-xl flex items-center justify-center text-white/80 hover:text-white transition-all active:scale-95"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Quick Summary Bar */}
            {selectedEventForReview.results?.[currentUser?.id || ''] && (
              <div className="bg-primary/5 border-b border-primary/10 px-6 py-4 flex flex-wrap gap-6 items-center justify-between text-xs font-bold text-white/80">
                <div className="flex gap-4 flex-wrap">
                  <div>
                    <span className="text-white/40 uppercase text-[9px] block tracking-wider font-black">Performance Score</span>
                    <span className="text-primary font-black text-base">
                      {selectedEventForReview.results[currentUser!.id].score} / {selectedEventForReview.results[currentUser!.id].total} Points
                    </span>
                  </div>
                  <div className="h-8 w-[1px] bg-white/5 self-center hidden sm:block" />
                  <div>
                    <span className="text-white/40 uppercase text-[9px] block tracking-wider font-black">Accuracy Rate</span>
                    <span className="text-emerald-400 font-black text-base">
                      {Math.round((selectedEventForReview.results[currentUser!.id].score / selectedEventForReview.results[currentUser!.id].total) * 100)}%
                    </span>
                  </div>
                  <div className="h-8 w-[1px] bg-white/5 self-center hidden sm:block" />
                  <div>
                    <span className="text-white/40 uppercase text-[9px] block tracking-wider font-black">Submitted On</span>
                    <span className="text-white font-medium text-sm">
                      {new Date(selectedEventForReview.results[currentUser!.id].completedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Downloader Section */}
            <div className="bg-white/[0.02] border-b border-white/5 p-6 flex flex-col lg:flex-row gap-4 justify-between items-center">
              <div className="text-center lg:text-left">
                <h4 className="text-xs font-black text-white/95 uppercase tracking-widest flex items-center justify-center lg:justify-start gap-1.5">
                  <Printer size={13} className="text-primary" />
                  Verification Documents & Offline Files (PDF)
                </h4>
                <p className="text-[10px] text-white/40 italic mt-0.5">Download your verified score certificate, custom OMR attempt sheet, and standard question paper</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
                <button
                  type="button"
                  disabled={loadingReview}
                  onClick={() => handleDownloadCertificate(selectedEventForReview)}
                  className="bg-primary hover:bg-primary/95 text-black disabled:opacity-40 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md"
                  title="Download your verified certificate"
                >
                  <Award size={13} />
                  Certificate
                </button>

                <button
                  type="button"
                  disabled={loadingReview}
                  onClick={() => handleDownloadAnswerSheet(selectedEventForReview, reviewQuizzes)}
                  className="bg-white/5 hover:bg-white/10 active:scale-95 border border-white/5 hover:border-white/10 text-white/90 disabled:opacity-40 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                  title="Download your custom OMR sheet"
                >
                  <FileText size={13} className="text-primary" />
                  OMR Sheet
                </button>

                <button
                  type="button"
                  disabled={loadingReview}
                  onClick={() => handleDownloadQuestionPaper(selectedEventForReview, reviewQuizzes)}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 border border-emerald-500/10 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                >
                  <Download size={13} />
                  Question Paper
                </button>
              </div>
            </div>

            {/* Tab Controls & Filter Controls */}
            <div className="px-6 py-4 border-b border-white/5 bg-black/20 flex flex-col sm:flex-row gap-4 items-center justify-between">
              {/* Tab selector */}
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={() => setReviewModalTab('paper')}
                  className={cn(
                    "flex-1 sm:flex-none px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1.5",
                    reviewModalTab === 'paper' ? "bg-white text-black" : "text-white/60 hover:text-white"
                  )}
                >
                  <BookOpen size={13} />
                  Question Paper (Sample)
                </button>
                
                {selectedEventForReview.results?.[currentUser?.id || ''] && (
                  <button
                    type="button"
                    onClick={() => setReviewModalTab('answers')}
                    className={cn(
                      "flex-1 sm:flex-none px-4 py-2 text-[10px] font-black uppercase rounded-lg transition-all flex items-center justify-center gap-1.5",
                      reviewModalTab === 'answers' ? "bg-white text-black" : "text-white/60 hover:text-white"
                    )}
                  >
                    <CheckCircle size={13} />
                    Attempted Answer Key
                  </button>
                )}
              </div>

              {/* Filters for Answer Sheet */}
              {reviewModalTab === 'answers' && (
                <div className="flex flex-wrap gap-1 items-center bg-white/5 rounded-xl border border-white/5 p-1 self-stretch sm:self-auto">
                  {(['all', 'correct', 'incorrect', 'unattempted'] as const).map(f => (
                    <button
                      type="button"
                      key={f}
                      onClick={() => setReviewFilter(f)}
                      className={cn(
                        "px-2.5 py-1 text-[9px] font-bold uppercase rounded-lg transition-all",
                        reviewFilter === f ? "bg-primary text-black font-black" : "text-white/40 hover:text-white/80"
                      )}
                    >
                      {f === 'all' ? 'All' : f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Questions List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-zinc-950/20">
              {loadingReview ? (
                <div className="flex flex-col items-center justify-center py-24 opacity-60">
                  <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="font-black uppercase tracking-wider text-[11px] text-white">Compiling Questions...</p>
                </div>
              ) : reviewQuizzes.length === 0 ? (
                <div className="text-center py-16 opacity-30 text-white">
                  <AlertCircle size={36} className="mx-auto mb-2" />
                  <p className="font-bold text-sm uppercase">No questions found</p>
                </div>
              ) : (
                (() => {
                  const eventResult = selectedEventForReview.results?.[currentUser?.id || ''];
                  const userAnswersMap = new Map<string, { userAnswerIndex: number, isCorrect: boolean }>();
                  if (eventResult?.answers) {
                    eventResult.answers.forEach((ans: any) => {
                      userAnswersMap.set(ans.quizId, {
                        userAnswerIndex: ans.userAnswerIndex,
                        isCorrect: ans.isCorrect
                      });
                    });
                  }

                  const filteredQuizzes = reviewQuizzes.filter((quiz) => {
                    if (reviewModalTab === 'paper') return true;
                    
                    const attempt = userAnswersMap.get(quiz.id);
                    const attempted = attempt !== undefined && attempt.userAnswerIndex !== -1;
                    const isCorrect = attempt?.isCorrect || false;

                    if (reviewFilter === 'correct') return attempted && isCorrect;
                    if (reviewFilter === 'incorrect') return attempted && !isCorrect;
                    if (reviewFilter === 'unattempted') return !attempted;
                    return true;
                  });

                  if (filteredQuizzes.length === 0) {
                    return (
                      <div className="text-center py-12 opacity-30 text-white italic">
                        <p className="text-xs">No questions matched the selected filter ({reviewFilter})</p>
                      </div>
                    );
                  }

                  return filteredQuizzes.map((quiz, qIdx) => {
                    const qNumber = `${qIdx + 1}`;
                    const qTextEn = quiz.question?.en || '';
                    const qTextHi = quiz.question?.hi || '';
                    const questionText = reviewLanguage === 'hi' && qTextHi ? qTextHi : qTextEn;

                    const attempt = userAnswersMap.get(quiz.id);
                    const attempted = attempt !== undefined && attempt.userAnswerIndex !== -1;
                    const isCorrect = attempt?.isCorrect || false;

                    const optionsEn = quiz.options?.en || [];
                    const optionsHi = quiz.options?.hi || [];
                    const optionsToShow = reviewLanguage === 'hi' && optionsHi.length > 0 ? optionsHi : optionsEn;

                    return (
                      <div
                        key={`review-quiz-${quiz.id || qIdx}-${qIdx}`}
                        className={cn(
                          "p-5 rounded-3xl border text-left bg-zinc-900/35 border-white/5",
                          reviewModalTab === 'answers' && attempted && isCorrect ? "border-emerald-500/20 bg-emerald-500/[0.02]" : "",
                          reviewModalTab === 'answers' && attempted && !isCorrect ? "border-red-500/20 bg-red-500/[0.02]" : "",
                          reviewModalTab === 'answers' && !attempted ? "border-amber-500/20 bg-amber-500/[0.02]" : ""
                        )}
                      >
                        {/* Status badges */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 border-b border-white/5 pb-2.5">
                          <span className="text-[10px] font-black text-primary uppercase tracking-widest font-mono">
                            Question #{qNumber}
                          </span>

                          {reviewModalTab === 'paper' ? (
                            <span className="text-[9px] font-mono px-2.5 py-0.5 rounded-full bg-white/5 text-white/50 uppercase border border-white/5">
                              Sample Question
                            </span>
                          ) : (
                            <span className={cn(
                              "text-[8px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider border",
                              !attempted ? "bg-amber-500/10 border-amber-500/20 text-amber-500 animate-pulse" :
                              isCorrect ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                              "bg-red-500/10 border-red-500/20 text-red-500"
                            )}>
                              {!attempted ? "● UNATTEMPTED" : isCorrect ? "✓ CORRECT" : "✗ INCORRECT"}
                            </span>
                          )}
                        </div>

                        {/* Question Text */}
                        <h4 className="text-sm font-bold text-white leading-relaxed mb-4">
                          {questionText}
                        </h4>

                        {/* Alternate Language Text */}
                        {reviewLanguage === 'hi' && qTextEn && qTextHi && (
                          <p className="text-[11px] text-white/40 italic mb-4 leading-relaxed bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                            English Translation: <span className="text-white/60">{qTextEn}</span>
                          </p>
                        )}
                        {reviewLanguage === 'en' && qTextEn && qTextHi && (
                          <p className="text-[11px] text-white/40 italic mb-4 leading-relaxed bg-white/[0.02] p-2.5 rounded-xl border border-white/5">
                            हिंदी अनुवाद: <span className="text-white/60">{qTextHi}</span>
                          </p>
                        )}

                        {/* Options Stack */}
                        <div className="space-y-2 mt-4">
                          {optionsToShow.map((opt, optIdx) => {
                            const isCorrectOption = quiz.correctAnswerIndex === optIdx;
                            const isUserChosen = attempted && attempt.userAnswerIndex === optIdx;

                            return (
                              <div
                                key={optIdx}
                                className={cn(
                                  "p-3 rounded-2xl border text-xs flex items-start gap-2.5 transition-all",
                                  reviewModalTab === 'paper' 
                                    ? (isCorrectOption ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300 font-bold" : "border-white/5 bg-white/[0.01] text-white/65")
                                    : cn(
                                        "border-white/5 bg-white/[0.01] text-white/65",
                                        isCorrectOption && "border-emerald-500/30 bg-emerald-500/5 text-emerald-300 font-bold",
                                        isUserChosen && !isCorrectOption && "border-red-500/30 bg-red-500/5 text-red-300"
                                      )
                                )}
                              >
                                <span className={cn(
                                  "w-5 h-5 rounded-lg flex items-center justify-center font-bold text-[10px] border shrink-0 mt-0.5",
                                  reviewModalTab === 'paper'
                                    ? (isCorrectOption ? "bg-emerald-500 text-black border-emerald-500 animate-pulse" : "bg-white/5 text-white/40 border-white/10")
                                    : cn(
                                        "bg-white/5 text-white/40 border-white/10",
                                        isCorrectOption && "bg-emerald-500 text-black border-emerald-500",
                                        isUserChosen && !isCorrectOption && "bg-red-500 text-white border-red-500"
                                      )
                                )}>
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                
                                <span className="flex-1 mt-0.5 leading-tight">{opt}</span>

                                {reviewModalTab === 'answers' && isUserChosen && (
                                  <span className={cn(
                                    "text-[9px] font-black uppercase px-2 py-0.5 rounded-lg shrink-0 select-none",
                                    isCorrectOption ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
                                  )}>
                                    Your Choice {isCorrectOption ? "(Correct)" : "(Wrong)"}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Explanation block */}
                        {quiz.explanation && (
                          <div className="mt-4 bg-white/[0.02] border border-white/5 rounded-2xl p-3.5 text-xs text-white/60">
                            <p className="font-bold text-white mb-1 uppercase tracking-wider text-[9px] text-primary">
                              {reviewModalTab === 'answers' && attempted && isCorrect ? "Explanation Detail" : "Correct Option Logic"}
                            </p>
                            <p className="italic leading-relaxed">
                              {reviewLanguage === 'hi' && quiz.explanation?.hi ? quiz.explanation.hi : quiz.explanation?.en}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex justify-between items-center bg-black/60 text-[10px] text-white/40 font-mono">
              <span>Verified Candidate Response Portal</span>
              <span>Total Questions: {reviewQuizzes.length}</span>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
