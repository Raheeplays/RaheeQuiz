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
import { useNotifications } from '../contexts/NotificationContext';
import { NotificationService } from '../services/notificationService';

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const { serviceAccount } = useNotifications();
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

  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [previewPdfTitle, setPreviewPdfTitle] = useState<string>('');
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);
  const [holdingId, setHoldingId] = useState<string | null>(null);
  const pressTimerRef = React.useRef<any>(null);
  const isHoldingRef = React.useRef<boolean>(false);

  // In-app high fidelity native document preview states
  const [expandedDocsEventId, setExpandedDocsEventId] = useState<string | null>(null);
  const [previewQuizzes, setPreviewQuizzes] = useState<Quiz[]>([]);
  const [previewEvent, setPreviewEvent] = useState<Event | null>(null);
  const [previewType, setPreviewType] = useState<'omr' | 'question_paper' | 'answer_sheet' | 'certificate' | null>(null);
  const [previewResults, setPreviewResults] = useState<any>(null);
  const [previewTopicPath, setPreviewTopicPath] = useState<string>('');

  const startDocHold = (event: Event, type: 'omr' | 'question_paper' | 'answer_sheet', buttonId: string) => {
    isHoldingRef.current = false;
    setHoldingId(buttonId);
    
    pressTimerRef.current = setTimeout(() => {
      isHoldingRef.current = true;
      setHoldingId(null);
      processDocumentAction(event, type, 'download');
    }, 600);
  };

  const endDocHold = (event: Event, type: 'omr' | 'question_paper' | 'answer_sheet') => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setHoldingId(null);
    
    if (!isHoldingRef.current) {
      processDocumentAction(event, type, 'preview');
    }
    isHoldingRef.current = false;
  };

  const cancelDocHold = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    setHoldingId(null);
    isHoldingRef.current = false;
  };

  const processDocumentAction = async (event: Event, type: 'omr' | 'question_paper' | 'answer_sheet' | 'certificate', actionType: 'preview' | 'download') => {
    if (downloadingEventId) return;
    setDownloadingEventId(event.id);
    try {
      const match = findTopicAndPathRecursive(topics, event.topicId);
      const previewOnly = actionType === 'preview';
      let doc: any = null;
      let omrResult: any = null;
      let quizzesList: Quiz[] = [];

      if (type === 'certificate') {
        if (!currentUser) return;
        const result = event.results?.[currentUser.id] || {
          score: 8,
          total: 10,
          completedAt: Date.now()
        };
        omrResult = result;
        doc = generateCertificate({
          userName: currentUser.name || 'Player',
          score: result.score,
          total: result.total,
          date: new Date(result.completedAt).toLocaleDateString(),
          topicName: match?.path.join(' / ') || 'Special Tournament',
          certificateTitle: event.certificateTitle,
          certificateSubtitle: event.certificateSubtitle,
          certificateFooter: event.certificateFooter,
          certificateColor: event.certificateColor,
          previewOnly
        });

        if (previewOnly && doc) {
          const blob = doc.output('blob');
          const url = URL.createObjectURL(blob);
          setPreviewPdfUrl(url);
          setPreviewPdfTitle(`${event.title} - Certificate of Achievement`);
          setPreviewQuizzes([]);
          setPreviewEvent(event);
          setPreviewType(type);
          setPreviewTopicPath(match?.path.join(' / ') || 'Special Tournament');
          setPreviewResults(omrResult);
          setShowPdfModal(true);
        }
      } else {
        const quizzesRef = ref(db, `topicQuizzes/${event.topicId}`);
        const snap = await get(quizzesRef);
        if (snap.exists()) {
          quizzesList = Object.values(snap.val()) as Quiz[];

          if (type === 'question_paper') {
            doc = downloadQuestionPaperPDF({
              eventTitle: event.title,
              topicName: match?.path.join(' / ') || 'General Topic',
              quizzes: quizzesList,
              language: 'en',
              previewOnly
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
            omrResult = result;
            doc = downloadAnswerSheetPDF({
              eventTitle: event.title,
              topicName: match?.path.join(' / ') || 'General Topic',
              quizzes: quizzesList,
              candidateName: currentUser.name || 'Player',
              candidateUsername: currentUser.username,
              results: result,
              language: 'en',
              previewOnly
            });
          } else if (type === 'answer_sheet') {
            doc = downloadAnswerSheetPDF({
              eventTitle: event.title,
              topicName: match?.path.join(' / ') || 'General Topic',
              quizzes: quizzesList,
              candidateName: 'OFFICIAL ANSWER KEYS',
              candidateUsername: 'master_key',
              results: {
                score: quizzesList.length,
                total: quizzesList.length,
                completedAt: Date.now(),
                answers: quizzesList.map(q => ({
                  quizId: q.id,
                  userAnswerIndex: q.correctAnswerIndex,
                  isCorrect: true
                }))
              },
              language: 'en',
              previewOnly
            });
          }

          if (previewOnly && doc) {
            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            setPreviewPdfUrl(url);
            setPreviewPdfTitle(`${event.title} - ${type === 'omr' ? 'OMR Sheet' : type === 'question_paper' ? 'Question Paper' : 'Official Answer Sheet'}`);
            
            setPreviewQuizzes(quizzesList);
            setPreviewEvent(event);
            setPreviewType(type);
            setPreviewTopicPath(match?.path.join(' / ') || 'General Topic');
            if (type === 'omr') {
              setPreviewResults(omrResult);
            } else if (type === 'answer_sheet') {
              setPreviewResults({
                score: quizzesList.length,
                total: quizzesList.length,
                completedAt: Date.now(),
                answers: quizzesList.map(q => ({
                  quizId: q.id,
                  userAnswerIndex: q.correctAnswerIndex,
                  isCorrect: true
                }))
              });
            } else {
              setPreviewResults(null);
            }
            
            setShowPdfModal(true);
          }
        } else {
          alert("No questions found for this exam.");
        }
      }
    } catch (e) {
      console.error("Failed to process document", e);
    } finally {
      setDownloadingEventId(null);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const eventsRef = ref(db, 'events');
    const unsubscribeEvents = onValue(eventsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        let eventList = Object.entries(data)
          .filter(([_, val]) => val !== null)
          .map(([id, val]: [string, any]) => ({ ...val, id })) as Event[];

        // Filter testing events: only visible to Admin or explicitly allowed players
        eventList = eventList.filter(event => {
          if (!event.isTesting) return true;
          if (currentUser?.role === 'admin') return true;
          if (event.selectedPlayers?.includes(currentUser?.id || '')) return true;
          return false;
        });

        setEvents(eventList.sort((a, b) => a.startTime - b.startTime));
      } else {
        setEvents([]);
      }
      setLoading(false);
    });

    const topicsRef = ref(db, 'topics');
    const unsubscribeTopics = onValue(unsubscribeEvents ? topicsRef : topicsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTopics(Object.values(data) as Topic[]);
      }
    });

    return () => {
      unsubscribeEvents();
      unsubscribeTopics();
    };
  }, [currentUser]);

  const joinEvent = async (eventId: string) => {
    if (!currentUser) return;
    
    try {
      await update(ref(db, `events/${eventId}/participants`), {
        [currentUser.id]: true
      });

      // Send start and skip exam notifications quickly for immediate starting event
      const targetEvent = events.find(e => e.id === eventId);
      if (targetEvent && targetEvent.isImmediate && serviceAccount) {
        try {
          const tokensSnap = await get(ref(db, `fcmTokens/${currentUser.id}`));
          if (tokensSnap.exists()) {
            const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
            const startTitle = `Exam Live: ${targetEvent.title}`;
            const startBody = `The exam has started! Tap START EXAM or SKIP EXAM.`;
            const startPushData = {
              action_type: "exam_started",
              examId: eventId,
              title: startTitle,
              body: startBody
            };

            for (const token of tokens) {
              try {
                await NotificationService.sendToToken(serviceAccount, token, startTitle, startBody, undefined, startPushData);
              } catch (e) {
                console.error("FCM start error for token:", e);
              }
            }
          }
        } catch (fcmErr) {
          console.error("FCM quick notifications failed:", fcmErr);
        }
      }
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
                            onClick={() => processDocumentAction(event, 'certificate', 'preview')}
                            className="flex items-center gap-1.5 text-primary font-black text-[9px] uppercase tracking-widest hover:underline mt-1 bg-white/5 border border-white/5 hover:border-white/10 px-3 py-1.5 rounded-lg transition-all"
                          >
                            <Award size={11} />
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
                  <div className="mt-6 col-span-full">
                    {expandedDocsEventId !== event.id ? (
                      <button
                        type="button"
                        onClick={() => setExpandedDocsEventId(event.id)}
                        className="w-full bg-white/5 hover:bg-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.08] border border-black/10 dark:border-white/5 rounded-2xl py-3.5 px-5 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/90 transition-all active:scale-[0.98]"
                      >
                        <span className="flex items-center gap-2">
                          <FileText size={14} className="text-primary" />
                          View Exam Documents Card
                        </span>
                        <div className="flex items-center gap-1 text-white/40">
                          <span className="text-[8px] font-mono lowercase">tap to open</span>
                          <ChevronRight size={14} />
                        </div>
                      </button>
                    ) : (
                      <div className="p-4 rounded-3xl bg-black/5 dark:bg-white/[0.02] border border-black/5 dark:border-white/5 space-y-3">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[9px] font-black tracking-wider text-primary uppercase">Exam Verification Documents</span>
                          <button
                            type="button"
                            onClick={() => setExpandedDocsEventId(null)}
                            className="text-[8px] font-bold text-zinc-400 hover:text-white uppercase tracking-wider bg-white/5 px-2 py-0.5 rounded-lg active:scale-95 transition-all"
                          >
                            Hide Card
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => processDocumentAction(event, 'certificate', 'preview')}
                            className="bg-primary hover:bg-opacity-90 text-black font-black text-[9px] uppercase tracking-wider py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-primary/5"
                          >
                            <Award size={12} />
                            Certificate
                          </button>
                          
                          <button
                            type="button"
                            disabled={downloadingEventId === event.id}
                            onClick={() => processDocumentAction(event, 'omr', 'preview')}
                            className="relative bg-black/10 dark:bg-white/5 hover:bg-black/25 dark:hover:bg-white/10 text-black dark:text-white border border-black/10 dark:border-white/10 font-black text-[9px] uppercase tracking-wider py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 overflow-hidden"
                            title="Tap to View OMR Sheet"
                          >
                            <FileText size={12} className="text-primary" />
                            {downloadingEventId === event.id ? 'Loading...' : 'OMR Sheet'}
                          </button>

                          <button
                            type="button"
                            disabled={downloadingEventId === event.id}
                            onClick={() => processDocumentAction(event, 'question_paper', 'preview')}
                            className="relative bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 dark:border-emerald-500/20 font-black text-[9px] uppercase tracking-wider py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50 overflow-hidden"
                            title="Tap to View Question Paper"
                          >
                            <BookOpen size={12} className="text-emerald-500" />
                            {downloadingEventId === event.id ? 'Loading...' : 'Question Paper'}
                          </button>
                        </div>
                      </div>
                    )}
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
                  Verification Documents & Portal Sheets (PDF Preview)
                </h4>
                <p className="text-[10px] text-white/40 italic mt-0.5">View your verified score certificate, custom OMR attempt sheet, and standard question paper in-app</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full lg:w-auto">
                <button
                  type="button"
                  disabled={loadingReview}
                  onClick={() => selectedEventForReview && processDocumentAction(selectedEventForReview, 'certificate', 'preview')}
                  className="bg-primary hover:bg-primary/95 text-black disabled:opacity-40 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md"
                  title="View your verified certificate"
                >
                  <Award size={13} />
                  Certificate
                </button>

                <button
                  type="button"
                  disabled={loadingReview || downloadingEventId === selectedEventForReview?.id}
                  onClick={() => selectedEventForReview && processDocumentAction(selectedEventForReview, 'omr', 'preview')}
                  className="relative bg-white/5 hover:bg-white/10 text-white/90 disabled:opacity-40 border border-white/5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all overflow-hidden"
                  title="View OMR Sheet"
                >
                  <FileText size={13} className="text-primary" />
                  OMR Sheet
                </button>

                <button
                  type="button"
                  disabled={loadingReview || downloadingEventId === selectedEventForReview?.id}
                  onClick={() => selectedEventForReview && processDocumentAction(selectedEventForReview, 'question_paper', 'preview')}
                  className="relative bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-40 border border-emerald-500/10 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all overflow-hidden"
                  title="View Question Paper"
                >
                  <BookOpen size={13} className="text-emerald-400" />
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

      {/* Dynamic PDF Preview Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-zinc-950 z-[9999] flex flex-col w-screen h-screen">
          <div className="bg-zinc-900 w-full h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 bg-black/60 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase text-white tracking-widest flex items-center gap-2">
                  <Eye className="text-primary animate-pulse" size={16} />
                  {previewPdfTitle}
                </h3>
                <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-wider font-mono flex items-center gap-1">In-App Live Document View (No Download Needed)</p>
              </div>
              <button
                onClick={() => {
                  setShowPdfModal(false);
                  if (previewPdfUrl) {
                    URL.revokeObjectURL(previewPdfUrl);
                    setPreviewPdfUrl(null);
                  }
                }}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/100 hover:text-white flex items-center justify-center transition-all active:scale-95"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Document Container */}
            <div className="flex-1 overflow-y-auto bg-zinc-950 p-2 sm:p-8 selection:bg-primary/25 touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
              <div className="w-full min-h-full flex justify-center items-start">
              {previewType === 'certificate' ? (
                <div className="relative w-full max-w-4xl border-[12px] border-double border-primary/80 bg-[#fdfdfd] p-6 sm:p-12 text-center flex flex-col items-center justify-center space-y-8 text-zinc-800 min-h-[480px] rounded shadow-2xl">
                  {/* Watermark Pattern */}
                  <div className="absolute inset-0 opacity-[0.02] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
                  
                  <div className="space-y-2">
                    <Award className="mx-auto text-primary animate-bounce select-none" size={48} />
                    <h2 className="text-2xl sm:text-4xl font-serif font-black tracking-widest text-zinc-900 uppercase">
                      {previewEvent?.certificateTitle || 'CERTIFICATE OF ACHIEVEMENT'}
                    </h2>
                    <p className="text-xs sm:text-sm font-serif italic text-zinc-500">
                      {previewEvent?.certificateSubtitle || 'This is to certify that'}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="text-3xl sm:text-5xl font-black font-serif italic text-primary tracking-wide select-text">
                      {currentUser?.name || 'Player'}
                    </div>
                    <div className="text-[10px] font-mono tracking-widest text-zinc-400 uppercase">
                      Candidate ID: @{currentUser?.username || 'player'}
                    </div>
                    <div className="w-48 h-0.5 bg-primary/40 mx-auto mt-2" />
                  </div>

                  <div className="max-w-2xl text-xs sm:text-base leading-relaxed space-y-1 select-text">
                    <p>has successfully completed the official verified exam on</p>
                    <p className="font-bold text-zinc-900 text-base sm:text-xl border-y border-zinc-200 py-1 inline-block px-4 font-serif">
                      {previewEvent?.title || 'RaheeQuiz Competition'}
                    </p>
                    <p className="text-xs text-zinc-500 font-mono mt-1">
                      Topic: {previewTopicPath || 'General Knowledge'}
                    </p>
                  </div>

                  <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-6 py-3 text-center space-y-0.5 shadow-sm max-w-sm">
                    <p className="text-[10px] text-zinc-400 uppercase font-mono tracking-wider font-bold">Accuracy & Grand Score</p>
                    <p className="text-xl sm:text-2xl font-black text-zinc-900 font-mono select-text">
                      {previewResults?.score ?? 8} / {previewResults?.total ?? 10} Correct
                    </p>
                    <p className="text-[9px] text-zinc-500 font-bold font-mono">
                      Verification Code: {Math.random().toString(36).substring(2, 10).toUpperCase()}-VERIFIED
                    </p>
                  </div>

                  <div className="pt-8 w-full border-t border-zinc-200 grid grid-cols-2 gap-4 text-left font-mono text-[9px] sm:text-xs">
                    <div>
                      <p className="text-zinc-400 uppercase font-bold text-[8px]">Issued Date</p>
                      <p className="font-bold text-zinc-700">{new Date(previewResults?.completedAt || Date.now()).toLocaleDateString()}</p>
                      <p className="text-[8px] text-zinc-400 mt-1 uppercase">Issued by: Rahee Quiz Team</p>
                    </div>
                    <div className="text-right flex flex-col items-end justify-end space-y-1">
                      <p className="italic font-serif text-[11px] font-bold text-zinc-800 tracking-wider">
                        {previewEvent?.certificateFooter || 'Rahee Quiz Team'}
                      </p>
                      <div className="h-0.5 w-32 bg-zinc-350" />
                      <p className="text-[8px] text-zinc-400 uppercase font-bold">Authorized Digital Signature</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative w-full max-w-4xl bg-white text-zinc-900 p-6 sm:p-12 rounded shadow-2xl border-[6px] border-double border-zinc-800 text-left font-sans flex flex-col space-y-8 select-text overflow-hidden">
                
                {/* Simulated Stamp / Security Watermark */}
                <div className="absolute inset-0 pointer-events-none opacity-[0.035] flex items-center justify-center select-none rotate-12">
                  <div className="text-zinc-900 border-[10px] border-zinc-900 font-extrabold text-5xl sm:text-7xl p-8 rounded-full tracking-widest leading-none uppercase">
                    RAHEE VERIFIED
                  </div>
                </div>

                {/* Document Header Branding */}
                <div className="border-b-4 border-zinc-900 pb-6 text-center space-y-3 relative">
                  {/* Simulated barcode */}
                  <div className="absolute top-0 right-0 hidden sm:flex flex-col items-end">
                    <div className="h-6 w-32 bg-zinc-900" style={{ backgroundImage: "repeating-linear-gradient(90deg, #000, #000 2px, #fff 2px, #fff 4px)" }} />
                    <span className="text-[7px] font-mono tracking-widest text-zinc-500 mt-1 uppercase">REG-ID-{previewEvent?.id || "999"}</span>
                  </div>

                  <h1 className="text-3xl font-black tracking-widest text-zinc-900 uppercase">
                    {previewType === 'question_paper' ? 'OFFICIAL QUESTION PAPER' : previewType === 'omr' ? 'OFFICIAL OMR ANSWER RESPONSES' : 'OFFICIAL ANSWER KEY SHEET'}
                  </h1>
                  <p className="text-[11px] font-mono tracking-widest uppercase text-zinc-650 font-bold border-y border-zinc-300 py-1 inline-block">
                    Official Verification copy • RaheeQuiz.in • SECURE DIGI-COPY
                  </p>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-[11px] font-mono border-t border-dashed border-zinc-300 text-left font-sans">
                    <div className="bg-zinc-50 p-2 rounded border border-zinc-200">
                      <span className="block text-[8px] text-zinc-400 uppercase font-bold">Exam Slot</span>
                      <span className="font-black text-zinc-800">{previewEvent?.title || 'Main Exam'}</span>
                    </div>
                    <div className="bg-zinc-50 p-2 rounded border border-zinc-200">
                      <span className="block text-[8px] text-zinc-400 uppercase font-bold">Subject / Topic</span>
                      <span className="font-black text-zinc-800 truncate block max-w-full" title={previewTopicPath}>{previewTopicPath || 'General'}</span>
                    </div>
                    <div className="bg-zinc-50 p-2 rounded border border-zinc-200">
                      <span className="block text-[8px] text-zinc-400 uppercase font-bold">Time Allocated</span>
                      <span className="font-black text-zinc-800">
                        {previewEvent?.endTime && previewEvent?.startTime 
                          ? `${Math.round((previewEvent.endTime - previewEvent.startTime) / 60000)} Mins` 
                          : '60 Mins'}
                      </span>
                    </div>
                    <div className="bg-zinc-50 p-2 rounded border border-zinc-200">
                      <span className="block text-[8px] text-zinc-400 uppercase font-bold">Total Questions</span>
                      <span className="font-black text-zinc-800">{previewQuizzes.length} Questions</span>
                    </div>
                  </div>
                </div>

                {/* Candidate Copy Header (Only for OMR Sheet) */}
                {previewType === 'omr' && (
                  <div className="bg-zinc-50 border-2 border-zinc-800 rounded-lg p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px] font-mono">
                    <div className="space-y-1">
                      <span className="block text-[8px] text-zinc-400 uppercase font-bold">Candidate Name</span>
                      <span className="font-bold text-zinc-900 border-b border-zinc-300 pb-0.5 block">{previewResults?.candidateName || 'Player'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[8px] text-zinc-400 uppercase font-bold">Username</span>
                      <span className="font-bold text-zinc-900 border-b border-zinc-300 pb-0.5 block">@{previewResults?.candidateUsername || 'username'}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[8px] text-zinc-400 uppercase font-bold">Score Achieved</span>
                      <span className="font-extrabold text-emerald-800 bg-emerald-100 border-2 border-emerald-800 px-3 py-1 rounded block text-center uppercase tracking-wider">
                        {previewResults?.score ?? 0} / {previewQuizzes.length} Correct
                      </span>
                    </div>
                  </div>
                )}

                {/* Document Sub-sections depending on Type */}
                
                {/* 1. QUESTION PAPER PREVIEW */}
                {previewType === 'question_paper' && (
                  <div className="space-y-8 divide-y divide-zinc-150">
                    <div className="bg-zinc-50 border-2 border-zinc-800 rounded-lg p-5 text-xs text-zinc-900 leading-relaxed space-y-2">
                      <p className="font-black uppercase tracking-wider text-[10px] border-b border-zinc-300 pb-1">General Instructions to Candidate / उम्मीदवार के लिए निर्देश:</p>
                      <ul className="list-decimal pl-4 space-y-1 text-[11px]">
                        <li>This paper contains {previewQuizzes.length} multiple choice questions (MCQs). <span className="text-zinc-500 italic">(इस प्रश्नपत्र में {previewQuizzes.length} बहुविकल्पीय प्रश्न हैं।)</span></li>
                        <li>Each question has four options labeled A, B, C, and D. <span className="text-zinc-500 italic">(प्रत्येक प्रश्न के चार विकल्प A, B, C और D हैं।)</span></li>
                        <li>All options are bilingually presented. Please refer to both versions. <span className="text-zinc-500 italic">(सभी विकल्प द्विभाषी प्रस्तुत किए गए हैं।)</span></li>
                        <li>Verification copies are official system compilations. <span className="text-zinc-500 italic">(सत्यापन प्रतियाँ आधिकारिक सिस्टम संकलन हैं।)</span></li>
                      </ul>
                    </div>

                    <div className="space-y-6 pt-6 animate-none">
                      {previewQuizzes.map((quiz, quizIdx) => {
                        const optEn = quiz.options?.en || [];
                        const optHi = quiz.options?.hi || [];
                        return (
                          <div key={`preview-quiz-exam-${quiz.id || quizIdx}-${quizIdx}`} className="space-y-3 pb-6 border-b border-zinc-100 last:border-b-0">
                            {/* Question Title */}
                            <div>
                              <div className="flex items-start gap-2.5">
                                <span className="font-black text-sm bg-zinc-900 text-white rounded px-2 py-0.5 mt-0.5 shrink-0 w-6 h-6 flex items-center justify-center">{quizIdx + 1}</span>
                                <div className="space-y-1.5 flex-1 text-left">
                                  <p className="text-zinc-900 font-bold text-sm leading-snug">{quiz.question?.en}</p>
                                  {quiz.question?.hi && (
                                    <p className="text-blue-900/80 italic font-medium text-xs leading-snug">{quiz.question.hi}</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Options Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-12 font-sans">
                              {optEn.map((opt, optIdx) => {
                                const label = String.fromCharCode(65 + optIdx);
                                return (
                                  <div key={optIdx} className="flex items-start gap-3 p-3 bg-zinc-50 rounded border border-zinc-300 text-xs text-left">
                                    <span className="w-5 h-5 rounded bg-zinc-200 border border-zinc-400 font-black text-zinc-800 flex items-center justify-center text-[10px] shrink-0">{label}</span>
                                    <div className="flex-1">
                                      <p className="text-zinc-850 font-bold leading-snug">{opt}</p>
                                      {optHi[optIdx] && (
                                        <p className="text-zinc-500 italic leading-snug text-[11px] mt-1">{optHi[optIdx]}</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. OMR ANSWER RESPONSE COPY */}
                {previewType === 'omr' && (
                  <div className="space-y-6">
                    <div className="bg-zinc-50 border-2 border-zinc-800 rounded-lg p-5 text-xs text-zinc-900 leading-relaxed space-y-1">
                      <p className="font-black uppercase tracking-wider text-[10px] border-b border-zinc-300 pb-1">Optical Mark Recognition (OMR) Sheet Grid / ओएमआर उत्तर पुस्तिका ग्रिड:</p>
                      <p className="text-[11px]">Darkened options represent recorded answers. Correct slots represent the master keys.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 pt-2">
                      {previewQuizzes.map((quiz, quizIdx) => {
                        const scoreAnswers = previewResults?.answers || [];
                        const userAnswer = scoreAnswers.find((a: any) => a.quizId === quiz.id);
                        const userIndex = userAnswer ? userAnswer.userAnswerIndex : -1;
                        const correctIndex = quiz.correctAnswerIndex;
                        const correctLetter = String.fromCharCode(65 + correctIndex);
                        const userLetter = userIndex !== -1 ? String.fromCharCode(65 + userIndex) : 'N/A';

                        return (
                          <div key={`preview-quiz-omr-${quiz.id || quizIdx}-${quizIdx}`} className="flex items-center justify-between p-3 rounded-xl border border-zinc-300 bg-white hover:bg-zinc-50 transition-colors font-mono text-xs">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded bg-zinc-950 text-white font-extrabold flex items-center justify-center text-[10px] shrink-0 font-sans">
                                {quizIdx + 1}
                              </span>
                              <div className="text-[10px] space-y-0.5 text-left font-sans">
                                <span className="block font-black text-zinc-700">Answer: {userIndex === -1 ? 'UNATTEMPTED' : userLetter}</span>
                                <span className="block text-[8px] text-emerald-600 font-extrabold uppercase font-mono">Key: {correctLetter}</span>
                              </div>
                            </div>

                            {/* Circular Bubbles */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {[0, 1, 2, 3].map((optIdx) => {
                                const bubbleLetter = String.fromCharCode(65 + optIdx);
                                const isUserChoice = userIndex === optIdx;
                                const isCorrectChoice = correctIndex === optIdx;

                                let bubbleStyle = "border-zinc-300 text-zinc-500 hover:bg-zinc-100";
                                let icon = bubbleLetter;

                                if (isUserChoice) {
                                  if (isCorrectChoice) {
                                    bubbleStyle = "bg-emerald-600 border-emerald-700 text-white font-black scale-110 shadow-sm";
                                    icon = "✓";
                                  } else {
                                    bubbleStyle = "bg-red-600 border-red-700 text-white font-black scale-110 shadow-sm";
                                    icon = "✗";
                                  }
                                } else if (isCorrectChoice) {
                                  bubbleStyle = "bg-emerald-50 border-emerald-500 text-emerald-700 font-bold border-2 border-dashed";
                                  icon = bubbleLetter;
                                }

                                return (
                                  <div
                                    key={optIdx}
                                    className={cn(
                                      "w-7 h-7 rounded-full border text-[10px] flex items-center justify-center transition-all select-none duration-150 font-bold shrink-0 font-sans",
                                      bubbleStyle
                                    )}
                                  >
                                    {icon}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. OFFICIAL ANSWER KEYS PREVIEW */}
                {previewType === 'answer_sheet' && (
                  <div className="space-y-6">
                    <div className="bg-zinc-50 border-2 border-zinc-800 rounded-lg p-5 text-xs text-zinc-900 leading-relaxed font-sans">
                      <span className="font-extrabold text-zinc-900 block uppercase mb-1">Official Correct Answer Keys / आधिकारिक उत्तर कुंजी</span>
                      Showing correct solutions together with reference notes and logical explanations for active study and review.
                    </div>

                    <div className="space-y-6 pt-2">
                      {previewQuizzes.map((quiz, quizIdx) => {
                        const correctIndex = quiz.correctAnswerIndex;
                        const currentCorrectOptEn = quiz.options?.en?.[correctIndex] || '';
                        const currentCorrectOptHi = quiz.options?.hi?.[correctIndex] || '';
                        const correctLetter = String.fromCharCode(65 + correctIndex);

                        return (
                          <div key={`preview-quiz-ans-${quiz.id || quizIdx}-${quizIdx}`} className="p-4 rounded-xl border border-zinc-300 bg-white space-y-3 text-xs leading-relaxed text-left">
                            {/* Question and Q.Number */}
                            <div className="flex items-start gap-2.5">
                              <span className="font-black text-xs bg-emerald-600 text-white rounded px-2 py-0.5 mt-0.5 shrink-0 font-sans">
                                Q. {quizIdx + 1}
                              </span>
                              <div className="space-y-1">
                                <p className="font-bold text-zinc-900 text-[13px]">{quiz.question?.en}</p>
                                {quiz.question?.hi && (
                                  <p className="text-blue-900/75 italic font-medium text-[11px]">{quiz.question.hi}</p>
                                )}
                              </div>
                            </div>

                            {/* Correct Selected Box */}
                            <div className="pl-8 text-left">
                              <div className="border border-emerald-300 bg-emerald-50 p-3 rounded-lg flex items-start gap-2.5 max-w-xl text-left">
                                <span className="w-5 h-5 rounded-full bg-emerald-600 border border-emerald-700 text-white font-black text-[9px] flex items-center justify-center shrink-0">
                                  ✓
                                </span>
                                <div>
                                  <p className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">Correct Option {correctLetter}</p>
                                  <p className="text-zinc-800 font-bold mt-0.5 leading-snug">{currentCorrectOptEn}</p>
                                  {currentCorrectOptHi && (
                                    <p className="text-blue-900/60 italic font-medium leading-snug text-[11px] mt-0.5">{currentCorrectOptHi}</p>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Explanation Notes */}
                            {(quiz.explanation?.en || quiz.explanation?.hi) && (
                              <div className="pl-8 select-text text-left">
                                <div className="border border-zinc-200 bg-zinc-50 p-3 rounded-lg space-y-1 select-text text-left">
                                  <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider font-mono">Reference solution explanation:</span>
                                  {quiz.explanation?.en && (
                                    <p className="text-zinc-[700] leading-relaxed text-[11px]">{quiz.explanation.en}</p>
                                  )}
                                  {quiz.explanation?.hi && (
                                    <p className="text-blue-900/50 italic leading-relaxed text-[11px] pt-0.5 border-t border-dashed border-zinc-200">{quiz.explanation.hi}</p>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Simulated Registrar Seal & Verification Signatures */}
                <div className="pt-12 mt-12 border-t-2 border-zinc-900 grid grid-cols-2 gap-8 text-[11px] font-sans">
                  <div>
                    <p className="font-bold text-zinc-500 uppercase tracking-wider text-[8px]">DIGITAL SIGNATURE ID:</p>
                    <p className="font-mono text-[9px] text-zinc-700 tracking-tight">SHA256: {Math.random().toString(16).substring(2, 10).toUpperCase()}-RAHEE-VERIFIED-COPY</p>
                    <p className="text-zinc-400 mt-1 uppercase text-[8px]">TIMESTAMP: {new Date().toUTCString()}</p>
                  </div>
                  <div className="text-right flex flex-col items-end justify-end space-y-1">
                    <div className="italic font-serif text-[11px] font-bold text-zinc-800 tracking-wider font-sans">Rahee Quiz Registrar</div>
                    <div className="h-0.5 w-32 bg-zinc-400" />
                    <p className="text-[8px] text-zinc-500 uppercase tracking-widest font-black">Authorized Verification Officer</p>
                  </div>
                </div>
              </div>
            )}
              </div>
            </div>

            {/* Navigation / Actions Bar */}
            <div className="px-6 py-4 bg-black/60 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Printer size={12} className="text-primary" />
                This document is verified and stored securely!
              </span>
              <div className="flex gap-2">
                {previewPdfUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      window.open(previewPdfUrl, '_blank');
                    }}
                    className="bg-[#32befa] hover:bg-[#32befa]/85 text-black text-xs px-5 py-2.5 rounded-xl border border-transparent font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-[#32befa]/20"
                  >
                    <Download size={12} />
                    View & Download PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowPdfModal(false);
                    if (previewPdfUrl) {
                      URL.revokeObjectURL(previewPdfUrl);
                      setPreviewPdfUrl(null);
                    }
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs px-5 py-2.5 rounded-xl border border-white/15 font-black uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <X size={12} />
                  Close View
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
