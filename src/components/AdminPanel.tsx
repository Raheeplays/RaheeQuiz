import React, { useState, useEffect } from 'react';
import { db } from '../firebase/config';
import { ref, onValue, set, push, remove, get, update } from 'firebase/database';
import { User, Topic, Quiz, Feedback, QuizHistory } from '../types';
import ScoreCard from './ScoreCard';
import { Shield, Users, HelpCircle, FileText, Bot, Plus, Trash2, CheckCircle, XCircle, Upload, MessageSquare, Info, Palette, ChevronRight, History as HistoryIcon, Clock, AlertTriangle, Menu, X as CloseIcon, Edit2, Coins, TrendingUp, Calendar, Sun, Moon, Star } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useDialog } from '../contexts/DialogContext';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { SKINS, Event } from '../types';
import { CLASSES, SUBJECTS } from '../constants';

import { generateCertificate } from '../utils/certificate';
import CertificatePreview from './CertificatePreview';

export default function AdminPanel() {
  const { isDark, setIsDark } = useTheme();
  const { alert, confirm } = useDialog();
  const [activeSubTab, setActiveSubTab] = useState('users');
  const [users, setUsers] = useState<User[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentSkin, setCurrentSkin] = useState('rahee');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userHistory, setUserHistory] = useState<QuizHistory[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editName, setEditName] = useState('');
  const [editId, setEditId] = useState('');
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicPath, setTopicPath] = useState<string[]>([]); // Array of IDs representing the path
  const [quizTopicPath, setQuizTopicPath] = useState<Topic[]>([]); 
  const [newNode, setNewNode] = useState({ id: '', name: '', description: '' });
  const [nodeEditMode, setNodeEditMode] = useState<string | null>(null);
  const [certPreviewData, setCertPreviewData] = useState({
    name: 'Student Name',
    topic: 'Quiz Mastery',
    score: 100,
    total: 100,
  });
  
  // Create state
  const [newTopic, setNewTopic] = useState({
    name: ''
  });
  const [bulkText, setBulkText] = useState('');
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    topicId: '',
    startTime: '',
    durationHours: '1',
    type: 'test' as 'test' | 'exam' | 'contest',
    hasTimer: false,
    timerDuration: '30',
    certificateTitle: 'CERTIFICATE OF ACHIEVEMENT',
    certificateSubtitle: 'This is to certify that',
    certificateFooter: 'Rahee Quiz Team',
    certificateColor: '#32befa',
    certificateLayout: {
      borderWidth: 2,
      headerFontSize: 40,
      headerStyle: 'bold' as const,
      subtitleFontSize: 18,
      subtitleStyle: 'normal' as const,
      nameFontSize: 32,
      nameStyle: 'bold italic' as const,
      bodyFontSize: 16,
      footerFontSize: 14,
      footerStyle: 'bold' as const,
      showBackgroundPattern: true,
      borderPadding: 10
    }
  });
  const [newQuiz, setNewQuiz] = useState({
    questionEn: '', questionHi: '',
    opt1En: '', opt1Hi: '',
    opt2En: '', opt2Hi: '',
    opt3En: '', opt3Hi: '',
    opt4En: '', opt4Hi: '',
    correct: 1, topicId: '', subTopicId: '', subSubTopicId: '',
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
    onValue(ref(db, 'events'), s => {
      if (s.exists()) {
        const data = s.val();
        setEvents(Object.entries(data).map(([key, val]: [string, any]) => ({ ...val, id: key })));
      } else {
        setEvents([]);
      }
    });
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
    const verified = await confirm({
      title: "Delete History",
      description: "Are you sure you want to delete this history entry?",
      type: 'confirm'
    });
    if (!verified) return;
    try {
      await remove(ref(db, `history/${historyId}`));
    } catch (error) {
      console.error("Failed to delete history item:", error);
      await alert({
        title: "Error",
        description: 'Failed to delete history item.',
        type: 'error'
      });
    }
  };

  const clearUserHistory = async (userId: string) => {
    const verified = await confirm({
      title: "Clear All History",
      description: "Are you sure you want to delete ALL history for this player? This cannot be undone.",
      type: 'confirm'
    });
    if (!verified) return;
    
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
          await alert({
            title: "Success",
            description: 'Player history cleared!',
            type: 'success'
          });
        } else {
          await alert({
            title: "Info",
            description: 'No history found to clear.',
            type: 'info'
          });
        }
      }
    } catch (error) {
      console.error("Failed to clear history:", error);
      await alert({
        title: "Error",
        description: 'Failed to clear player history.',
        type: 'error'
      });
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
    if (!newTopic.name) return;
    const topicId = editingTopicId || newTopic.name.toLowerCase().replace(/\s+/g, '_');
    const topicData: any = {
      id: topicId,
      name: newTopic.name
    };
    
    // Preserve existing children if editing
    if (editingTopicId) {
       const existingTopic = topics.find(t => t.id === editingTopicId);
       if (existingTopic?.children) {
          topicData.children = existingTopic.children;
       }
    }
    
    await set(ref(db, `topics/${topicId}`), topicData);
    setNewTopic({ name: '' });
    setEditingTopicId(null);
    setTopicPath([]);
    if (editingTopicId) {
      await alert({
        title: "Success",
        description: 'Topic updated!',
        type: 'success'
      });
    }
  };

  const getCurrentNode = () => {
    if (!editingTopicId) return null;
    let current: Topic | undefined = topics.find(t => t.id === editingTopicId);
    for (const pid of topicPath) {
        current = current?.children?.[pid];
    }
    return current;
  };

  const addNode = async () => {
    if (!editingTopicId || !newNode.name) return;
    const nodeId = newNode.id || `node_${Date.now()}`;
    
    let dbPath = `topics/${editingTopicId}`;
    topicPath.forEach(pid => {
        dbPath += `/children/${pid}`;
    });
    const parentPath = dbPath;
    dbPath += `/children/${nodeId}`;

    if (nodeEditMode && nodeEditMode !== nodeId) {
      await remove(ref(db, `${parentPath}/children/${nodeEditMode}`));
    }

    const nodeData: any = {
      id: nodeId,
      name: newNode.name,
      description: newNode.description
    };
    
    if (nodeEditMode) {
      const current = getCurrentNode();
      const existing = current?.children?.[nodeEditMode];
      if (existing?.children) {
        nodeData.children = existing.children;
      }
    }

    await set(ref(db, dbPath), nodeData);
    setNewNode({ id: '', name: '', description: '' });
    setNodeEditMode(null);
  };

  const removeNode = async (nodeId: string) => {
    if (!editingTopicId) return;
    const verified = await confirm({
      title: "Remove Node",
      description: "Remove this child node and all its descendants?",
      type: 'confirm'
    });
    if (!verified) return;
    
    let dbPath = `topics/${editingTopicId}`;
    topicPath.forEach(pid => {
        dbPath += `/children/${pid}`;
    });
    dbPath += `/children/${nodeId}`;
    
    await remove(ref(db, dbPath));
  };

  const getNextQuizId = () => {
    const numericIds = quizzes
      .map(q => parseInt(q.id))
      .filter(id => !isNaN(id));
    return numericIds.length > 0 ? (Math.max(...numericIds) + 1).toString() : "1";
  };

  const reindexQuizzes = async () => {
    const verified = await confirm({
      title: "Re-index Quizzes",
      description: "This will permanently rename all Quiz IDs to 1, 2, 3... Proceed?",
      type: 'confirm'
    });
    if (!verified) return;
    
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
      await alert({
        title: "Success",
        description: "Quizzes re-indexed successfully to sequential numbers!",
        type: 'success'
      });
    } catch (error) {
      console.error("Re-index failed:", error);
      await alert({
        title: "Error",
        description: "Failed to re-index quizzes.",
        type: 'error'
      });
    }
  };

  const addQuiz = async () => {
    let quizId: string;
    if (editingQuizId) {
      quizId = editingQuizId;
    } else {
      quizId = getNextQuizId();
    }

    const quiz: any = {
      id: quizId,
      topicId: newQuiz.topicId || topics[0]?.id,
      subTopicId: newQuiz.subTopicId || null,
      subSubTopicId: newQuiz.subSubTopicId || null,
      question: { en: newQuiz.questionEn, hi: newQuiz.questionHi || newQuiz.questionEn },
      options: {
        en: [newQuiz.opt1En, newQuiz.opt2En, newQuiz.opt3En, newQuiz.opt4En].filter(o => o),
        hi: [newQuiz.opt1Hi || newQuiz.opt1En, newQuiz.opt2Hi || newQuiz.opt2En, newQuiz.opt3Hi || newQuiz.opt3En, newQuiz.opt4Hi || newQuiz.opt4En].filter(o => o)
      },
      correctAnswerIndex: newQuiz.correct - 1,
      explanation: { en: newQuiz.explanationEn, hi: newQuiz.explanationHi || newQuiz.explanationEn }
    };

    await set(ref(db, `topicQuizzes/${quiz.topicId}/${quizId}`), quiz);
    setNewQuiz({
      questionEn: '', questionHi: '',
      opt1En: '', opt1Hi: '',
      opt2En: '', opt2Hi: '',
      opt3En: '', opt3Hi: '',
      opt4En: '', opt4Hi: '',
      correct: 1, topicId: '', subTopicId: '', subSubTopicId: '',
      explanationEn: '', explanationHi: ''
    });
    setEditingQuizId(null);
    if (editingQuizId) {
      await alert({
        title: "Success",
        description: 'Quiz updated!',
        type: 'success'
      });
    }
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
      subTopicId: q.subTopicId || '',
      subSubTopicId: q.subSubTopicId || '',
      explanationEn: q.explanation?.en || '',
      explanationHi: q.explanation?.hi || ''
    });
    setEditingQuizId(q.id);
    // Scroll to form for convenience on mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadAllForBulkEdit = async () => {
    const csvContent = quizzes.map(q => {
      const parts = [
        q.id,
        q.question?.en || '',
        q.question?.hi || '',
        q.options?.en?.[0] || '',
        q.options?.hi?.[0] || '',
        q.options?.en?.[1] || '',
        q.options?.hi?.[1] || '',
        q.options?.en?.[2] || '',
        q.options?.hi?.[2] || '',
        q.options?.en?.[3] || '',
        q.options?.hi?.[3] || '',
        q.correctAnswerIndex + 1,
        q.topicId,
        q.subTopicId || '',
        q.subSubTopicId || '',
        q.explanation?.en || '',
        q.explanation?.hi || ''
      ];
      return parts.join(', ');
    }).join('\n');
    setBulkText(csvContent);
    await alert({
      title: "Data Loaded",
      description: 'Loaded all quizzes. Format: ID, Q_EN, Q_HI, O1_EN, O1_HI, O2_EN, O2_HI, O3_EN, O3_HI, O4_EN, O4_HI, Correct, Topic, SubTopic, SubSubTopic, Exp_EN, Exp_HI',
      type: 'info'
    });
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
      
      if (parts.length >= 10) {
        let id, qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, subTopic, subSubTopic, expEn, expHi;
        
        // Check if first part is a numeric ID or looks like a question
        const isFirstPartId = !isNaN(parseInt(parts[0])) && parts[0].length < 10;
        
        if (isFirstPartId) {
          [id, qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, subTopic, subSubTopic, expEn, expHi] = parts;
        } else {
          [qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, subTopic, subSubTopic, expEn, expHi] = parts;
          lastIdNum++;
          id = lastIdNum.toString();
        }

        const quiz: any = {
          id: id.toString(),
          question: { en: qEn || '', hi: qHi || qEn || '' },
          options: {
            en: [o1En, o2En, o3En, o4En].filter(o => o),
            hi: [o1Hi || o1En, o2Hi || o2En, o3Hi || o3En, o4Hi || o4En].filter(o => o)
          },
          correctAnswerIndex: (parseInt(corr) || 1) - 1,
          topicId: topic || topics[0]?.id || 'general',
          subTopicId: subTopic || null,
          subSubTopicId: subSubTopic || null,
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
    await alert({
      title: "Bulk Process Complete",
      description: `Successfully processed ${count} quizzes!`,
      type: 'success'
    });
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
             const quiz: any = {
               id,
               topicId: row.topicId || row.TopicId || (topics[0]?.id || 'general'),
               subTopicId: row.subTopicId || row.SubTopicId || null,
               subSubTopicId: row.subSubTopicId || row.SubSubTopicId || null,
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
        await alert({
          title: "Import Complete",
          description: `Imported ${results.data.length} items`,
          type: 'success'
        });
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
    const verified = await confirm({
      title: "Master Reset",
      description: "Are you sure? This will reset ALL stats (XP, Rank, Round, Progress) to zero. This cannot be undone.",
      type: 'error'
    });
    if (!verified) return;
    await update(ref(db, `users/${userId}`), {
      xp: 0,
      rank: 1,
      currentRound: 1,
      currentQuizIndex: 0,
      scores: {}
    });
    await alert({
      title: "Reset Successful",
      description: 'Player data fully reset!',
      type: 'success'
    });
  };

  const renameUser = async (u: User, newName: string, newId: string) => {
    if (!newName || !newId) return;
    const cleanId = newId.replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    
    if (cleanId !== u.id && users.some(user => user.id === cleanId)) {
        await alert({
          title: "Error",
          description: 'This ID is already taken',
          type: 'error'
        });
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
    await alert({
      title: "Success",
      description: 'User updated successfully',
      type: 'success'
    });
  };

  const exportSampleCsv = () => {
    const sampleData = [{
      id: '',
      questionEn: 'Sample Question in English',
      questionHi: 'Sample Question in Hindi',
      opt1En: 'Option 1 English',
      opt1Hi: 'Option 1 Hindi',
      opt2En: 'Option 2 English',
      opt2Hi: 'Option 2 Hindi',
      opt3En: 'Option 3 English',
      opt3Hi: 'Option 3 Hindi',
      opt4En: 'Option 4 English',
      opt4Hi: 'Option 4 Hindi',
      correct: '1',
      topicId: newQuiz.topicId || (topics[0]?.id || 'general'),
      subTopicId: newQuiz.subTopicId || '',
      subSubTopicId: newQuiz.subSubTopicId || '',
      explanationEn: 'Explanation in English',
      explanationHi: 'Explanation in Hindi'
    }];

    const csv = Papa.unparse(sampleData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `rahee_sample_quiz_${newQuiz.topicId || 'general'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportQuizzesCsv = async () => {
    if (quizzes.length === 0) {
      await alert({
        title: "No Data",
        description: 'No quizzes to export',
        type: 'info'
      });
      return;
    }

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
      subTopicId: q.subTopicId || '',
      subSubTopicId: q.subSubTopicId || '',
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

          <div className="bg-black/5 dark:bg-black/40 border border-black/5 dark:border-white/5 p-8 rounded-[2.5rem] flex flex-col md:flex-row items-center gap-8">
             <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center text-primary text-4xl font-black">
                {u.name?.[0] || '?'}
             </div>
             <div className="flex-1 text-center md:text-left w-full">
                {isEditingUser ? (
                   <div className="space-y-4 max-w-md mx-auto md:mx-0">
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Full Name</label>
                         <input 
                           value={editName}
                           onChange={(e) => {
                             setEditName(e.target.value);
                             // Auto-sync ID if it hasn't been manually diverged much
                             setEditId(e.target.value.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, ''));
                           }}
                           className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary transition-all"
                           placeholder="Full Name"
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Username (ID)</label>
                         <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-black">@</span>
                            <input 
                              value={editId}
                              onChange={(e) => setEditId(e.target.value)}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 pl-10 text-black dark:text-white font-bold outline-none focus:border-primary transition-all"
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
                           className="flex-1 bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 font-black uppercase tracking-widest text-xs py-4 rounded-2xl hover:bg-black/10 dark:hover:bg-white/10 transition-all font-mono"
                         >
                           Cancel
                         </button>
                      </div>
                   </div>
                ) : (
                   <>
                      <h3 className="text-3xl font-black mb-1 uppercase tracking-tighter text-black dark:text-white">{u.name}</h3>
                      <p className="text-black/40 dark:text-white/40 font-bold uppercase tracking-widest text-xs mb-4">Player ID: @{u.id}</p>
                      <div className="flex flex-wrap justify-center md:justify-start gap-3">
                         <div className="px-4 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
                            <p className="text-[10px] text-black/30 dark:text-white/30 uppercase font-black">Global Rank</p>
                            <p className="font-black text-primary">RANK #{getUserRank(u.id)}</p>
                         </div>
                         <div className="px-4 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
                            <p className="text-[10px] text-black/30 dark:text-white/30 uppercase font-black">Experience</p>
                            <p className="font-black text-primary">{u.xp} XP</p>
                         </div>
                         <div className="px-4 py-2 bg-black/5 dark:bg-white/5 rounded-xl border border-black/5 dark:border-white/5">
                            <p className="text-[10px] text-black/30 dark:text-white/30 uppercase font-black">Progression</p>
                            <p className="font-black text-primary">ROUND {u.currentRound} • Q{u.currentQuizIndex}</p>
                         </div>
                      </div>
                   </>
                )}
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5">
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
                    className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg px-3 py-1 text-[10px] font-bold uppercase tracking-widest outline-none text-black/60 dark:text-white/60"
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
                               {rounds[Number(round)].map((h, historyIndex) => {
                                  const quiz = quizzes.find(q => q.id === h.quizId);
                                  const historyKey = h.id || `hist-${h.timestamp}-${h.quizId}-${historyIndex}`;
                                  return (
                                     <div key={historyKey} className="bg-black/5 dark:bg-black/40 p-4 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between hover:bg-black/10 dark:hover:bg-white/5 transition-all group">
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
                <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5">
                   <h4 className="font-black text-sm uppercase tracking-widest mb-6">Account Controls</h4>
                   <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-3 ml-1">Current Status</p>
                        <div className="flex items-center justify-between p-4 bg-white dark:bg-black rounded-2xl border border-black/5 dark:border-white/5">
                           <span className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">Status</span>
                           <span className={cn(
                             "text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded",
                             u.status === 'approved' ? "bg-green-500/10 text-green-500" : 
                             u.status === 'pending' ? "bg-yellow-500/10 text-yellow-500" :
                             "bg-red-500/10 text-red-500"
                           )}>{u.status}</span>
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-3 ml-1">Update Access</p>
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

                <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5 mt-6">
                   <h4 className="font-black text-sm uppercase tracking-widest mb-6 flex items-center gap-2 text-black dark:text-white">
                      <Edit2 size={18} className="text-primary" />
                      Progression Editor
                   </h4>
                   <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Current Round</p>
                           <input 
                              type="number"
                              defaultValue={u.currentRound ?? 1}
                              key={`round-${u.id}-${u.currentRound}`}
                              onChange={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val > 0) {
                                    await update(ref(db, `users/${u.id}`), { currentRound: val });
                                 }
                              }}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Quiz Index</p>
                           <input 
                              type="number"
                              defaultValue={u.currentQuizIndex ?? 0}
                              key={`index-${u.id}-${u.currentQuizIndex}`}
                              onChange={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val >= 0) {
                                    await update(ref(db, `users/${u.id}`), { currentQuizIndex: val });
                                 }
                              }}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                      </div>
                      <p className="text-[8px] text-black/20 dark:text-white/20 uppercase font-bold tracking-[0.2em] mt-1 ml-2 italic">Changes save automatically on exit</p>
                   </div>
                </div>

                <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5 mt-6">
                   <h4 className="font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2 text-black dark:text-white">
                      <TrendingUp size={18} className="text-primary" />
                      Statistics Editor
                   </h4>
                   <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Attempted</p>
                           <input 
                               type="number"
                               defaultValue={u.stats?.totalAttempted ?? 0}
                               key={`attempted-${u.id}-${u.stats?.totalAttempted}`}
                               onChange={async (e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val)) {
                                     await update(ref(db, `users/${u.id}/stats`), { totalAttempted: val });
                                  }
                               }}
                               className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Correct</p>
                           <input 
                               type="number"
                               defaultValue={u.stats?.correctAnswers ?? 0}
                               key={`correct-${u.id}-${u.stats?.correctAnswers}`}
                               onChange={async (e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val)) {
                                     await update(ref(db, `users/${u.id}/stats`), { correctAnswers: val });
                                  }
                               }}
                               className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Incorrect</p>
                           <input 
                               type="number"
                               defaultValue={u.stats?.incorrectAnswers ?? 0}
                               key={`incorrect-${u.id}-${u.stats?.incorrectAnswers}`}
                               onChange={async (e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val)) {
                                     await update(ref(db, `users/${u.id}/stats`), { incorrectAnswers: val });
                                  }
                               }}
                               className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                      </div>
                   </div>
                </div>

                <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5 mt-6">
                   <h4 className="font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2 text-black dark:text-white">
                      <Coins size={18} className="text-primary italic" />
                      Economy & Lifelines
                   </h4>
                   <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Rahee Coins</p>
                           <input 
                              type="number"
                              defaultValue={u.raheeCoins ?? 0}
                              key={`coins-${u.id}-${u.raheeCoins}`}
                              onChange={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val)) {
                                    await update(ref(db, `users/${u.id}`), { raheeCoins: val });
                                 }
                              }}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">50:50 Lifelines</p>
                           <input 
                              type="number"
                              defaultValue={u.lifelines?.fiftyFifty ?? 0}
                              key={`5050-${u.id}-${u.lifelines?.fiftyFifty}`}
                              onChange={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val)) {
                                    await update(ref(db, `users/${u.id}/lifelines`), { fiftyFifty: val });
                                 }
                              }}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Change Lifelines</p>
                           <input 
                              type="number"
                              defaultValue={u.lifelines?.changeQuiz ?? 0}
                              key={`change-${u.id}-${u.lifelines?.changeQuiz}`}
                              onChange={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val)) {
                                    await update(ref(db, `users/${u.id}/lifelines`), { changeQuiz: val });
                                 }
                              }}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                      </div>
                      <p className="text-[8px] text-black/20 dark:text-white/20 uppercase font-bold tracking-[0.2em] mt-1 ml-2 italic">Changes save automatically on exit</p>
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
                          className="w-full bg-black/5 dark:bg-[#111] p-4 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between hover:bg-black/10 dark:hover:bg-white/5 transition-all group"
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
        const currentTopic = topics.find(t => t.id === editingTopicId);
        const currentNode = getCurrentNode();

        return (
          <div className="space-y-8 pb-32">
            <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5">
              {editingTopicId && (
                <div className="flex flex-wrap items-center gap-2 mb-6 bg-black/10 dark:bg-white/5 p-3 rounded-2xl border border-black/5 dark:border-white/5">
                   <button 
                     onClick={() => { setEditingTopicId(null); setTopicPath([]); }}
                     className="text-[10px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                   >
                     Topics
                   </button>
                   <ChevronRight size={10} className="text-white/20" />
                   <button 
                     onClick={() => setTopicPath([])}
                     className={cn("text-[10px] font-black uppercase hover:underline", topicPath.length === 0 ? "text-white" : "text-primary")}
                   >
                     {currentTopic?.name}
                   </button>
                   {topicPath.map((pid, idx) => {
                      let node: Topic | undefined = currentTopic;
                      for(let i=0; i<idx; i++) {
                         node = node?.children?.[topicPath[i]];
                      }
                      const child = node?.children?.[pid];
                      return (
                        <React.Fragment key={`${pid}-${idx}`}>
                           <ChevronRight size={10} className="text-white/20" />
                           <button 
                             onClick={() => setTopicPath(topicPath.slice(0, idx + 1))}
                             className={cn("text-[10px] font-black uppercase hover:underline", idx === topicPath.length - 1 ? "text-white" : "text-primary")}
                           >
                             {child?.name}
                           </button>
                        </React.Fragment>
                      );
                   })}
                </div>
              )}

              <h3 className="text-xl font-black mb-6 uppercase tracking-tighter text-black dark:text-white flex items-center gap-2">
                <Plus size={20} className={cn("transition-all", editingTopicId && topicPath.length === 0 && !nodeEditMode ? "text-yellow-500 rotate-45" : "text-[#32befa]")} />
                {!editingTopicId ? 'Create New Topic' : (nodeEditMode ? `Edit ${getCurrentNode()?.children?.[nodeEditMode]?.name}` : `Add Sub-Topic to ${currentNode?.name || currentTopic?.name}`)}
                {editingTopicId && topicPath.length === 0 && (
                   <button onClick={() => { setEditingTopicId(null); setNewTopic({ name: '' }); }} className="ml-auto text-xs text-red-500 font-black uppercase">Close</button>
                )}
              </h3>

              <div className="space-y-6">
                {!editingTopicId ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Topic Name</label>
                      <input 
                        value={newTopic.name} 
                        onChange={e => setNewTopic({...newTopic, name: e.target.value})}
                        className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl outline-none text-black dark:text-white font-bold focus:border-primary"
                        placeholder="e.g. Ancient Rome"
                      />
                    </div>
                    <button onClick={addTopic} className="bg-primary text-black font-black uppercase tracking-widest py-4 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all self-end">
                      CREATE TOPIC
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/5 p-6 rounded-3xl border border-black/10 dark:border-white/10">
                     <div className="space-y-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">ID (Slug)</label>
                           <input 
                             value={newNode.id}
                             onChange={e => setNewNode({...newNode, id: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                             className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl outline-none text-black dark:text-white text-xs font-mono"
                             placeholder="identifier_name"
                           />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Display Name</label>
                           <input 
                             value={newNode.name}
                             onChange={e => setNewNode({...newNode, name: e.target.value})}
                             className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl outline-none text-black dark:text-white text-sm font-bold"
                             placeholder="e.g., The Rise of Empires"
                           />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Description</label>
                           <input 
                             value={newNode.description}
                             onChange={e => setNewNode({...newNode, description: e.target.value})}
                             className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl outline-none text-black dark:text-white text-xs"
                             placeholder="Brief overview"
                           />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={addNode} className="flex-1 bg-white dark:bg-white text-black font-black uppercase tracking-widest py-3 rounded-xl text-[10px]">
                            {nodeEditMode ? 'Update' : 'Add'} Node
                          </button>
                          {nodeEditMode && (
                            <button onClick={() => { setNodeEditMode(null); setNewNode({ id: '', name: '', description: '' }); }} className="px-4 bg-red-500/10 text-red-500 font-bold uppercase py-3 rounded-xl text-[10px]">Cancel</button>
                          )}
                        </div>
                     </div>
                     <div className="space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-2">
                        {currentNode?.children ? (
                           Object.values(currentNode.children).map((child: Topic, cIdx) => (
                              <div key={`${child.id}-${cIdx}`} className="flex items-center justify-between p-3 bg-black/20 dark:bg-white/5 rounded-xl border border-white/5 group/node">
                                 <div className="flex-1 cursor-pointer" onClick={() => setTopicPath([...topicPath, child.id])}>
                                    <div className="flex items-center gap-2">
                                       <p className="font-bold text-xs text-black dark:text-white group-hover/node:text-primary transition-colors">{child.name}</p>
                                       {child.children && <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{Object.keys(child.children).length}</span>}
                                    </div>
                                    <p className="text-[8px] font-mono text-black/30 dark:text-white/30 mb-0.5">{child.id}</p>
                                 </div>
                                 <div className="flex items-center opacity-20 group-hover/node:opacity-100 transition-opacity">
                                    <button onClick={() => {
                                      setNewNode({ id: child.id, name: child.name, description: child.description || '' });
                                      setNodeEditMode(child.id);
                                    }} className="text-primary p-2"><Edit2 size={12} /></button>
                                    <button onClick={() => removeNode(child.id)} className="text-red-500 p-2"><Trash2 size={12} /></button>
                                 </div>
                              </div>
                           ))
                        ) : (
                           <div className="h-full flex flex-col items-center justify-center py-12 italic text-black/20 dark:text-white/20">
                              <HelpCircle size={32} className="mb-2 opacity-20" />
                              <p className="text-[10px] font-black uppercase tracking-widest text-center">No nested topics found.<br/>Add your first sub-topic!</p>
                           </div>
                        )}
                     </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {topics.map((t, tIdx) => (
                <div key={`${t.id}-${tIdx}`} className="bg-black/5 dark:bg-[#111] p-5 rounded-[2rem] border border-black/5 dark:border-white/5 flex justify-between items-center group">
                  <div className="flex-1 truncate pr-4">
                    <span className="font-black text-black dark:text-white uppercase tracking-tighter text-lg truncate block">{t.name}</span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {t.children && <span className="text-[8px] font-black uppercase tracking-widest bg-[#32befa]/10 text-[#32befa] px-2 py-0.5 rounded-full">{Object.keys(t.children).length} Sub-topics</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditingTopicId(t.id); setTopicPath([]); }} className="bg-[#32befa]/10 text-[#32befa] px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all">Manage</button>
                    <button onClick={async () => { 
                      const verified = await confirm({
                        title: "Delete Topic",
                        description: 'Delete entire topic and its configuration?',
                        type: 'error'
                      });
                      if(verified) remove(ref(db, `topics/${t.id}`)); 
                    }} className="text-red-500/20 group-hover:text-red-500 transition-all p-2"><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'events':
        const addEvent = async () => {
          if (!newEvent.title || !newEvent.topicId || !newEvent.startTime) {
            await alert({
              title: "Incomplete Fields",
              description: 'Fill all fields',
              type: 'error'
            });
            return;
          }
          const eventId = `event-${Date.now()}`;
          const startTime = new Date(newEvent.startTime).getTime();
          const endTime = startTime + (parseInt(newEvent.durationHours) * 60 * 60 * 1000);
          
          const event: Event = {
            id: eventId,
            title: newEvent.title,
            description: newEvent.description,
            topicId: newEvent.topicId,
            startTime,
            endTime,
            type: newEvent.type,
            hasTimer: newEvent.hasTimer,
            timerDuration: parseInt(newEvent.timerDuration),
            certificateTitle: newEvent.certificateTitle,
            certificateSubtitle: newEvent.certificateSubtitle,
            certificateFooter: newEvent.certificateFooter,
            certificateColor: newEvent.certificateColor || '#32befa',
            certificateLayout: newEvent.certificateLayout,
            createdAt: Date.now()
          };
          
          await set(ref(db, `events/${eventId}`), event);
          setNewEvent({ 
            title: '', description: '', topicId: '', startTime: '', durationHours: '1', type: 'test',
            hasTimer: false, timerDuration: '30', certificateTitle: 'CERTIFICATE OF ACHIEVEMENT',
            certificateSubtitle: 'This is to certify that', certificateFooter: 'Rahee Quiz Team',
            certificateColor: '#32befa',
            certificateLayout: {
              borderWidth: 2,
              headerFontSize: 40,
              headerStyle: 'bold',
              subtitleFontSize: 18,
              subtitleStyle: 'normal',
              nameFontSize: 32,
              nameStyle: 'bold italic',
              bodyFontSize: 16,
              footerFontSize: 14,
              footerStyle: 'bold',
              showBackgroundPattern: true,
              borderPadding: 10
            }
          });
          await alert({
            title: "Success",
            description: 'Event created!',
            type: 'success'
          });
        };

        const previewCertificate = () => {
          generateCertificate({
            userName: 'Sample Name',
            score: 9,
            total: 10,
            date: new Date().toLocaleDateString(),
            topicName: 'Sample Topic Name',
            certificateTitle: newEvent.certificateTitle,
            certificateSubtitle: newEvent.certificateSubtitle,
            certificateFooter: newEvent.certificateFooter,
            certificateColor: newEvent.certificateColor,
            certificateLayout: newEvent.certificateLayout
          });
        };

        return (
          <div className="space-y-8">
             <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5">
                <h3 className="text-xl font-black mb-6 uppercase tracking-tighter text-black dark:text-white">Create New Event</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-4">
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Event Title</label>
                         <input 
                           value={newEvent.title}
                           onChange={e => setNewEvent({...newEvent, title: e.target.value})}
                           className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                           placeholder="Annual Exam 2024"
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Description</label>
                         <input 
                           value={newEvent.description}
                           onChange={e => setNewEvent({...newEvent, description: e.target.value})}
                           className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                           placeholder="Special test for top ranking players"
                         />
                      </div>
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Assign to Topic/Niche</label>
                         <div className="p-4 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl space-y-3">
                            <div className="flex items-center justify-between">
                               {quizTopicPath.length > 0 && (
                                  <button 
                                    onClick={() => setQuizTopicPath(quizTopicPath.slice(0, -1))}
                                    className="text-[10px] font-bold text-primary hover:underline"
                                  >
                                     Back
                                  </button>
                               )}
                            </div>
                            <div className="flex flex-wrap gap-1 items-center bg-black/5 dark:bg-white/5 p-2 rounded-lg">
                               <span className="text-[10px] font-bold text-black/40 dark:text-white/40">Path:</span>
                               {quizTopicPath.length === 0 ? (
                                  <span className="text-[10px] font-bold text-red-500 italic">None Selected</span>
                               ) : (
                                  quizTopicPath.map((node, i) => (
                                     <React.Fragment key={`${node.id}-${i}`}>
                                        <span className="text-[10px] font-bold text-primary">{node.name}</span>
                                        {i < quizTopicPath.length - 1 && <ChevronRight size={10} className="text-black/20" />}
                                     </React.Fragment>
                                  ))
                               )}
                            </div>
                            <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                               {(() => {
                                  const options = quizTopicPath.length === 0 
                                     ? topics 
                                     : Object.values(quizTopicPath[quizTopicPath.length - 1].children || {});
                                  
                                  return options.map((opt, oIdx) => (
                                     <button 
                                       key={`${opt.id}-${oIdx}`}
                                       onClick={() => {
                                          const newPath = [...quizTopicPath, opt];
                                          setQuizTopicPath(newPath);
                                          setNewEvent({ ...newEvent, topicId: opt.id });
                                       }}
                                       className="p-2 bg-black/5 dark:bg-white/5 rounded-lg text-[10px] font-bold hover:bg-primary hover:text-black transition-all text-left truncate"
                                     >
                                        {opt.name}
                                     </button>
                                  ));
                                })()}
                            </div>
                         </div>
                      </div>
                   </div>
                   <div className="space-y-4">
                      <div className="space-y-1">
                         <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Start Date & Time</label>
                         <input 
                           type="datetime-local"
                           value={newEvent.startTime}
                           onChange={e => setNewEvent({...newEvent, startTime: e.target.value})}
                           className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                         />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Duration (Hours)</label>
                           <input 
                             type="number"
                             value={newEvent.durationHours}
                             onChange={e => setNewEvent({...newEvent, durationHours: e.target.value})}
                             className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                           />
                        </div>
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Event Type</label>
                           <select 
                             value={newEvent.type}
                             onChange={e => setNewEvent({...newEvent, type: e.target.value as any})}
                             className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary appearance-none"
                           >
                              <option value="test">Test</option>
                              <option value="exam">Exam</option>
                              <option value="contest">Contest</option>
                           </select>
                        </div>
                      </div>

                      {/* Timer & Certificate Settings */}
                      <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-4">
                        <div className="flex items-center justify-between px-2">
                           <span className="text-[10px] font-black uppercase text-black/30 dark:text-white/30">Quiz Timer</span>
                           <label className="relative inline-flex items-center cursor-pointer">
                              <input type="checkbox" checked={newEvent.hasTimer} onChange={e => setNewEvent({...newEvent, hasTimer: e.target.checked})} className="sr-only peer" />
                              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                           </label>
                        </div>
                        {newEvent.hasTimer && (
                          <div className="space-y-1">
                             <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Timer Duration (Minutes)</label>
                             <input 
                               type="number"
                                value={newEvent.timerDuration}
                                onChange={e => setNewEvent({...newEvent, timerDuration: e.target.value})}
                                className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                             />
                          </div>
                        )}

                        <div className="space-y-4 pt-4 border-t border-black/5 dark:border-white/5">
                           <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 px-2 block">Certificate Editor</span>
                              <button 
                                onClick={previewCertificate}
                                className="px-3 py-1 bg-primary/10 text-primary rounded-lg text-[10px] font-black uppercase hover:bg-primary hover:text-black transition-all"
                              >
                                Preview Layout
                              </button>
                           </div>
                           
                           <div className="space-y-2">
                              <label className="text-[8px] font-black uppercase text-black/20 dark:text-white/20 ml-2">Labels</label>
                              <div className="grid grid-cols-1 gap-2">
                                <input 
                                  type="text"
                                  value={newEvent.certificateTitle}
                                  onChange={e => setNewEvent({...newEvent, certificateTitle: e.target.value})}
                                  placeholder="Header (e.g. CERTIFICATE OF EXCELLENCE)"
                                  className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-3 text-xs text-black dark:text-white font-bold"
                                />
                                <input 
                                  type="text"
                                  value={newEvent.certificateSubtitle}
                                  onChange={e => setNewEvent({...newEvent, certificateSubtitle: e.target.value})}
                                  placeholder="Subtitle (This is to certify that)"
                                  className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-3 text-xs text-black dark:text-white font-bold"
                                />
                                <input 
                                  type="text"
                                  value={newEvent.certificateFooter}
                                  onChange={e => setNewEvent({...newEvent, certificateFooter: e.target.value})}
                                  placeholder="Footer / Authorized Signature Name"
                                  className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-3 text-xs text-black dark:text-white font-bold"
                                />
                                <div className="flex items-center gap-2 px-2">
                                  <label className="text-[10px] font-bold text-black/40 dark:text-white/40">Theme Color:</label>
                                  <input 
                                    type="color" 
                                    value={newEvent.certificateColor} 
                                    onChange={e => setNewEvent({...newEvent, certificateColor: e.target.value})}
                                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-none"
                                  />
                                </div>
                              </div>
                           </div>

                           <div className="space-y-3 bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                              <p className="text-[8px] font-black uppercase text-black/30 dark:text-white/30 tracking-widest mb-2">Detailed Layout Options</p>
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-black/40 dark:text-white/40">Border Width ({newEvent.certificateLayout?.borderWidth}mm)</label>
                                  <input 
                                    type="range" min="0.5" max="10" step="0.5"
                                    value={newEvent.certificateLayout?.borderWidth}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, borderWidth: parseFloat(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-black/40 dark:text-white/40">Border Padding ({newEvent.certificateLayout?.borderPadding}mm)</label>
                                  <input 
                                    type="range" min="0" max="30" step="1"
                                    value={newEvent.certificateLayout?.borderPadding}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, borderPadding: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-black/40 dark:text-white/40">Header Size ({newEvent.certificateLayout?.headerFontSize}px)</label>
                                  <input 
                                    type="range" min="20" max="80" step="1"
                                    value={newEvent.certificateLayout?.headerFontSize}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, headerFontSize: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-black/40 dark:text-white/40">Name Size ({newEvent.certificateLayout?.nameFontSize}px)</label>
                                  <input 
                                    type="range" min="20" max="60" step="1"
                                    value={newEvent.certificateLayout?.nameFontSize}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, nameFontSize: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-between px-1">
                                <span className="text-[9px] font-bold text-black/40 dark:text-white/40">Show Background Pattern</span>
                                <input 
                                  type="checkbox" 
                                  checked={newEvent.certificateLayout?.showBackgroundPattern}
                                  onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, showBackgroundPattern: e.target.checked }})}
                                  className="accent-primary"
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-black/40 dark:text-white/40">Header Style</label>
                                  <select 
                                    value={newEvent.certificateLayout?.headerStyle}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, headerStyle: e.target.value as any }})}
                                    className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-2 rounded-lg text-[10px]"
                                  >
                                    <option value="normal">Normal</option>
                                    <option value="bold">Bold</option>
                                    <option value="italic">Italic</option>
                                    <option value="bolditalic">Bold Italic</option>
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-black/40 dark:text-white/40">Name Style</label>
                                  <select 
                                    value={newEvent.certificateLayout?.nameStyle}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, nameStyle: e.target.value as any }})}
                                    className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-2 rounded-lg text-[10px]"
                                  >
                                    <option value="normal">Normal</option>
                                    <option value="bold">Bold</option>
                                    <option value="italic">Italic</option>
                                    <option value="bolditalic">Bold Italic</option>
                                  </select>
                                </div>
                              </div>
                           </div>
                        </div>
                      </div>

                      <button 
                         onClick={addEvent}
                        className="w-full bg-primary text-black font-black uppercase tracking-widest py-4 rounded-2xl mt-2 shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        Launch Event
                      </button>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <h3 className="text-xl font-black uppercase tracking-tighter px-2 text-black dark:text-white">Active & Scheduled Events ({events.length})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {events.map(event => (
                      <div key={event.id} className="bg-black/5 dark:bg-[#111] p-6 rounded-3xl border border-black/5 dark:border-white/5 flex flex-col justify-between">
                         <div>
                            <div className="flex items-center justify-between mb-3">
                               <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">{event.type}</span>
                               <button onClick={() => remove(ref(db, `events/${event.id}`))} className="text-red-500/50 hover:text-red-500 transition-colors">
                                  <Trash2 size={16} />
                               </button>
                            </div>
                            <h4 className="font-black text-lg uppercase tracking-tight text-black dark:text-white">{event.title}</h4>
                            <p className="text-xs text-black/40 dark:text-white/40 mt-1">{event.description}</p>
                         </div>
                         <div className="mt-6 flex items-center justify-between border-t border-black/5 dark:border-white/5 pt-4">
                            <div>
                               <p className="text-[8px] font-black text-black/20 dark:text-white/20 uppercase">Participants</p>
                               <p className="font-bold text-xs text-black dark:text-white">{Object.keys(event.participants || {}).length} Joined</p>
                            </div>
                            <div className="text-right">
                               <p className="text-[8px] font-black text-black/20 dark:text-white/20 uppercase">Starts On</p>
                               <p className="font-bold text-xs text-black dark:text-white">{new Date(event.startTime).toLocaleDateString()}</p>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>
        );
      case 'certificate': {
        const generateStandalone = () => {
          generateCertificate({
            userName: certPreviewData.name,
            score: certPreviewData.score,
            total: certPreviewData.total,
            date: new Date().toLocaleDateString(),
            topicName: certPreviewData.topic,
            certificateTitle: newEvent.certificateTitle,
            certificateSubtitle: newEvent.certificateSubtitle,
            certificateFooter: newEvent.certificateFooter,
            certificateColor: newEvent.certificateColor,
            certificateLayout: newEvent.certificateLayout
          });
        };

        return (
          <div className="space-y-8 pb-32">
             <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5">
                <h3 className="text-2xl font-black mb-6 uppercase tracking-tighter text-black dark:text-white flex items-center gap-3">
                   <Shield className="text-primary" size={32} />
                   Professional Certificate Editor
                </h3>

                {/* Live Preview Section */}
                <div className="mb-10 sticky top-0 z-20 bg-black/5 dark:bg-[#111] py-4 rounded-3xl border border-black/5 dark:border-white/5 shadow-2xl backdrop-blur-xl">
                   <h4 className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 tracking-[0.2em] mb-4 text-center">Live Production Preview</h4>
                   <div className="max-w-2xl mx-auto px-4">
                      <CertificatePreview 
                        data={{
                          userName: certPreviewData.name,
                          score: certPreviewData.score,
                          total: certPreviewData.total,
                          date: new Date().toLocaleDateString(),
                          topicName: certPreviewData.topic,
                          certificateTitle: newEvent.certificateTitle,
                          certificateSubtitle: newEvent.certificateSubtitle,
                          certificateFooter: newEvent.certificateFooter,
                          certificateColor: newEvent.certificateColor,
                          certificateLayout: newEvent.certificateLayout
                        }} 
                      />
                   </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                   {/* Left Col: Preview Content */}
                   <div className="space-y-6">
                      <div className="bg-white dark:bg-black/40 border border-black/5 dark:border-white/5 p-6 rounded-3xl space-y-4">
                         <h4 className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 tracking-widest px-2">Preview Content</h4>
                         <div className="space-y-3">
                            <div className="space-y-1">
                               <label className="text-[10px] font-bold text-black/40 dark:text-white/40 ml-2">Recipient Name</label>
                               <input 
                                 type="text"
                                 value={certPreviewData.name}
                                 onChange={e => setCertPreviewData({...certPreviewData, name: e.target.value})}
                                 className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm font-bold"
                               />
                            </div>
                            <div className="space-y-1">
                               <label className="text-[10px] font-bold text-black/40 dark:text-white/40 ml-2">Topic Name</label>
                               <input 
                                 type="text"
                                 value={certPreviewData.topic}
                                 onChange={e => setCertPreviewData({...certPreviewData, topic: e.target.value})}
                                 className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm font-bold"
                               />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                               <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-black/40 dark:text-white/40 ml-2">Score</label>
                                  <input 
                                    type="number"
                                    value={certPreviewData.score}
                                    onChange={e => setCertPreviewData({...certPreviewData, score: parseInt(e.target.value)})}
                                    className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm font-bold"
                                  />
                               </div>
                               <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-black/40 dark:text-white/40 ml-2">Total</label>
                                  <input 
                                    type="number"
                                    value={certPreviewData.total}
                                    onChange={e => setCertPreviewData({...certPreviewData, total: parseInt(e.target.value)})}
                                    className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 rounded-xl p-3 text-sm font-bold"
                                  />
                               </div>
                            </div>
                         </div>
                      </div>

                      <div className="bg-primary/5 border border-primary/10 p-6 rounded-3xl space-y-4">
                         <h4 className="text-[10px] font-black uppercase text-primary tracking-widest px-2">Master Labels</h4>
                         <div className="space-y-3">
                            <input 
                              type="text"
                              value={newEvent.certificateTitle}
                              onChange={e => setNewEvent({...newEvent, certificateTitle: e.target.value})}
                              placeholder="Header Title"
                              className="w-full bg-white dark:bg-black/60 border border-primary/20 rounded-xl p-3 text-sm font-bold"
                            />
                            <input 
                              type="text"
                              value={newEvent.certificateSubtitle}
                              onChange={e => setNewEvent({...newEvent, certificateSubtitle: e.target.value})}
                              placeholder="Subtitle"
                              className="w-full bg-white dark:bg-black/60 border border-primary/20 rounded-xl p-3 text-sm font-bold"
                            />
                            <input 
                              type="text"
                              value={newEvent.certificateFooter}
                              onChange={e => setNewEvent({...newEvent, certificateFooter: e.target.value})}
                              placeholder="Authorized Signature"
                              className="w-full bg-white dark:bg-black/60 border border-primary/20 rounded-xl p-3 text-sm font-bold"
                            />
                            <div className="flex items-center gap-3 px-2">
                               <span className="text-[10px] font-black uppercase text-primary tracking-widest">Theme Color</span>
                               <input 
                                 type="color"
                                 value={newEvent.certificateColor}
                                 onChange={e => setNewEvent({...newEvent, certificateColor: e.target.value})}
                                 className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-none"
                               />
                            </div>
                         </div>
                      </div>

                      <button 
                        onClick={generateStandalone}
                        className="w-full bg-primary text-black font-black uppercase tracking-widest py-6 rounded-3xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all text-lg"
                      >
                         Generate & Export Certificate
                      </button>
                   </div>

                   {/* Right Col: Layout Controls */}
                   <div className="bg-black/5 dark:bg-black/40 border border-black/5 dark:border-white/5 p-8 rounded-[2.5rem] space-y-8">
                      <div>
                         <h4 className="text-xs font-black uppercase tracking-widest text-black/60 dark:text-white/60 mb-6 flex items-center gap-2">
                            <Palette size={16} className="text-primary" />
                            Layout Configuration
                         </h4>
                         
                         <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Border Thickness ({newEvent.certificateLayout?.borderWidth}mm)</label>
                                  <input 
                                    type="range" min="0.5" max="15" step="0.5"
                                    value={newEvent.certificateLayout?.borderWidth}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, borderWidth: parseFloat(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                               </div>
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Edge Padding ({newEvent.certificateLayout?.borderPadding}mm)</label>
                                  <input 
                                    type="range" min="0" max="40" step="1"
                                    value={newEvent.certificateLayout?.borderPadding}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, borderPadding: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                               </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-black/5 dark:border-white/5">
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Header Font Size ({newEvent.certificateLayout?.headerFontSize}px)</label>
                                  <input 
                                    type="range" min="20" max="100" step="1"
                                    value={newEvent.certificateLayout?.headerFontSize}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, headerFontSize: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                               </div>
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Name Font Size ({newEvent.certificateLayout?.nameFontSize}px)</label>
                                  <input 
                                    type="range" min="20" max="100" step="1"
                                    value={newEvent.certificateLayout?.nameFontSize}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, nameFontSize: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                               </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Subtitle Size ({newEvent.certificateLayout?.subtitleFontSize}px)</label>
                                  <input 
                                    type="range" min="10" max="40" step="1"
                                    value={newEvent.certificateLayout?.subtitleFontSize}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, subtitleFontSize: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                               </div>
                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Footer Size ({newEvent.certificateLayout?.footerFontSize}px)</label>
                                  <input 
                                    type="range" min="10" max="40" step="1"
                                    value={newEvent.certificateLayout?.footerFontSize}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, footerFontSize: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                               </div>
                            </div>

                            <div className="space-y-4 pt-4 border-t border-black/5 dark:border-white/5">
                               <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                     <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Header Style</label>
                                     <select 
                                       value={newEvent.certificateLayout?.headerStyle}
                                       onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, headerStyle: e.target.value as any }})}
                                       className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl text-xs font-bold"
                                     >
                                        <option value="normal">Normal</option>
                                        <option value="bold">Bold</option>
                                        <option value="italic">Italic</option>
                                        <option value="bolditalic">Bold Italic</option>
                                     </select>
                                  </div>
                                  <div className="space-y-1">
                                     <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Name Style</label>
                                     <select 
                                       value={newEvent.certificateLayout?.nameStyle}
                                       onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, nameStyle: e.target.value as any }})}
                                       className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl text-xs font-bold"
                                     >
                                        <option value="normal">Normal</option>
                                        <option value="bold">Bold</option>
                                        <option value="italic">Italic</option>
                                        <option value="bolditalic">Bold Italic</option>
                                     </select>
                                  </div>
                               </div>

                               <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                     <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Subtitle Style</label>
                                     <select 
                                       value={newEvent.certificateLayout?.subtitleStyle}
                                       onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, subtitleStyle: e.target.value as any }})}
                                       className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl text-xs font-bold"
                                     >
                                        <option value="normal">Normal</option>
                                        <option value="bold">Bold</option>
                                        <option value="italic">Italic</option>
                                        <option value="bolditalic">Bold Italic</option>
                                     </select>
                                  </div>
                                  <div className="space-y-1">
                                     <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Footer Style</label>
                                     <select 
                                       value={newEvent.certificateLayout?.footerStyle}
                                       onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, footerStyle: e.target.value as any }})}
                                       className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl text-xs font-bold"
                                     >
                                        <option value="normal">Normal</option>
                                        <option value="bold">Bold</option>
                                        <option value="italic">Italic</option>
                                        <option value="bolditalic">Bold Italic</option>
                                     </select>
                                  </div>
                               </div>

                               <div className="space-y-2">
                                  <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Body Font Size ({newEvent.certificateLayout?.bodyFontSize}px)</label>
                                  <input 
                                    type="range" min="8" max="32" step="1"
                                    value={newEvent.certificateLayout?.bodyFontSize}
                                    onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, bodyFontSize: parseInt(e.target.value) }})}
                                    className="w-full accent-primary"
                                  />
                               </div>

                               <div className="flex items-center justify-between p-4 bg-white dark:bg-black/20 rounded-2xl border border-black/5 dark:border-white/5">
                                  <span className="text-xs font-black uppercase text-black/40 dark:text-white/40 tracking-widest">Background Pattern</span>
                                  <label className="relative inline-flex items-center cursor-pointer">
                                     <input 
                                       type="checkbox" 
                                       className="sr-only peer" 
                                       checked={newEvent.certificateLayout?.showBackgroundPattern}
                                       onChange={e => setNewEvent({...newEvent, certificateLayout: { ...newEvent.certificateLayout!, showBackgroundPattern: e.target.checked }})}
                                     />
                                     <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                                  </label>
                               </div>
                            </div>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        );
      }
      case 'quizzes':
        return (
          <div className="space-y-8 pb-32">
            {/* Creation Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Single Quiz Form */}
              <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
                <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-tighter text-black dark:text-white">
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
                          subTopicId: '', subSubTopicId: '',
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
                    <input type="text" placeholder="Question (EN)" value={newQuiz.questionEn} onChange={e => setNewQuiz({...newQuiz, questionEn: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-4 rounded-xl outline-none focus:border-[#32befa] transition-all text-sm text-black dark:text-white" />
                    <input type="text" placeholder="Question (HI)" value={newQuiz.questionHi} onChange={e => setNewQuiz({...newQuiz, questionHi: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-4 rounded-xl outline-none focus:border-[#32befa] transition-all text-sm text-black dark:text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Opt 1 (EN)" value={newQuiz.opt1En} onChange={e => setNewQuiz({...newQuiz, opt1En: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                    <input type="text" placeholder="Opt 1 (HI)" value={newQuiz.opt1Hi} onChange={e => setNewQuiz({...newQuiz, opt1Hi: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Opt 2 (EN)" value={newQuiz.opt2En} onChange={e => setNewQuiz({...newQuiz, opt2En: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                    <input type="text" placeholder="Opt 2 (HI)" value={newQuiz.opt2Hi} onChange={e => setNewQuiz({...newQuiz, opt2Hi: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Opt 3 (EN)" value={newQuiz.opt3En} onChange={e => setNewQuiz({...newQuiz, opt3En: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                    <input type="text" placeholder="Opt 3 (HI)" value={newQuiz.opt3Hi} onChange={e => setNewQuiz({...newQuiz, opt3Hi: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Opt 4 (EN)" value={newQuiz.opt4En} onChange={e => setNewQuiz({...newQuiz, opt4En: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                    <input type="text" placeholder="Opt 4 (HI)" value={newQuiz.opt4Hi} onChange={e => setNewQuiz({...newQuiz, opt4Hi: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Explanation (EN)" value={newQuiz.explanationEn} onChange={e => setNewQuiz({...newQuiz, explanationEn: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                    <input type="text" placeholder="Explanation (HI)" value={newQuiz.explanationHi} onChange={e => setNewQuiz({...newQuiz, explanationHi: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <select value={newQuiz.correct} onChange={e => setNewQuiz({...newQuiz, correct: parseInt(e.target.value)})} className="flex-1 bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl text-xs font-bold text-black/60 dark:text-white/60">
                      <option value={1}>Correct: Opt 1</option>
                      <option value={2}>Correct: Opt 2</option>
                      <option value={3}>Correct: Opt 3</option>
                      <option value={4}>Correct: Opt 4</option>
                    </select>
                    
                    <div className="p-4 bg-white dark:bg-black border border-black/5 dark:border-white/5 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 tracking-widest">Assign to Topic/Niche</span>
                         {quizTopicPath.length > 0 && (
                            <button 
                              onClick={() => setQuizTopicPath(quizTopicPath.slice(0, -1))}
                              className="text-[10px] font-bold text-primary hover:underline"
                            >
                               Back
                            </button>
                         )}
                      </div>
                      <div className="flex flex-wrap gap-1 items-center bg-black/5 dark:bg-white/5 p-2 rounded-lg">
                         <span className="text-[10px] font-bold text-black/40 dark:text-white/40">Path:</span>
                         {quizTopicPath.length === 0 ? (
                            <span className="text-[10px] font-bold text-red-500 italic">None Selected</span>
                         ) : (
                            quizTopicPath.map((node, i) => (
                               <React.Fragment key={`${node.id}-${i}`}>
                                  <span className="text-[10px] font-bold text-primary">{node.name}</span>
                                  {i < quizTopicPath.length - 1 && <ChevronRight size={10} className="text-black/20" />}
                               </React.Fragment>
                            ))
                         )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                         {(() => {
                            const options = quizTopicPath.length === 0 
                               ? topics 
                               : Object.values(quizTopicPath[quizTopicPath.length - 1].children || {});
                            
                            return options.map((opt, oIdx) => (
                               <button 
                                 key={`${opt.id}-${oIdx}`}
                                 onClick={() => {
                                    const newPath = [...quizTopicPath, opt];
                                    setQuizTopicPath(newPath);
                                    setNewQuiz({ ...newQuiz, topicId: opt.id });
                                 }}
                                 className="p-2 bg-black/5 dark:bg-white/5 rounded-lg text-[10px] font-bold hover:bg-primary hover:text-black transition-all text-left truncate"
                               >
                                  {opt.name}
                               </button>
                            ));
                         })()}
                      </div>
                    </div>
                  </div>
                  <button onClick={addQuiz} className={cn(
                    "w-full font-black p-4 rounded-xl shadow-[0_10px_20px_rgba(50,190,250,0.2)] active:scale-95 transition-all text-black",
                    editingQuizId ? "bg-yellow-500" : "bg-[#32befa]"
                  )}>
                    {editingQuizId ? 'SAVE CHANGES' : 'ADD QUIZ'}
                  </button>
                </div>
              </div>

              {/* Bulk Add Text */}
              <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
                <h3 className="text-lg font-black mb-6 flex items-center justify-between uppercase tracking-tighter text-black dark:text-white">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={20} className="text-[#32befa]" />
                    Bulk Write
                  </div>
                    <div className="flex items-center gap-2">
                       <button 
                         onClick={exportSampleCsv}
                         className="bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 px-3 py-1 rounded-full text-[10px] font-black hover:bg-yellow-500 hover:text-black transition-all uppercase"
                       >
                         Sample CSV
                       </button>
                       <button 
                         onClick={loadAllForBulkEdit}
                         className="bg-primary/20 text-primary border border-primary/20 px-3 py-1 rounded-full text-[10px] font-black hover:bg-primary hover:text-black transition-all uppercase"
                       >
                         Edit All
                       </button>
                    <button 
                      onClick={exportQuizzesCsv}
                      className="bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 border border-black/10 dark:border-white/10 px-3 py-1 rounded-full text-[10px] font-black hover:bg-black/10 dark:hover:bg-white/10 transition-all uppercase"
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
                  placeholder="Format: ID, Q_EN, Q_HI, O1_EN, O1_HI, O2_EN, O2_HI, O3_EN, O3_HI, O4_EN, O4_HI, Correct, Topic, SubTopic, SubSubTopic, Class, Subject, Exp_EN, Exp_HI"
                  className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-4 rounded-2xl h-48 outline-none focus:border-[#32befa] transition-all text-[10px] font-mono leading-relaxed text-black dark:text-white opacity-60 focus:opacity-100"
                />
                <button onClick={addBulkQuizzes} className="w-full mt-4 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white font-black p-4 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all">BATCH PROCESS</button>
              </div>
            </div>

            {/* List Section */}
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <h3 className="font-black text-sm uppercase tracking-widest text-black/40 dark:text-white/40">Registered Quizzes ({quizzes.length})</h3>
                 <div className="flex items-center gap-4">
                    <button onClick={reindexQuizzes} className="text-[8px] font-black bg-yellow-500/10 text-yellow-500 px-3 py-1.5 rounded-lg border border-yellow-500/20 hover:bg-yellow-500/20 transition-all uppercase">Re-index IDs</button>
                    <span className="text-[10px] font-bold text-[#32befa]">LATEST UPLOADS</span>
                 </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {quizzes.slice().reverse().map(q => (
                   <div key={q.id} className="bg-black/5 dark:bg-black/60 border border-black/5 dark:border-white/5 p-5 rounded-[2rem] group relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-[#32befa] opacity-0 group-hover:opacity-100 transition-all" />
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                           {!isNaN(parseInt(q.id)) && (
                              <span className="w-5 h-5 flex items-center justify-center bg-[#32befa] text-black text-[10px] font-black rounded-lg">
                                 {q.id}
                              </span>
                           )}
                           <span className="text-[8px] bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 px-2 py-0.5 rounded font-black uppercase tracking-widest">{q.topicId}</span>
                           {q.subTopicId && <span className="text-[8px] bg-[#32befa]/10 text-[#32befa] px-2 py-0.5 rounded font-black uppercase tracking-widest">{q.subTopicId}</span>}
                           {q.subSubTopicId && <span className="text-[8px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded font-black uppercase tracking-widest">{q.subSubTopicId}</span>}
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => editQuizInForm(q)} className="text-black/10 dark:text-white/10 hover:text-primary transition-colors"><Edit2 size={16} /></button>
                           <button onClick={async () => {
                             const verified = await confirm({
                               title: "Delete Quiz",
                               description: 'Delete this quiz?',
                               type: 'error'
                             });
                             if(verified) {
                               await remove(ref(db, `topicQuizzes/${q.topicId}/${q.id}`));
                             }
                           }} className="text-black/10 dark:text-white/10 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                        </div>
                      </div>
                      <h4 className="font-bold text-sm leading-tight mb-4 text-black dark:text-white">{q.question?.en || 'Untitled Question'}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {q.options?.en?.map((opt, i) => (
                           <div key={`${q.id}-opt-${i}`} className={cn(
                             "p-2 rounded-xl text-[10px] font-bold truncate",
                             i === q.correctAnswerIndex ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-black/5 dark:bg-white/5 text-black/20 dark:text-white/20"
                           )}>
                             {opt}
                           </div>
                        ))}
                      </div>
                   </div>
                 ))}
               </div>
               {quizzes.length === 0 && <p className="text-center text-black/20 dark:text-white/20 italic p-12">No quizzes created yet</p>}
            </div>
          </div>
        );
      case 'bots':
        const botPlayers = users.filter(u => u.isBot);
        return (
          <div className="space-y-6 pb-32">
             <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-black flex items-center gap-2 uppercase tracking-tighter text-black dark:text-white">
                    <Bot size={20} className="text-[#32befa]" />
                    Bot Engine
                  </h3>
                  <label className="flex items-center gap-2 bg-[#32befa] text-black px-4 py-2 rounded-xl font-black text-xs cursor-pointer hover:scale-105 transition-all">
                    <Upload size={16} />
                    BULK DATA
                    <input type="file" accept=".csv" className="hidden" onChange={e => handleCsvUpload(e, 'bots')} />
                  </label>
                </div>
                <p className="text-[10px] text-black/30 dark:text-white/30 font-bold uppercase tracking-widest leading-relaxed">
                  CSV Pattern: name, xp
                </p>
             </div>

             <div className="space-y-4">
               <h3 className="text-sm font-black text-black/20 dark:text-white/20 uppercase tracking-widest">Active Simulators ({botPlayers.length})</h3>
               {botPlayers.length === 0 ? (
                  <p className="text-center p-8 text-black/10 dark:text-white/10 italic">Zero bots active</p>
               ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {botPlayers.map(b => (
                       <div key={b.id} className="bg-black/5 dark:bg-[#111] p-4 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between text-black dark:text-white">
                          <div className="flex items-center gap-3">
                             <div className="w-8 h-8 bg-[#32befa]/20 rounded-lg flex items-center justify-center text-[#32befa]">
                                <Bot size={16} />
                             </div>
                             <div>
                                <p className="font-bold text-sm tracking-tight">{b.name}</p>
                                <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase">{b.xp} XP • LVL {b.rank}</p>
                             </div>
                          </div>
                          <button onClick={() => deleteUser(b.id)} className="p-2 text-black/10 dark:text-white/10 hover:text-red-500 transition-colors">
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
            <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
               <h3 className="text-xl font-black mb-6 uppercase tracking-tighter flex items-center gap-2 text-black dark:text-white">
                 <Palette size={24} className="text-[#32befa]" />
                 Global Skin Management
               </h3>
               <p className="text-sm text-black/40 dark:text-white/40 mb-8 font-bold uppercase tracking-widest">Selected skin will sync to all active players instantly.</p>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(SKINS).map(([id, skin]) => (
                    <button 
                      key={id}
                      onClick={() => setGlobalSkin(id)}
                      className={cn(
                        "p-6 rounded-[2rem] border-2 text-left transition-all relative overflow-hidden group",
                        "hover:scale-[1.02] active:scale-[0.98]",
                        id === currentSkin ? "bg-primary/20 border-primary shadow-[0_10px_30px_rgba(var(--primary-color),0.2)]" : "bg-black/5 dark:bg-black/40 border-black/5 dark:border-white/5"
                      )}
                    >
                       <div className="absolute top-0 right-0 p-4">
                          <div 
                            className="w-8 h-8 rounded-full shadow-lg" 
                            style={{ backgroundColor: skin.primary }}
                          />
                       </div>
                       <h4 className="font-black text-lg mb-1 text-black dark:text-white">{skin.name}</h4>
                       <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Primary: {skin.primary}</p>
                    </button>
                  ))}
               </div>
            </div>
          </div>
        );
      case 'feedback':
        return (
          <div className="space-y-6 pb-32">
             <div className="flex items-center justify-between px-2">
                <div>
                   <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Player Feedback</h2>
                   <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Latest messages from the arena</p>
                </div>
                <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl border border-primary/20 text-xs font-black uppercase tracking-widest">
                   {feedback.length} Entries
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...feedback].reverse().map((f) => (
                   <div key={f.id} className="bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5 p-6 rounded-[2rem] space-y-4 hover:border-primary/20 transition-all flex flex-col group relative">
                      <div className="flex items-start justify-between">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary font-black uppercase border border-primary/10">
                               {f.userName?.[0] || 'A'}
                            </div>
                            <div>
                               <h4 className="font-bold text-sm text-black dark:text-white">{f.userName || 'Anonymous'}</h4>
                               <p className="text-[8px] font-bold text-black/20 dark:text-white/20 uppercase tracking-widest font-mono">ID: {f.userId}</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-1.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                               <Star 
                                 key={star} 
                                 size={10} 
                                 className={cn(star <= (f.rating || 0) ? "text-yellow-500 fill-yellow-500" : "text-black/10 dark:text-white/10")} 
                               />
                            ))}
                         </div>
                      </div>

                      <div className="bg-white/5 dark:bg-black/20 p-4 rounded-2xl border border-black/10 dark:border-white/5">
                         <p className="text-xs text-black/70 dark:text-white/70 leading-relaxed italic">"{f.comment}"</p>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                         <span className="text-[8px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">
                            {new Date(f.timestamp).toLocaleDateString()} • {new Date(f.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                         </span>
                         <button 
                           onClick={async () => {
                             const verified = await confirm({
                               title: "Dismiss Feedback",
                               description: "Dismiss this feedback?",
                               type: 'confirm'
                             });
                             if (verified) {
                                await remove(ref(db, `feedback/${f.id}`));
                             }
                           }}
                           className="text-red-500/30 hover:text-red-500 transition-colors p-2"
                         >
                            <Trash2 size={16} />
                         </button>
                      </div>
                   </div>
                ))}

                {feedback.length === 0 && (
                   <div className="col-span-full py-20 text-center opacity-10">
                      <MessageSquare size={64} className="mx-auto mb-4" />
                      <p className="font-black uppercase tracking-widest">No feedback records found</p>
                   </div>
                )}
             </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-white dark:bg-black text-black dark:text-white relative transition-colors duration-300">
       {/* Mobile Menu Toggle */}
       <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-[#050505] border-b border-black/5 dark:border-white/5 flex items-center justify-between px-6 z-[160] transition-colors duration-300">
          <div className="flex items-center gap-2">
             <Shield className="text-primary" size={24} />
             <h2 className="text-lg font-black tracking-tighter text-black dark:text-white">ADMIN</h2>
          </div>
          <div className="flex items-center gap-2">
             <button 
               onClick={() => setIsDark(!isDark)}
               className="p-2 bg-black/5 dark:bg-white/5 rounded-xl text-black/60 dark:text-white/60 active:scale-95 transition-all"
             >
               {isDark ? <Moon size={20} /> : <Sun size={20} />}
             </button>
             <button 
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
               className="p-2 bg-black/5 dark:bg-white/5 rounded-xl text-black/60 dark:text-white/60"
             >
               {isSidebarOpen ? <CloseIcon size={24} /> : <Menu size={24} />}
             </button>
          </div>
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
         "fixed md:sticky top-0 left-0 h-full w-64 border-r border-black/5 dark:border-white/5 bg-white dark:bg-[#050505] p-6 flex flex-col gap-8 z-[155] transition-transform duration-300 md:translate-x-0 overflow-y-auto",
         isSidebarOpen ? "translate-x-0" : "-translate-x-full"
       )}>
          <div className="flex items-center gap-3">
             <Shield className="text-primary" size={32} />
             <h2 className="text-xl font-black tracking-tighter text-black dark:text-white">ADMIN</h2>
          </div>

          <nav className="flex-1 space-y-2">
             {[
               { id: 'users', label: 'Players', icon: Users },
               { id: 'events', label: 'Events', icon: Calendar },
               { id: 'certificate', label: 'Cert Editor', icon: Shield },
               { id: 'topics', label: 'Topics', icon: HelpCircle },
               { id: 'quizzes', label: 'Quizzes', icon: FileText },
               { id: 'bots', label: 'Bots', icon: Bot },
               { id: 'feedback', label: 'Support', icon: MessageSquare },
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
                   activeSubTab === tab.id ? "bg-primary text-black" : "text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5"
                 )}
               >
                 <tab.icon size={18} />
                 {tab.label}
               </button>
             ))}
          </nav>
          
          <div className="pt-8 border-t border-black/5 dark:border-white/5 space-y-6">
             <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase tracking-[0.2em] mb-4">Internal System</p>
             <div className="p-4 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
                <p className="text-[8px] font-black text-primary uppercase mb-1">Database Sync</p>
                <p className="text-[10px] font-bold text-black/60 dark:text-white/60">Live Status: Active</p>
             </div>
          </div>
       </div>

       {/* Main Content */}
       <div className="flex-1 p-6 md:p-10 pt-24 md:pt-10 overflow-y-auto max-h-screen scrollbar-hide bg-gray-50 dark:bg-transparent transition-colors duration-300">
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
