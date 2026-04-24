import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue, set, push, remove, get, update } from 'firebase/database';
import { User, Topic, Quiz, Feedback, QuizHistory } from '../types';
import ScoreCard from './ScoreCard';
import { Shield, Users, HelpCircle, FileText, Bot, Plus, Trash2, CheckCircle, XCircle, Upload, MessageSquare, Info, Palette, ChevronRight, History as HistoryIcon, Clock, AlertTriangle, Menu, X as CloseIcon, Edit2, Coins } from 'lucide-react';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { SKINS } from '../types';

export default function AdminPanel() {
  const [activeSubTab, setActiveSubTab] = useState('users');
  const [users, setUsers] = useState<User[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [currentSkin, setCurrentSkin] = useState('rahee');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userHistory, setUserHistory] = useState<QuizHistory[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editName, setEditName] = useState('');
  const [editId, setEditId] = useState('');
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  
  // Create state
  const [newTopicName, setNewTopicName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [newQuiz, setNewQuiz] = useState({
    questionEn: '', questionHi: '',
    opt1En: '', opt1Hi: '',
    opt2En: '', opt2Hi: '',
    opt3En: '', opt3Hi: '',
    opt4En: '', opt4Hi: '',
    correct: 1, topicId: '',
    explanationEn: '', explanationHi: ''
  });

  useEffect(() => {
    onValue(ref(db, 'users'), s => {
      if (s.exists()) {
        const data = s.val();
        setUsers(Object.entries(data).map(([key, val]: [string, any]) => ({ ...val, id: key })));
      }
    });
    onValue(ref(db, 'topics'), s => {
      if (s.exists()) {
        const data = s.val();
        setTopics(Object.entries(data).map(([key, val]: [string, any]) => ({ ...val, id: key })));
      }
    });
    
    // Fetch all quizzes from all topics for admin panel listing
    onValue(ref(db, 'topicQuizzes'), s => {
      if (s.exists()) {
        const allTopicsData = s.val();
        let flatQuizzes: Quiz[] = [];
        Object.values(allTopicsData).forEach((topicData: any) => {
          flatQuizzes = [...flatQuizzes, ...(Object.values(topicData) as Quiz[])];
        });
        setQuizzes(flatQuizzes);
      }
    });

    onValue(ref(db, 'feedback'), s => {
      if (s.exists()) {
        const data = s.val();
        setFeedback(Object.entries(data).map(([key, val]: [string, any]) => ({ ...val, id: key })));
      }
    });
    onValue(ref(db, 'settings/activeSkin'), s => s.exists() && setCurrentSkin(s.val()));
  }, []);

  const getUserRank = (userId: string) => {
    const sorted = [...users].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const index = sorted.findIndex(u => u.id === userId);
    return index !== -1 ? index + 1 : '-';
  };

  useEffect(() => {
    if (selectedUser) {
      const historyRef = ref(db, 'history');
      const unsubscribe = onValue(historyRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const mapped = Object.entries(data)
            .map(([key, val]: [string, any]) => ({ ...val, id: key }))
            .filter((h: any) => h.userId === selectedUser.id);
          setUserHistory(mapped.sort((a: any, b: any) => b.timestamp - a.timestamp));
        } else {
          setUserHistory([]);
        }
      });
      return () => unsubscribe();
    } else {
      setUserHistory([]);
    }
  }, [selectedUser]);

  const deleteHistoryItem = async (historyId: string) => {
    if (!historyId) return;
    if (!confirm("Delete this history entry?")) return;
    try {
      await remove(ref(db, `history/${historyId}`));
    } catch (error) {
      console.error("Failed to delete history item:", error);
      alert('Failed to delete history item.');
    }
  };

  const clearUserHistory = async (userId: string) => {
    if (!confirm("Are you sure you want to delete ALL history for this player? This cannot be undone.")) return;
    
    try {
      const historyRef = ref(db, 'history');
      const snapshot = await get(historyRef);
      if (snapshot.exists()) {
        const data = snapshot.val();
        const updates: any = {};
        Object.entries(data).forEach(([key, val]: [string, any]) => {
          if (val.userId === userId) {
            updates[key] = null;
          }
        });
        
        if (Object.keys(updates).length > 0) {
          await update(historyRef, updates);
          alert('Player history cleared!');
        } else {
          alert('No history found to clear.');
        }
      }
    } catch (error) {
      console.error("Failed to clear history:", error);
      alert('Failed to clear player history.');
    }
  };

  const changeUserStatus = async (userId: string, status: any) => {
    await set(ref(db, `users/${userId}/status`), status);
  };

  const deleteUser = async (userId: string) => {
    await remove(ref(db, `users/${userId}`));
    if (selectedUser?.id === userId) setSelectedUser(null);
  };

  const addTopic = async () => {
    if (!newTopicName) return;
    const id = newTopicName.toLowerCase().replace(/\s+/g, '_');
    await set(ref(db, `topics/${id}`), { id, name: newTopicName });
    setNewTopicName('');
  };

  const getNextQuizId = () => {
    const numericIds = quizzes
      .map(q => parseInt(q.id))
      .filter(id => !isNaN(id));
    return numericIds.length > 0 ? (Math.max(...numericIds) + 1).toString() : "1";
  };

  const reindexQuizzes = async () => {
    if (!confirm("This will permanently rename all Quiz IDs to 1, 2, 3... Proceed?")) return;
    
    try {
      const allQuizzes = [...quizzes];
      const updates: any = {};
      const newQuizzes: { [key: string]: Quiz } = {};
      
      allQuizzes.forEach((q, index) => {
        const newId = (index + 1).toString();
        const updatedQuiz = { ...q, id: newId };
        newQuizzes[newId] = updatedQuiz;
      });

      // We overwrite the entire quizzes node to ensure clean numeric IDs
      await set(ref(db, 'quizzes'), newQuizzes);
      alert("Quizzes re-indexed successfully to sequential numbers!");
    } catch (error) {
      console.error("Re-index failed:", error);
      alert("Failed to re-index quizzes.");
    }
  };

  const addQuiz = async () => {
    let quizId: string;
    if (editingQuizId) {
      quizId = editingQuizId;
    } else {
      quizId = getNextQuizId();
    }

    const quiz: Quiz = {
      id: quizId,
      topicId: newQuiz.topicId || topics[0]?.id,
      question: { en: newQuiz.questionEn, hi: newQuiz.questionHi },
      options: {
        en: [newQuiz.opt1En, newQuiz.opt2En, newQuiz.opt3En, newQuiz.opt4En].filter(o => o),
        hi: [newQuiz.opt1Hi, newQuiz.opt2Hi, newQuiz.opt3Hi, newQuiz.opt4Hi].filter(o => o)
      },
      correctAnswerIndex: newQuiz.correct - 1,
      explanation: { en: newQuiz.explanationEn, hi: newQuiz.explanationHi }
    };
    await set(ref(db, `topicQuizzes/${quiz.topicId}/${quizId}`), quiz);
    setNewQuiz({
      questionEn: '', questionHi: '',
      opt1En: '', opt1Hi: '',
      opt2En: '', opt2Hi: '',
      opt3En: '', opt3Hi: '',
      opt4En: '', opt4Hi: '',
      correct: 1, topicId: '',
      explanationEn: '', explanationHi: ''
    });
    setEditingQuizId(null);
    if (editingQuizId) alert('Quiz updated!');
  };

  const editQuizInForm = (q: Quiz) => {
    setNewQuiz({
      questionEn: q.question?.en || '',
      questionHi: q.question?.hi || '',
      opt1En: q.options?.en?.[0] || '',
      opt1Hi: q.options?.hi?.[0] || '',
      opt2En: q.options?.en?.[1] || '',
      opt2Hi: q.options?.hi?.[1] || '',
      opt3En: q.options?.en?.[2] || '',
      opt3Hi: q.options?.hi?.[2] || '',
      opt4En: q.options?.en?.[3] || '',
      opt4Hi: q.options?.hi?.[3] || '',
      correct: q.correctAnswerIndex + 1,
      topicId: q.topicId,
      explanationEn: q.explanation?.en || '',
      explanationHi: q.explanation?.hi || ''
    });
    setEditingQuizId(q.id);
    // Scroll to form for convenience on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadAllForBulkEdit = () => {
    const csvContent = quizzes.map(q => {
      return `${q.id}, ${q.question?.en || ''}, ${q.question?.hi || ''}, ${q.options?.en?.[0] || ''}, ${q.options?.hi?.[0] || ''}, ${q.options?.en?.[1] || ''}, ${q.options?.hi?.[1] || ''}, ${q.options?.en?.[2] || ''}, ${q.options?.hi?.[2] || ''}, ${q.options?.en?.[3] || ''}, ${q.options?.hi?.[3] || ''}, ${q.correctAnswerIndex + 1}, ${q.topicId}`;
    }).join('\n');
    setBulkText(csvContent);
    alert('Loaded all quizzes into text area for editing. IMPORTANT: Include ID as the first column for updates.');
  };

  const addBulkQuizzes = async () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split('\n');
    let count = 0;
    
    // Get current max ID to start incrementing from if needed
    let lastIdNum = quizzes
      .map(q => parseInt(q.id))
      .filter(id => !isNaN(id))
      .reduce((max, id) => Math.max(max, id), 0);

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(',').map(p => p.trim());
      
      // Handle both new (14 parts with explanations) and existing (15 parts: first is ID)
      if (parts.length >= 12) {
        let id, qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, expEn, expHi;
        
        if (parts.length >= 13) {
          [id, qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, expEn, expHi] = parts;
        } else {
          [qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, expEn, expHi] = parts;
          lastIdNum++;
          id = lastIdNum.toString();
        }

        const quiz: Quiz = {
          id: id.toString(),
          question: { en: qEn || '', hi: qHi || qEn || '' },
          options: {
            en: [o1En, o2En, o3En, o4En].filter(o => o),
            hi: [o1Hi || o1En, o2Hi || o2En, o3Hi || o3En, o4Hi || o4En].filter(o => o)
          },
          correctAnswerIndex: (parseInt(corr) || 1) - 1,
          topicId: topic || topics[0]?.id || 'general',
          explanation: { 
            en: expEn || '', 
            hi: expHi || expEn || '' 
          }
        };
        await set(ref(db, `topicQuizzes/${quiz.topicId}/${id}`), quiz);
        count++;
      }
    }
    setBulkText('');
    alert(`Successfully processed ${count} quizzes!`);
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'quizzes' | 'bots') => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        if (type === 'quizzes') {
          let lastIdNum = quizzes
            .map(q => parseInt(q.id))
            .filter(id => !isNaN(id))
            .reduce((max, id) => Math.max(max, id), 0);

          for (const row of results.data as any[]) {
             if (!row.questionEn && !row.QuestionEn && !row.question && !row.Question) continue;
             let id;
             if (row.id) {
               id = row.id;
             } else {
               lastIdNum++;
               id = lastIdNum.toString();
             }
             const quiz: Quiz = {
               id,
               topicId: row.topicId || row.TopicId || (topics[0]?.id || 'general'),
               question: { 
                 en: row.questionEn || row.QuestionEn || row.question || row.Question || '', 
                 hi: row.questionHi || row.QuestionHi || row.questionEn || row.QuestionEn || row.question || row.Question || '' 
               },
               options: {
                en: [
                  row.opt1En || row.Opt1En || row.option1 || row.Option1, 
                  row.opt2En || row.Opt2En || row.option2 || row.Option2, 
                  row.opt3En || row.Opt3En || row.option3 || row.Option3, 
                  row.opt4En || row.Opt4En || row.option4 || row.Option4
                ].filter(o => o),
                hi: [
                  row.opt1Hi || row.Opt1Hi || row.opt1En || row.Opt1En || row.option1 || row.Option1, 
                  row.opt2Hi || row.Opt2Hi || row.opt2En || row.Opt2En || row.option2 || row.Option2, 
                  row.opt3Hi || row.Opt3Hi || row.opt3En || row.Opt3En || row.option3 || row.Option3, 
                  row.opt4Hi || row.Opt4Hi || row.opt4En || row.Opt4En || row.option4 || row.Option4
                ].filter(o => o)
               },
               correctAnswerIndex: (parseInt(row.correct || row.Correct || row.answer || row.Answer) || 1) - 1,
               explanation: { 
                 en: row.explanationEn || row.ExplanationEn || row.explanation || row.Explanation || row.expEn || row.ExpEn || row.exp || row.Exp || '', 
                 hi: row.explanationHi || row.ExplanationHi || row.explanation || row.Explanation || row.expHi || row.ExpHi || row.exp || row.Exp || '' 
               }
             };
             await set(ref(db, `topicQuizzes/${quiz.topicId}/${id}`), quiz);
          }
        } else {
          for (const row of results.data as any[]) {
            if (!row.name) continue;
            const bRef = push(ref(db, 'users'));
            const bot: User = {
              id: bRef.key || '',
              name: row.name,
              username: (row.name || '').toLowerCase().replace(/\s+/g, '_'),
              role: 'user',
              status: 'approved',
              isBot: true,
              xp: parseInt(row.xp) || 0,
              rank: Math.floor((parseInt(row.xp) || 0) / 1600) + 1,
              currentRound: 1,
              currentQuizIndex: 0,
              selectedTopicId: 'general',
              language: 'en',
              raheeCoins: 0,
              lifelines: {
                'fiftyFifty': 0,
                'changeQuiz': 0
              },
              scores: {}
            };
            await set(bRef, bot);
          }
        }
        alert(`Imported ${results.data.length} items`);
      }
    });
  };

  const allowExtraTries = async (userId: string) => {
    await set(ref(db, `users/${userId}/extraTriesAllowed`), true);
    await set(ref(db, `users/${userId}/extraTriesRequested`), false);
    await set(ref(db, `users/${userId}/currentRound`), 1);
    await set(ref(db, `users/${userId}/currentQuizIndex`), 0);
  };

  const fullResetPlayer = async (userId: string) => {
    if (!confirm("Are you sure? This will reset ALL stats (XP, Rank, Round, Progress) to zero. This cannot be undone.")) return;
    await update(ref(db, `users/${userId}`), {
      xp: 0,
      rank: 1,
      currentRound: 1,
      currentQuizIndex: 0,
      scores: {}
    });
    alert('Player data fully reset!');
  };

  const renameUser = async (u: User, newName: string, newId: string) => {
    if (!newName || !newId) return;
    const cleanId = newId.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    
    if (cleanId !== u.id && users.some(user => user.id === cleanId)) {
        alert('This ID is already taken');
        return;
    }

    const updatedUser = { ...u, name: newName, id: cleanId };

    if (cleanId === u.id) {
        await set(ref(db, `users/${u.id}/name`), newName);
    } else {
        await set(ref(db, `users/${cleanId}`), updatedUser);
        await remove(ref(db, `users/${u.id}`));
        
        // Update history references
        const historySnapshot = await get(ref(db, 'history'));
        if (historySnapshot.exists()) {
            const historyData = historySnapshot.val();
            for (const key in historyData) {
                if (historyData[key].userId === u.id) {
                    await set(ref(db, `history/${key}/userId`), cleanId);
                }
            }
        }
    }
    
    setSelectedUser(null);
    alert('User updated successfully');
  };

  const exportQuizzesCsv = () => {
    if (quizzes.length === 0) return alert('No quizzes to export');

    const csvData = quizzes.map(q => ({
      id: q.id,
      questionEn: q.question?.en || '',
      questionHi: q.question?.hi || '',
      opt1En: q.options?.en?.[0] || '',
      opt1Hi: q.options?.hi?.[0] || '',
      opt2En: q.options?.en?.[1] || '',
      opt2Hi: q.options?.hi?.[1] || '',
      opt3En: q.options?.en?.[2] || '',
      opt3Hi: q.options?.hi?.[2] || '',
      opt4En: q.options?.en?.[3] || '',
      opt4Hi: q.options?.hi?.[3] || '',
      correct: q.correctAnswerIndex + 1,
      topicId: q.topicId,
      explanationEn: q.explanation?.en || '',
      explanationHi: q.explanation?.hi || ''
    }));

    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `rahee_quizzes_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const setGlobalSkin = async (skinId: string) => {
    await set(ref(db, 'settings/activeSkin'), skinId);
  };

  const renderUserProfile = (u: User) => {
     // Group history by round
     const groupedHistory: { [round: number]: QuizHistory[] } = {};
     userHistory.forEach((h, idx) => {
        // Since it's stored by timestamp, we'll just group every 16 or use chronological order
        // A better way is to use the rank/progress at the time, but for now let's use the current round logic
        // Or just show it as is but with a "Show All" toggle
        const roundNum = Math.floor(idx / 16) + 1; // This is naive, let's just group them if we had metadata
        // For now, let's just use a topic filter as requested
     });

     const filteredHistory = historyFilter === 'all' 
        ? userHistory 
        : userHistory.filter(h => {
          const q = quizzes.find(quiz => quiz.id === h.quizId);
          return q?.topicId === historyFilter;
        });

     return (
       <div className="space-y-6">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-4">
                <button onClick={() => { setSelectedUser(null); setIsEditingUser(false); }} className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-[10px]">
                   <ChevronRight className="rotate-180" size={16} />
                   Back to Players
                </button>
                {!isEditingUser && (
                   <button 
                     onClick={() => {
                       setIsEditingUser(true);
                       setEditName(u.name || '');
                       setEditId(u.id || '');
                     }}
                     className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white/60 font-black uppercase tracking-widest text-[8px] hover:bg-white/10 transition-all"
                   >
                     Edit Profile
                   </button>
                )}
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => allowExtraTries(u.id)}
                  className="px-4 py-2 bg-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all"
                >
                  Reset Time & Progress
                </button>
                <button onClick={() => deleteUser(u.id)} className="p-2 bg-red-500/20 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                  <Trash2 size={20} />
                </button>
             </div>
          </div>

          <div className="bg-black/40 border border-white/5 p-8 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-8">
             <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center text-primary text-4xl font-black">
                {u.name?.[0] || '?'}
             </div>
             <div className="flex-1 text-center md:text-left w-full">
                {isEditingUser ? (
                   <div className="space-y-4 max-w-md mx-auto md:mx-0">
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-white/30 ml-2">Full Name</label>
                         <input 
                           value={editName}
                           onChange={(e) => {
                             setEditName(e.target.value);
                             // Auto-sync ID if it hasn't been manually diverged much
                             setEditId(e.target.value.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, ''));
                           }}
                           className="w-full bg-black border border-white/10 rounded-2xl p-4 text-white font-bold outline-none focus:border-primary transition-all"
                           placeholder="Full Name"
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-white/30 ml-2">Username (ID)</label>
                         <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-black">@</span>
                            <input 
                              value={editId}
                              onChange={(e) => setEditId(e.target.value)}
                              className="w-full bg-black border border-white/10 rounded-2xl p-4 pl-10 text-white font-bold outline-none focus:border-primary transition-all"
                              placeholder="username"
                            />
                         </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                         <button 
                           onClick={() => renameUser(u, editName, editId)}
                           className="flex-1 bg-primary text-black font-black uppercase tracking-widest text-xs py-4 rounded-2xl hover:opacity-90 transition-all"
                         >
                           Save Changes
                         </button>
                         <button 
                           onClick={() => setIsEditingUser(false)}
                           className="flex-1 bg-white/5 text-white/60 font-black uppercase tracking-widest text-xs py-4 rounded-2xl hover:bg-white/10 transition-all"
                         >
                           Cancel
                         </button>
                      </div>
                   </div>
                ) : (
                   <>
                      <h3 className="text-3xl font-black mb-1 uppercase tracking-tighter">{u.name}</h3>
                      <p className="text-white/40 font-bold uppercase tracking-widest text-xs mb-4">Player ID: @{u.id}</p>
                      <div className="flex flex-wrap justify-center md:justify-start gap-3">
                         <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-[10px] text-white/30 uppercase font-black">Global Rank</p>
                            <p className="font-black text-primary">RANK #{getUserRank(u.id)}</p>
                         </div>
                         <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-[10px] text-white/30 uppercase font-black">Experience</p>
                            <p className="font-black text-primary">{u.xp} XP</p>
                         </div>
                         <div className="px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                            <p className="text-[10px] text-white/30 uppercase font-black">Progression</p>
                            <p className="font-black text-primary">ROUND {u.currentRound} • Q{u.currentQuizIndex}</p>
                         </div>
                      </div>
                   </>
                )}
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 bg-[#111] p-6 rounded-[2.5rem] border border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <h4 className="font-black text-sm uppercase tracking-widest flex items-center gap-2">
                       <HistoryIcon size={18} className="text-primary" />
                       Quiz History
                    </h4>
                    {userHistory.length > 0 && (
                      <button 
                        onClick={() => clearUserHistory(u.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5 active:scale-95"
                      >
                        <Trash2 size={12} />
                        Clear All
                      </button>
                    )}
                  </div>
                  <select 
                    value={historyFilter}
                    onChange={(e) => setHistoryFilter(e.target.value)}
                    className="bg-black border border-white/10 rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-widest outline-none text-white/60"
                  >
                    <option value="all">All Topics</option>
                    {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                
                <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
                   {filteredHistory.length === 0 ? (
                      <p className="text-center p-8 text-white/10 italic">No matching history</p>
                   ) : (
                      (() => {
                         const rounds: { [key: number]: QuizHistory[] } = {};
                         filteredHistory.forEach((h, idx) => {
                            const round = Math.floor((filteredHistory.length - 1 - idx) / 16) + 1;
                            if (!rounds[round]) rounds[round] = [];
                            rounds[round].push(h);
                         });
                         
                         return Object.keys(rounds).sort((a, b) => Number(b) - Number(a)).map(round => (
                            <div key={round} className="space-y-2">
                               <div className="flex items-center gap-2 px-1">
                                  <div className="h-[1px] flex-1 bg-white/5" />
                                  <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Round {round}</span>
                                  <div className="h-[1px] flex-1 bg-white/5" />
                               </div>
                               {rounds[Number(round)].map((h) => {
                                  const quiz = quizzes.find(q => q.id === h.quizId);
                                  const historyKey = h.id || `hist-${h.timestamp}-${h.quizId}`;
                                  return (
                                     <div key={historyKey} className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-white/5 transition-all group">
                                        <div>
                                           <div className="flex items-center gap-2 mb-1">
                                             <p className="text-[8px] font-black text-primary uppercase px-1.5 py-0.5 bg-primary/10 rounded">{quiz?.topicId || 'Unknown'}</p>
                                             <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest">{new Date(h.timestamp).toLocaleString()}</p>
                                           </div>
                                           <p className="font-bold text-xs truncate max-w-[200px] sm:max-w-[400px]">{quiz?.question?.en || 'Deleted Quiz'}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-4">
                                            <button 
                                              onClick={() => deleteHistoryItem(h.id)}
                                              className="p-2 text-white/10 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                              <Trash2 size={16} />
                                            </button>
                                            <div className={cn(
                                              "w-10 h-10 rounded-2xl flex items-center justify-center",
                                              h.isCorrect ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                                            )}>
                                               {h.isCorrect ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                            </div>
                                         </div>
                                     </div>
                                  );
                               })}
                            </div>
                         ));
                      })()
                   )}
                </div>
             </div>

             <div className="space-y-6">
                <ScoreCard 
                  user={u} 
                  isAdminView 
                  totalQuizzesCount={quizzes.length}
                  onClose={() => setSelectedUser(null)} 
                />
                <div className="bg-[#111] p-6 rounded-[2.5rem] border border-white/5">
                   <h4 className="font-black text-sm uppercase tracking-widest mb-6">Account Controls</h4>
                   <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-white/20 uppercase mb-3 ml-1">Current Status</p>
                        <div className="flex items-center justify-between p-4 bg-black rounded-2xl border border-white/5">
                           <span className="text-white/40 text-[10px] font-black uppercase tracking-widest">Status</span>
                           <span className={cn(
                             "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded",
                             u.status === 'approved' ? "bg-green-500/10 text-green-500" : 
                             u.status === 'pending' ? "bg-yellow-500/10 text-yellow-500" :
                             "bg-red-500/10 text-red-500"
                           )}>{u.status}</span>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-white/20 uppercase mb-3 ml-1">Update Access</p>
                        <div className="grid grid-cols-2 gap-2">
                           <button 
                             onClick={() => changeUserStatus(u.id, u.status === 'approved' ? 'pending' : 'approved')}
                             className={cn(
                               "px-3 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
                               u.status === 'approved' ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : "bg-green-500 text-black"
                             )}
                           >
                             {u.status === 'approved' ? 'Suspend' : 'Approve'}
                           </button>
                           <select 
                             onChange={(e) => changeUserStatus(u.id, e.target.value as any)}
                             className="bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-widest outline-none appearance-none text-center cursor-pointer hover:bg-red-500/20"
                             value={u.status}
                           >
                             <option value="" disabled>Restrict</option>
                             <option value="banned">Ban User</option>
                             <option value="revoked">Revoke Access</option>
                             <option value="rejected">Reject</option>
                           </select>
                        </div>
                      </div>

                      {u.extraTriesRequested && (
                         <div className="p-4 bg-primary/10 border border-primary/20 rounded-2xl">
                            <p className="text-primary text-[10px] font-black uppercase flex items-center gap-2 mb-3">
                               <AlertTriangle size={14} />
                               Requesting Reset
                            </p>
                            <button onClick={() => allowExtraTries(u.id)} className="w-full bg-primary text-black py-3 rounded-xl font-black uppercase text-[10px] tracking-widest">Grant Reset</button>
                         </div>
                      )}

                      <div className="pt-2 border-t border-white/5 mt-4">
                         <button 
                           onClick={() => fullResetPlayer(u.id)}
                           className="w-full bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                         >
                           Master Reset (XP & Stats)
                         </button>
                      </div>
                   </div>
                </div>

                <div className="bg-[#111] p-6 rounded-[2.5rem] border border-white/5 mt-6">
                   <h4 className="font-black text-sm uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Shield size={18} className="text-primary" />
                      Experience & Rank
                   </h4>
                   <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-white/20 uppercase mb-1 ml-1">Total XP</p>
                           <input 
                              type="number"
                              defaultValue={u.xp ?? 0}
                              key={`xp-${u.id}-${u.xp}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== u.xp) {
                                    await update(ref(db, `users/${u.id}`), { xp: val });
                                 }
                              }}
                              className="w-full bg-black border border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-white/20 uppercase mb-1 ml-1">Current Rank</p>
                           <input 
                              type="number"
                              defaultValue={u.rank ?? 1}
                              key={`rank-${u.id}-${u.rank}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== u.rank) {
                                    await update(ref(db, `users/${u.id}`), { rank: val });
                                 }
                              }}
                              className="w-full bg-black border border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                      </div>
                      <p className="text-[8px] text-white/20 uppercase font-bold tracking-[0.2em] mt-1 ml-2 italic">Changes save automatically on exit</p>
                   </div>
                </div>

                <div className="bg-[#111] p-6 rounded-[2.5rem] border border-white/5 mt-6">
                   <h4 className="font-black text-sm uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Edit2 size={18} className="text-primary" />
                      Progression Editor
                   </h4>
                   <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-white/20 uppercase mb-1 ml-1">Current Round</p>
                           <input 
                              type="number"
                              defaultValue={u.currentRound ?? 1}
                              key={`round-${u.id}-${u.currentRound}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== u.currentRound) {
                                    await update(ref(db, `users/${u.id}`), { currentRound: val });
                                 }
                              }}
                              className="w-full bg-black border border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-white/20 uppercase mb-1 ml-1">Quiz Index</p>
                           <input 
                              type="number"
                              defaultValue={u.currentQuizIndex ?? 0}
                              key={`index-${u.id}-${u.currentQuizIndex}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== u.currentQuizIndex) {
                                    await update(ref(db, `users/${u.id}`), { currentQuizIndex: val });
                                 }
                              }}
                              className="w-full bg-black border border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                      </div>
                      <p className="text-[8px] text-white/20 uppercase font-bold tracking-[0.2em] mt-1 ml-2 italic">Changes save automatically on exit</p>
                   </div>
                </div>

                <div className="bg-[#111] p-6 rounded-[2.5rem] border border-white/5 mt-6">
                   <h4 className="font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
                      <Coins size={18} className="text-primary italic" />
                      Economy & Lifelines
                   </h4>
                   <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-white/20 uppercase mb-1 ml-1">Rahee Coins</p>
                           <input 
                              type="number"
                              defaultValue={u.raheeCoins ?? 0}
                              key={`coins-${u.id}-${u.raheeCoins}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== u.raheeCoins) {
                                    await update(ref(db, `users/${u.id}`), { raheeCoins: val });
                                 }
                              }}
                              className="w-full bg-black border border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-white/20 uppercase mb-1 ml-1">50:50 Lifelines</p>
                           <input 
                              type="number"
                              defaultValue={u.lifelines?.fiftyFifty ?? 0}
                              key={`5050-${u.id}-${u.lifelines?.fiftyFifty}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val)) {
                                    await update(ref(db, `users/${u.id}/lifelines`), { fiftyFifty: val });
                                 }
                              }}
                              className="w-full bg-black border border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-white/20 uppercase mb-1 ml-1">Change Lifelines</p>
                           <input 
                              type="number"
                              defaultValue={u.lifelines?.changeQuiz ?? 0}
                              key={`change-${u.id}-${u.lifelines?.changeQuiz}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val)) {
                                    await update(ref(db, `users/${u.id}/lifelines`), { changeQuiz: val });
                                 }
                              }}
                              className="w-full bg-black border border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                      </div>
                      <p className="text-[8px] text-white/20 uppercase font-bold tracking-[0.2em] mt-1 ml-2 italic">Changes save automatically on exit</p>
                   </div>
                </div>
             </div>
          </div>
       </div>
     );
  };

  const renderSection = () => {
    switch(activeSubTab) {
      case 'users':
        if (selectedUser) return renderUserProfile(selectedUser);
        const realPlayers = users.filter(u => !u.isBot);
        const botsList = users.filter(u => u.isBot);
        return (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                     <h3 className="text-xl font-black uppercase tracking-tighter">Real Players ({realPlayers.length})</h3>
                  </div>
                  <div className="space-y-2">
                    {realPlayers.length === 0 ? (
                      <p className="text-white/20 italic p-4 text-center">No real players found</p>
                    ) : (
                      realPlayers.map(u => (
                        <button 
                          key={u.id} 
                          onClick={() => setSelectedUser(u)}
                          className="w-full bg-[#111] p-4 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-white/5 transition-all group"
                        >
                          <div className="text-left">
                            <p className="font-bold flex items-center gap-2">
                              {u.name}
                              {u.status === 'pending' && <span className="text-[8px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded font-black">PENDING</span>}
                              {u.extraTriesRequested && <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-black">RESET REQ</span>}
                            </p>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">RANK #{getUserRank(u.id)} • {u.xp} XP</p>
                          </div>
                          <ChevronRight size={16} className="text-white/10 group-hover:text-primary transition-all group-hover:translate-x-1" />
                        </button>
                      ))
                    )}
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                     <h3 className="text-xl font-black uppercase tracking-tighter">Bot Players ({botsList.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-[500px] overflow-y-auto scrollbar-hide pr-1">
                    {botsList.length === 0 ? (
                       <p className="text-center p-8 text-white/10 italic">Zero bots active</p>
                    ) : (
                       botsList.map(b => (
                          <div key={b.id} className="bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                             <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center text-white/20">
                                   <Bot size={16} />
                                </div>
                                <div className="text-left">
                                   <p className="font-bold text-sm tracking-tight">{b.name}</p>
                                   <p className="text-[10px] font-bold text-white/20 uppercase">{b.xp} XP • RANK #{getUserRank(b.id)}</p>
                                </div>
                             </div>
                             <button onClick={() => deleteUser(b.id)} className="p-2 text-white/10 hover:text-red-500 transition-colors">
                                <Trash2 size={16} />
                             </button>
                          </div>
                       ))
                    )}
                  </div>
               </div>
            </div>
          </div>
        );
      case 'topics':
        return (
          <div className="space-y-6">
            <div className="bg-[#111] p-6 rounded-2xl border border-white/5">
              <h3 className="font-bold mb-4">Add New Topic</h3>
              <div className="flex gap-2">
                <input 
                  type="text" value={newTopicName} onChange={e => setNewTopicName(e.target.value)}
                  placeholder="Topic Name" className="flex-1 bg-black border border-white/10 p-3 rounded-xl outline-none"
                />
                <button onClick={addTopic} className="bg-[#32befa] text-black px-4 rounded-xl font-bold"><Plus /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {topics.map(t => (
                <div key={t.id} className="bg-[#111] p-4 rounded-2xl border border-white/5 flex justify-between items-center capitalize">
                  <span className="font-bold">{t.name}</span>
                  <button onClick={() => remove(ref(db, `topics/${t.id}`))} className="text-red-500"><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'quizzes':
        return (
          <div className="space-y-8 pb-32">
            {/* Creation Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Single Quiz Form */}
              <div className="bg-[#111] p-6 rounded-[2rem] border border-white/5">
                <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-tighter">
                  <Plus size={20} className={cn("transition-all", editingQuizId ? "text-yellow-500 rotate-45" : "text-[#32befa]")} />
                  {editingQuizId ? 'Edit Quiz' : 'Manual Entry'}
                  {editingQuizId && (
                    <button 
                      onClick={() => {
                        setEditingQuizId(null);
                        setNewQuiz({
                          questionEn: '', questionHi: '',
                          opt1En: '', opt1Hi: '',
                          opt2En: '', opt2Hi: '',
                          opt3En: '', opt3Hi: '',
                          opt4En: '', opt4Hi: '',
                          correct: 1, topicId: '',
                          explanationEn: '', explanationHi: ''
                        });
                      }}
                      className="ml-auto text-xs font-black text-red-500 hover:underline uppercase"
                    >
                      Cancel
                    </button>
                  )}
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Question (EN)" value={newQuiz.questionEn} onChange={e => setNewQuiz({...newQuiz, questionEn: e.target.value})} className="bg-black border border-white/5 p-4 rounded-xl outline-none focus:border-[#32befa] transition-all text-sm" />
                    <input type="text" placeholder="Question (HI)" value={newQuiz.questionHi} onChange={e => setNewQuiz({...newQuiz, questionHi: e.target.value})} className="bg-black border border-white/5 p-4 rounded-xl outline-none focus:border-[#32befa] transition-all text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Opt 1 (EN)" value={newQuiz.opt1En} onChange={e => setNewQuiz({...newQuiz, opt1En: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                    <input type="text" placeholder="Opt 1 (HI)" value={newQuiz.opt1Hi} onChange={e => setNewQuiz({...newQuiz, opt1Hi: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Opt 2 (EN)" value={newQuiz.opt2En} onChange={e => setNewQuiz({...newQuiz, opt2En: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                    <input type="text" placeholder="Opt 2 (HI)" value={newQuiz.opt2Hi} onChange={e => setNewQuiz({...newQuiz, opt2Hi: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Opt 3 (EN)" value={newQuiz.opt3En} onChange={e => setNewQuiz({...newQuiz, opt3En: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                    <input type="text" placeholder="Opt 3 (HI)" value={newQuiz.opt3Hi} onChange={e => setNewQuiz({...newQuiz, opt3Hi: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Opt 4 (EN)" value={newQuiz.opt4En} onChange={e => setNewQuiz({...newQuiz, opt4En: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                    <input type="text" placeholder="Opt 4 (HI)" value={newQuiz.opt4Hi} onChange={e => setNewQuiz({...newQuiz, opt4Hi: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Explanation (EN)" value={newQuiz.explanationEn} onChange={e => setNewQuiz({...newQuiz, explanationEn: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                    <input type="text" placeholder="Explanation (HI)" value={newQuiz.explanationHi} onChange={e => setNewQuiz({...newQuiz, explanationHi: e.target.value})} className="bg-black border border-white/5 p-3 rounded-xl outline-none text-xs" />
                  </div>
                  <div className="flex gap-3">
                    <select value={newQuiz.correct} onChange={e => setNewQuiz({...newQuiz, correct: parseInt(e.target.value)})} className="flex-1 bg-black border border-white/5 p-3 rounded-xl text-xs font-bold text-white/60">
                      <option value={1}>Correct: Opt 1</option>
                      <option value={2}>Correct: Opt 2</option>
                      <option value={3}>Correct: Opt 3</option>
                      <option value={4}>Correct: Opt 4</option>
                    </select>
                    <select value={newQuiz.topicId} onChange={e => setNewQuiz({...newQuiz, topicId: e.target.value})} className="flex-1 bg-black border border-white/5 p-3 rounded-xl text-xs font-bold text-white/60 capitalize">
                      <option value="">Select Topic</option>
                      {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <button onClick={addQuiz} className={cn(
                    "w-full font-black p-4 rounded-xl shadow-[0_10px_20px_rgba(50,190,250,0.2)] active:scale-95 transition-all",
                    editingQuizId ? "bg-yellow-500 text-black" : "bg-[#32befa] text-black"
                  )}>
                    {editingQuizId ? 'SAVE CHANGES' : 'ADD QUIZ'}
                  </button>
                </div>
              </div>

              {/* Bulk Add Text */}
              <div className="bg-[#111] p-6 rounded-[2rem] border border-white/5">
                <h3 className="text-lg font-black mb-6 flex items-center justify-between uppercase tracking-tighter">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={20} className="text-[#32befa]" />
                    Bulk Write
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={loadAllForBulkEdit}
                      className="bg-primary/20 text-primary border border-primary/20 px-3 py-1 rounded-full text-[10px] font-black hover:bg-primary hover:text-black transition-all uppercase"
                    >
                      Load for Edit
                    </button>
                    <button 
                      onClick={exportQuizzesCsv}
                      className="bg-white/5 text-white/60 border border-white/10 px-3 py-1 rounded-full text-[10px] font-black hover:bg-white/10 transition-all uppercase"
                    >
                      Export CSV
                    </button>
                    <label className="bg-[#32befa]/10 text-[#32befa] border border-[#32befa]/20 px-3 py-1 rounded-full text-[10px] font-black cursor-pointer hover:bg-[#32befa] hover:text-black transition-all">
                      CSV UPLOAD
                      <input type="file" accept=".csv" className="hidden" onChange={e => handleCsvUpload(e, 'quizzes')} />
                    </label>
                  </div>
                </h3>
                <textarea 
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  placeholder="Format: Q_EN, Q_HI, O1_EN, O1_HI, O2_EN, O2_HI, O3_EN, O3_HI, O4_EN, O4_HI, CorrectIndex(1-4), TopicID"
                  className="w-full bg-black border border-white/5 p-4 rounded-2xl h-48 outline-none focus:border-[#32befa] transition-all text-[10px] font-mono leading-relaxed opacity-60 focus:opacity-100"
                />
                <button onClick={addBulkQuizzes} className="w-full mt-4 bg-white/5 border border-white/10 text-white font-black p-4 rounded-xl hover:bg-white/10 transition-all">BATCH PROCESS</button>
              </div>
            </div>

            {/* List Section */}
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <h3 className="font-black text-sm uppercase tracking-widest text-white/40">Registered Quizzes ({quizzes.length})</h3>
                 <div className="flex items-center gap-4">
                    <button onClick={reindexQuizzes} className="text-[8px] font-black bg-yellow-500/10 text-yellow-500 px-3 py-1.5 rounded-lg border border-yellow-500/20 hover:bg-yellow-500/20 transition-all uppercase">Re-index IDs</button>
                    <span className="text-[10px] font-bold text-[#32befa]">LATEST UPLOADS</span>
                 </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {quizzes.slice().reverse().map(q => (
                   <div key={q.id} className="bg-black/60 border border-white/5 p-5 rounded-[2rem] group relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#32befa] opacity-0 group-hover:opacity-100 transition-all" />
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                           {!isNaN(parseInt(q.id)) && (
                              <span className="w-5 h-5 flex items-center justify-center bg-[#32befa] text-black text-[10px] font-black rounded-lg">
                                 {q.id}
                              </span>
                           )}
                           <span className="text-[8px] bg-white/5 text-white/40 px-2 py-0.5 rounded font-black uppercase tracking-widest">{q.topicId}</span>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => editQuizInForm(q)} className="text-white/10 hover:text-primary transition-colors"><Edit2 size={16} /></button>
                           <button onClick={() => remove(ref(db, `quizzes/${q.id}`))} className="text-white/10 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </div>
                      <h4 className="font-bold text-sm leading-tight mb-4">{q.question?.en || 'Untitled Question'}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {q.options?.en?.map((opt, i) => (
                           <div key={`${q.id}-opt-${i}`} className={cn(
                             "p-2 rounded-xl text-[10px] font-bold truncate",
                             i === q.correctAnswerIndex ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-white/5 text-white/20"
                           )}>
                             {opt}
                           </div>
                        ))}
                      </div>
                   </div>
                 ))}
               </div>
               {quizzes.length === 0 && <p className="text-center text-white/20 italic p-12">No quizzes created yet</p>}
            </div>
          </div>
        );
      case 'bots':
        const botPlayers = users.filter(u => u.isBot);
        return (
          <div className="space-y-6 pb-32">
             <div className="bg-[#111] p-6 rounded-[2rem] border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-black flex items-center gap-2 uppercase tracking-tighter">
                    <Bot size={20} className="text-[#32befa]" />
                    Bot Engine
                  </h3>
                  <label className="flex items-center gap-2 bg-[#32befa] text-black px-4 py-2 rounded-xl font-black text-xs cursor-pointer hover:scale-105 transition-all">
                    <Upload size={16} />
                    BULK DATA
                    <input type="file" accept=".csv" className="hidden" onChange={e => handleCsvUpload(e, 'bots')} />
                  </label>
                </div>
                <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest leading-relaxed">
                  CSV Pattern: name, xp
                </p>
             </div>

             <div className="space-y-4">
               <h3 className="text-sm font-black text-white/20 uppercase tracking-widest">Active Simulators ({botPlayers.length})</h3>
               {botPlayers.length === 0 ? (
                  <p className="text-center p-8 text-white/10 italic">Zero bots active</p>
               ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {botPlayers.map(b => (
                       <div key={b.id} className="bg-[#111] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                             <div className="w-8 h-8 bg-[#32befa]/20 rounded-lg flex items-center justify-center text-[#32befa]">
                                <Bot size={16} />
                             </div>
                             <div>
                                <p className="font-bold text-sm tracking-tight">{b.name}</p>
                                <p className="text-[10px] font-bold text-white/20 uppercase">{b.xp} XP • LVL {b.rank}</p>
                             </div>
                          </div>
                          <button onClick={() => deleteUser(b.id)} className="p-2 text-white/10 hover:text-red-500 transition-colors">
                             <Trash2 size={16} />
                          </button>
                       </div>
                    ))}
                  </div>
               )}
             </div>
          </div>
        );
      case 'appearance':
        return (
          <div className="space-y-6 pb-32">
            <div className="bg-[#111] p-6 rounded-[2rem] border border-white/5">
               <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-2">
                 <Palette size={24} className="text-[#32befa]" />
                 Global Skin Management
               </h3>
               <p className="text-sm text-white/40 mb-8 font-bold uppercase tracking-widest">Selected skin will sync to all active players instantly.</p>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(SKINS).map(([id, skin]) => (
                    <button 
                      key={id}
                      onClick={() => setGlobalSkin(id)}
                      className={cn(
                        "p-6 rounded-[2rem] border-2 text-left transition-all relative overflow-hidden group",
                        "hover:scale-[1.02] active:scale-[0.98]",
                        id === currentSkin ? "bg-primary/20 border-primary shadow-[0_10px_30px_rgba(var(--primary-color),0.2)]" : "bg-black/40 border-white/5"
                      )}
                    >
                       <div className="absolute top-0 right-0 p-4">
                          <div 
                            className="w-8 h-8 rounded-full shadow-lg" 
                            style={{ backgroundColor: skin.primary }}
                          />
                       </div>
                       <h4 className="font-black text-lg mb-1">{skin.name}</h4>
                       <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Primary: {skin.primary}</p>
                    </button>
                  ))}
               </div>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-black text-white relative">
       {/* Mobile Menu Toggle */}
       <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-[#050505] border-b border-white/5 flex items-center justify-between px-6 z-[160]">
          <div className="flex items-center gap-2">
             <Shield className="text-primary" size={24} />
             <h2 className="text-lg font-black tracking-tighter">ADMIN</h2>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 bg-white/5 rounded-xl text-white/60"
          >
            {isSidebarOpen ? <CloseIcon size={24} /> : <Menu size={24} />}
          </button>
       </div>

       {/* Sidebar Overlay for Mobile */}
       <AnimatePresence>
         {isSidebarOpen && (
           <motion.div 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             exit={{ opacity: 0 }}
             onClick={() => setIsSidebarOpen(false)}
             className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[150]"
           />
         )}
       </AnimatePresence>

       {/* Sidebar */}
       <div className={cn(
         "fixed md:sticky top-0 left-0 h-full w-64 border-r border-white/5 bg-[#050505] p-6 flex flex-col gap-8 z-[155] transition-transform duration-300 md:translate-x-0 overflow-y-auto",
         isSidebarOpen ? "translate-x-0" : "-translate-x-full"
       )}>
          <div className="flex items-center gap-3">
             <Shield className="text-primary" size={32} />
             <h2 className="text-xl font-black tracking-tighter">ADMIN</h2>
          </div>

          <nav className="flex-1 space-y-2">
             {[
               { id: 'users', label: 'Players', icon: Users },
               { id: 'topics', label: 'Topics', icon: HelpCircle },
               { id: 'quizzes', label: 'Quizzes', icon: FileText },
               { id: 'bots', label: 'Bots', icon: Bot },
               { id: 'appearance', label: 'Skin', icon: Palette },
             ].map(tab => (
               <button
                 key={tab.id}
                 onClick={() => { 
                   setActiveSubTab(tab.id); 
                   setSelectedUser(null);
                   setIsSidebarOpen(false);
                 }}
                 className={cn(
                   "w-full flex items-center gap-3 px-4 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all",
                   activeSubTab === tab.id ? "bg-primary text-black" : "text-white/40 hover:bg-white/5"
                 )}
               >
                 <tab.icon size={18} />
                 {tab.label}
               </button>
             ))}
          </nav>
          
          <div className="pt-8 border-t border-white/5">
             <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-4">Internal System</p>
             <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-[8px] font-black text-primary uppercase mb-1">Database Sync</p>
                <p className="text-[10px] font-bold text-white/60">Live Status: Active</p>
             </div>
          </div>
       </div>

       {/* Main Content */}
       <div className="flex-1 p-6 md:p-10 pt-24 md:pt-10 overflow-y-auto max-h-screen scrollbar-hide">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSubTab + (selectedUser ? selectedUser.id : '')}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
               {renderSection()}
            </motion.div>
          </AnimatePresence>
       </div>
    </div>
  );
}
