import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, Trophy, ChevronRight, AlertCircle, CheckCircle, Download } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { db } from '../firebase/config';
import { ref, onValue, update } from 'firebase/database';
import { Event, Topic } from '../types';
import { translations } from '../translations';
import { cn } from '../lib/utils';
import QuizScreen from './QuizScreen';
import { generateCertificate } from '../utils/certificate';

export default function Events() {
  const [events, setEvents] = useState<Event[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [activeEventQuiz, setActiveEventQuiz] = useState<Event | null>(null);
  const { currentUser } = useUser();
  const lang = currentUser?.language || 'en';
  const t = translations[lang] || translations.en;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const eventsRef = ref(db, 'events');
    const unsubscribeEvents = onValue(eventsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const eventList = Object.entries(data).map(([id, val]: [string, any]) => ({ ...val, id })) as Event[];
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
    const result = event.results?.[currentUser.id];
    if (!result) return;

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

  if (activeEventQuiz) {
    return (
      <QuizScreen 
        onClose={() => setActiveEventQuiz(null)} 
        eventId={activeEventQuiz.id}
        topicId={activeEventQuiz.topicId}
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
          events.map((event) => {
            const status = getStatus(event);
            const isJoined = event.participants?.[currentUser?.id || ''];
            const result = event.results?.[currentUser?.id || ''];
            
            return (
              <motion.div
                key={event.id}
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
                       isJoined ? (
                         <div className="flex flex-col items-end gap-2">
                           <div className="bg-black/10 dark:bg-white/10 text-black dark:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase">
                             Your Score: {result?.score || 0}/{result?.total || 0}
                           </div>
                           {result && (
                              <button 
                                onClick={() => handleDownloadCertificate(event)}
                                className="flex items-center gap-2 text-primary font-black text-[10px] uppercase tracking-widest hover:underline"
                              >
                                <Download size={14} />
                                Certificate
                              </button>
                           )}
                         </div>
                       ) : (
                         <span className="text-[10px] font-black uppercase text-black/20 dark:text-white/20">Ended</span>
                       )
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
    </div>
  );
}
