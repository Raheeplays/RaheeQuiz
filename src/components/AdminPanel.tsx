import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, firebaseConfig } from '../firebase/config';
import { ref, onValue, set, push, remove, get, update, query, orderByChild, equalTo } from 'firebase/database';
import { User, Topic, Quiz, Feedback, QuizHistory, SpecialMessage, Ad } from '../types';
import ScoreCard from './ScoreCard';
import { Database, Folder, Shield, Users, HelpCircle, FileText, Bot, Plus, Trash2, CheckCircle, XCircle, Upload, MessageSquare, Info, Palette, ChevronRight, History as HistoryIcon, Clock, AlertTriangle, Menu, X as CloseIcon, Edit2, Coins, TrendingUp, Calendar, Sun, Moon, Star, Settings as SettingsIcon, Bell, Send, Share2, Image as ImageIcon, Search, Volume2, Play, RotateCcw, Zap, ChevronUp, ChevronDown, CornerDownRight } from 'lucide-react';
import { NotificationService, ServiceAccount } from '../services/notificationService';
import { useNotifications } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';
import { useUser } from '../contexts/UserContext';
import { useDialog } from '../contexts/DialogContext';
import { cn } from '../lib/utils';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'motion/react';
import { SKINS, Event } from '../types';
import { CLASSES, SUBJECTS } from '../constants';

import { generateCertificate } from '../utils/certificate';
import CertificatePreview from './CertificatePreview';

function flattenTopics(nodes: Topic[], depth = 0): { id: string; name: string; label: string }[] {
  let result: { id: string; name: string; label: string }[] = [];
  if (!nodes || !Array.isArray(nodes)) return result;
  nodes.forEach(node => {
    const indent = "— ".repeat(depth);
    result.push({
      id: node.id,
      name: node.name,
      label: `${indent}${node.name} (${node.id})`
    });
    if (node.children) {
      result = [...result, ...flattenTopics(Object.values(node.children), depth + 1)];
    }
  });
  return result;
}

export default function AdminPanel() {
  const { isDark, setIsDark } = useTheme();
  const { currentUser: adminUser, settings, impersonateBot, isImpersonating, logout } = useUser();
  const { alert, confirm } = useDialog();
  const [activeSubTab, setActiveSubTab] = useState('users');
  const [users, setUsers] = useState<User[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [specialMessages, setSpecialMessages] = useState<SpecialMessage[]>([]);
  const [currentSkin, setCurrentSkin] = useState('rahee');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userHistory, setUserHistory] = useState<QuizHistory[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editName, setEditName] = useState('');
  const [editId, setEditId] = useState('');
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [selectedQuizKeys, setSelectedQuizKeys] = useState<string[]>([]);
  const [bulkTargetTopicId, setBulkTargetTopicId] = useState<string>('');
  const allFlattenedTopics = useMemo(() => flattenTopics(topics), [topics]);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicPath, setTopicPath] = useState<string[]>([]); // Array of IDs representing the path
  const [quizTopicPath, setQuizTopicPath] = useState<Topic[]>([]); 
  const [newNode, setNewNode] = useState<{ id: string; name: string; description: string; order?: number }>({ id: '', name: '', description: '', order: 0 });
  const [nodeEditMode, setNodeEditMode] = useState<string | null>(null);
  const [notifForm, setNotifForm] = useState({
    title: '',
    body: '',
    imageUrl: '',
    targetType: 'all' as 'all' | 'topic' | 'token' | 'player',
    topic: 'all_users',
    token: '',
    targetUserId: ''
  });
  const [dbExplorerPath, setDbExplorerPath] = useState<string[]>([]);
  const [dbExplorerData, setDbExplorerData] = useState<any>(null);
  const [tokenLinkInput, setTokenLinkInput] = useState('');
  const [localUpdateCode, setLocalUpdateCode] = useState('');
  const [localUpdateUrl, setLocalUpdateUrl] = useState('');
  const [localUpdateMessage, setLocalUpdateMessage] = useState('');

  useEffect(() => {
    if (settings) {
      setLocalUpdateCode(settings.code || settings.updateCodeSettings?.code || '');
      setLocalUpdateUrl(settings.updateCodeSettings?.updateUrl || '');
      setLocalUpdateMessage(settings.updateCodeSettings?.message || '');
    }
  }, [settings]);

  useEffect(() => {
    setTokenLinkInput('');
  }, [selectedUser?.id]);
  const { serviceAccount, setServiceAccount } = useNotifications();
  const [notifSchedules, setNotifSchedules] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponLogs, setCouponLogs] = useState<any[]>([]);
  const [referralLogs, setReferralLogs] = useState<any[]>([]);
  const [adLogs, setAdLogs] = useState<any[]>([]);
  const [newCouponForm, setNewCouponForm] = useState({ code: '', value: 100, count: 1 });
  const [customTemplates, setCustomTemplates] = useState({
    challenge: { title: 'New Challenge!', body: '{player} has challenged you to a match!' },
    rankUp: { title: 'Rank Increased!', body: 'Congratulations! You reached Rank {rank}!' },
    dailyReset: { title: 'Daily Leaderboard Reset!', body: 'The daily leaderboard has reset! You finished at Rank #{rank}. Start playing to climb back up!' },
    weeklyReset: { title: 'Weekly Arena Reset!', body: 'A new week begins! Your final rank was #{rank}. Can you top the charts this week?' },
    friendRequest: { title: 'New Friend Request', body: '{player} wants to be your friend!' },
    friendAccept: { title: 'Friend Request Accepted', body: '{player} accepted your friend request!' },
    questionOrder: 'random' // 'random' or 'sequential'
  });
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('');
  const [searchTokenUser, setSearchTokenUser] = useState('');
  const [certPreviewData, setCertPreviewData] = useState<any>(null);
  const [newAdTitle, setNewAdTitle] = useState('');
  const [newAdMediaType, setNewAdMediaType] = useState<'video' | 'image' | 'text'>('video');
  const [newAdMediaUrl, setNewAdMediaUrl] = useState('');
  const [newAdDuration, setNewAdDuration] = useState(15);
  const [newAdRewardValue, setNewAdRewardValue] = useState('');
  const [isAddingAd, setIsAddingAd] = useState(false);
  const [custForm, setCustForm] = useState({
    correctSound: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
    incorrectSound: 'https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3',
    vibrationEnabled: true,
    correctVibration: 50,
    incorrectVibration: 200,
    primaryColor: '#32befa',
    accentColor: '#0088cc',
    animationIntensity: 1
  });

  useEffect(() => {
    onValue(ref(db, 'settings/customization'), s => {
      if (s.exists()) {
        setCustForm(prev => ({ ...prev, ...s.val() }));
      }
    });
  }, []);

  const saveCustomization = async () => {
    await set(ref(db, 'settings/customization'), custForm);
    await alert({ title: 'Success', description: 'App customization updated!', type: 'success' });
  };

  const resetCustomization = async () => {
    const verified = await confirm({
      title: 'Reset Customization',
      description: 'Are you sure you want to reset all themes and audio settings to defaults? This will clear all overrides.',
      type: 'confirm'
    });
    if (!verified) return;

    const defaults = {
      correctSound: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
      incorrectSound: 'https://assets.mixkit.co/active_storage/sfx/2014/2014-preview.mp3',
      vibrationEnabled: true,
      correctVibration: 50,
      incorrectVibration: 200,
      primaryColor: '#32befa',
      accentColor: '#0088cc',
      animationIntensity: 1
    };

    await set(ref(db, 'settings/customization'), defaults);
    setCustForm(defaults);
    await alert({ title: 'Reset Complete', description: 'Customization has been restored to defaults.', type: 'info' });
  };

  const testSound = (url: string) => {
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = 0.5;
    audio.play().catch(e => {
       console.error("Sound preview failed:", e);
       alert({ title: "Playback Failed", description: "Could not play sound from the provided URL.", type: "error" });
    });
  };

  const testVibration = (duration: number) => {
    if (navigator.vibrate) {
      navigator.vibrate(duration);
    } else {
      alert({ title: "Not Supported", description: "Vibration is not supported on this device/browser.", type: "info" });
    }
  };

  useEffect(() => {
    onValue(ref(db, 'notificationSchedules'), s => {
      if (s.exists()) {
        const data = s.val();
        setNotifSchedules(Object.entries(data).filter(([_, val]) => val !== null).map(([key, val]: [string, any]) => ({ ...val, id: key })));
      } else {
        setNotifSchedules([]);
      }
    });

    onValue(ref(db, 'customNotifications'), s => {
      if (s.exists()) {
        setCustomTemplates(prev => ({ ...prev, ...s.val() }));
      }
    });

    onValue(ref(db, 'specialMessages'), s => {
      if (s.exists()) {
        const data = s.val();
        const allMsgs: SpecialMessage[] = [];
        Object.keys(data).forEach(uId => {
          const userMsgs = data[uId];
          Object.keys(userMsgs).forEach(mId => {
            allMsgs.push({ ...userMsgs[mId], id: mId, userId: uId });
          });
        });
        setSpecialMessages(allMsgs.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        setSpecialMessages([]);
      }
    });
  }, []);

  useEffect(() => {
    const dbRef = ref(db, dbExplorerPath.join('/') || '/');
    return onValue(dbRef, (snapshot) => {
      setDbExplorerData(snapshot.exists() ? snapshot.val() : null);
    });
  }, [dbExplorerPath]);

  const handleServiceAccountUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.project_id && json.private_key && json.client_email) {
          setServiceAccount(json);
          alert({ title: 'Success', description: 'Admin SDK Key loaded successfully for this session.', type: 'success' });
        } else {
          throw new Error('Invalid Service Account format');
        }
      } catch (err) {
        alert({ title: 'Error', description: 'Invalid JSON file. Please provide a valid Firebase Service Account key.', type: 'error' });
      }
    };
    reader.readAsText(file);
  };

  const sendNotification = async (immediate = true) => {
    if (!serviceAccount) {
      await alert({ title: 'Error', description: 'Please upload Admin SDK JSON first.', type: 'error' });
      return;
    }
    if (!notifForm.title || !notifForm.body) {
      await alert({ title: 'Error', description: 'Title and Body are required.', type: 'error' });
      return;
    }

    if (!immediate && !scheduleTime) {
      await alert({ title: 'Error', description: 'Please set a schedule time.', type: 'error' });
      return;
    }

    setIsSendingNotif(true);
    try {
      if (immediate) {
        if (notifForm.targetType === 'player') {
          const tokensSnap = await get(ref(db, `fcmTokens/${notifForm.targetUserId}`));
          if (!tokensSnap.exists()) {
            throw new Error('No FCM tokens found for this player.');
          }
          const tokens = Object.values(tokensSnap.val()) as string[];
          for (const token of tokens) {
            await NotificationService.sendToToken(serviceAccount, token, notifForm.title, notifForm.body, notifForm.imageUrl);
          }
        } else if (notifForm.targetType === 'all') {
          await NotificationService.sendToAll(serviceAccount, notifForm.title, notifForm.body, notifForm.imageUrl);
        } else if (notifForm.targetType === 'topic') {
          await NotificationService.sendToTopic(serviceAccount, notifForm.topic, notifForm.title, notifForm.body, notifForm.imageUrl);
        } else {
          await NotificationService.sendToToken(serviceAccount, notifForm.token, notifForm.title, notifForm.body, notifForm.imageUrl);
        }
        await alert({ title: 'Success', description: 'Notification sent successfully!', type: 'success' });
      } else {
        const scheduleRef = push(ref(db, 'notificationSchedules'));
        await set(scheduleRef, {
          ...notifForm,
          scheduledTime: new Date(scheduleTime).getTime(),
          status: 'pending',
          createdAt: Date.now()
        });
        await alert({ title: 'Success', description: 'Notification scheduled!', type: 'success' });
      }
    } catch (err: any) {
      await alert({ title: 'Error', description: err.message, type: 'error' });
    } finally {
      setIsSendingNotif(false);
    }
  };

  const updateTemplates = async () => {
    await set(ref(db, 'customNotifications'), customTemplates);
    await alert({ title: 'Success', description: 'Templates updated!', type: 'success' });
  };

  const linkTokenToUser = async (userId: string, token: string) => {
    if (!token) return;
    try {
      const tokensRef = ref(db, `fcmTokens/${userId}`);
      const snapshot = await get(tokensRef);
      if (snapshot.exists()) {
        const existingTokens = Object.values(snapshot.val());
        if (existingTokens.includes(token)) {
          await alert({ title: 'Info', description: 'This token is already linked.', type: 'info' });
          return;
        }
      }
      await push(ref(db, `fcmTokens/${userId}`), token);
      await alert({ title: 'Success', description: 'Token linked to user!', type: 'success' });
    } catch (err: any) {
      console.error("Token link failed:", err);
      await alert({ title: 'Error', description: 'Failed to link token: ' + err.message, type: 'error' });
    }
  };

  // Notification Schedule Runner
  useEffect(() => {
    if (!serviceAccount || notifSchedules.length === 0) return;

    const runSchedules = async () => {
      const now = Date.now();
      const dueSchedules = notifSchedules.filter(s => new Date(s.scheduledTime).getTime() <= now);

      for (const schedule of dueSchedules) {
        try {
          const authObj = {
            client_email: serviceAccount.client_email,
            private_key: serviceAccount.private_key,
            project_id: serviceAccount.project_id
          };

          const payload = {
            title: schedule.title,
            body: schedule.body,
            image: schedule.imageUrl
          };

          if (schedule.targetType === 'player') {
            const tokensSnap = await get(ref(db, `fcmTokens/${schedule.targetUserId}`));
            if (tokensSnap.exists()) {
              const tokens = Object.values(tokensSnap.val()) as string[];
              for (const token of tokens) {
                await NotificationService.sendToToken(authObj, token, payload);
              }
            }
          } else if (schedule.targetType === 'all') {
            await NotificationService.sendToAll(authObj, payload);
          } else if (schedule.targetType === 'topic') {
            await NotificationService.sendToTopic(authObj, schedule.topic || 'all_users', payload);
          } else if (schedule.targetType === 'token') {
            await NotificationService.sendToToken(authObj, schedule.token || '', payload);
          }

          // Remove after sending
          await remove(ref(db, `notificationSchedules/${schedule.id}`));
        } catch (error) {
          console.error('Failed to send scheduled notification:', error);
        }
      }
    };

    const interval = setInterval(runSchedules, 60000); // Check every minute
    runSchedules(); // Run immediately on load

    return () => clearInterval(interval);
  }, [serviceAccount, notifSchedules]);

  useEffect(() => {
    onValue(ref(db, 'coupons'), s => {
      if (s.exists()) {
        setCoupons(Object.values(s.val()));
      } else {
        setCoupons([]);
      }
    });
    onValue(ref(db, 'couponLogs'), s => {
      if (s.exists()) {
        const allLogs: any[] = [];
        Object.values(s.val()).forEach((userLogs: any) => {
          Object.values(userLogs).forEach(log => allLogs.push(log));
        });
        setCouponLogs(allLogs.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        setCouponLogs([]);
      }
    });
    onValue(ref(db, 'referralLogs'), s => {
      if (s.exists()) {
        setReferralLogs(Object.values(s.val()).sort((a: any, b: any) => b.timestamp - a.timestamp));
      } else {
        setReferralLogs([]);
      }
    });
    onValue(ref(db, 'adLogs'), s => {
      if (s.exists()) {
        setAdLogs(Object.values(s.val()).sort((a: any, b: any) => b.timestamp - a.timestamp));
      } else {
        setAdLogs([]);
      }
    });
  }, []);

  const generateCoupons = async () => {
    if (newCouponForm.value <= 0) return;
    const count = Math.min(100, Math.max(1, newCouponForm.count));
    const value = newCouponForm.value;
    const createdBy = adminUser?.username || adminUser?.name || 'admin';
    const timestamp = Date.now();

    try {
      const updates: any = {};
      for (let i = 0; i < count; i++) {
        let code = newCouponForm.code;
        if (!code || count > 1) {
          code = Math.random().toString(36).substring(2, 8).toUpperCase();
        }
        
        updates[`coupons/${code}`] = {
          code,
          value,
          isUsed: false,
          createdAt: timestamp,
          createdBy
        };
      }
      await update(ref(db), updates);
      await alert({ title: 'Success', description: `Generated ${count} coupon(s) of value ${value} coins.`, type: 'success' });
      setNewCouponForm({ code: '', value: 100, count: 1 });
    } catch (err: any) {
      await alert({ title: 'Error', description: err.message, type: 'error' });
    }
  };

  const deleteCoupon = async (code: string) => {
    const verified = await confirm({
      title: 'Delete Coupon',
      description: `Permanently delete coupon "${code}"?`,
      type: 'error'
    });
    if (!verified) return;
    await remove(ref(db, `coupons/${code}`));
  };

  const clearCouponLogs = async () => {
    const verified = await confirm({
      title: 'Clear Logs',
      description: 'Delete all coupon redemption logs?',
      type: 'error'
    });
    if (!verified) return;
    await remove(ref(db, 'couponLogs'));
  };

  const clearReferralLogs = async () => {
    const verified = await confirm({
      title: 'Clear Referral Logs',
      description: 'Delete all referral logs?',
      type: 'error'
    });
    if (!verified) return;
    await remove(ref(db, 'referralLogs'));
  };

  const clearAdLogs = async () => {
    const verified = await confirm({
      title: 'Clear Impression History',
      description: 'Delete all ad log history? This is permanent.',
      type: 'error'
    });
    if (!verified) return;
    await remove(ref(db, 'adLogs'));
  };

  // Create state
  const [newTopic, setNewTopic] = useState({
    name: '',
    order: 0
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
    correct: 1, topicId: '', 
    explanationEn: '', explanationHi: '',
    hintEn: '', hintHi: '',
    questionImage: '',
    opt1Image: '', opt2Image: '', opt3Image: '', opt4Image: ''
  });

    // Player creation state
    const [isAddingUser, setIsAddingUser] = useState(false);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [newPlayerUsername, setNewPlayerUsername] = useState('');
    const [newPlayerPassword, setNewPlayerPassword] = useState('');
    const [isCreatingUser, setIsCreatingUser] = useState(false);

    // Bot creation state
    const [isAddingBot, setIsAddingBot] = useState(false);
    const [newBotName, setNewBotName] = useState('');
    const [newBotUsername, setNewBotUsername] = useState('');
    const [newBotXP, setNewBotXP] = useState(0);
    const [isCreatingBot, setIsCreatingBot] = useState(false);

  useEffect(() => {
    onValue(ref(db, 'users'), s => {
      if (s.exists()) {
        const data = s.val();
        const allUsers = Object.entries(data).filter(([_, val]) => val !== null).map(([key, val]: [string, any]) => ({ ...val, id: key })) as User[];
        setUsers(allUsers);
      }
    });

    onValue(ref(db, 'topics'), s => {
      if (s.exists()) {
        const data = s.val();
        const list = Object.entries(data).filter(([_, val]) => val !== null).map(([key, val]: [string, any]) => ({ ...val, id: key })) as Topic[];
        list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        setTopics(list);
      }
    });
    
    // Fetch all quizzes from all topics for admin panel listing
    onValue(ref(db, 'topicQuizzes'), s => {
      if (s.exists()) {
        const allTopicsData = s.val();
        let flatQuizzes: Quiz[] = [];
        Object.entries(allTopicsData).forEach(([topicId, topicData]: [string, any]) => {
          if (!topicData) return;
          const quizzesWithId = Object.entries(topicData)
            .filter(([_, qVal]) => qVal !== null)
            .map(([qId, qVal]: [string, any]) => ({
              ...qVal,
              id: qId,
              topicId: topicId
            }));
          flatQuizzes = [...flatQuizzes, ...quizzesWithId];
        });
        setQuizzes(flatQuizzes);
      }
    });

    onValue(ref(db, 'feedback'), s => {
      if (s.exists()) {
        const data = s.val();
        setFeedback(Object.entries(data).filter(([_, val]) => val !== null).map(([key, val]: [string, any]) => ({ ...val, id: key })));
      }
    });
    onValue(ref(db, 'ads'), s => {
      if (s.exists()) {
        const data = s.val();
        setAds(Object.entries(data).filter(([_, val]) => val !== null).map(([key, val]: [string, any]) => ({ ...val, id: key })) as Ad[]);
      } else {
        setAds([]);
      }
    });
    onValue(ref(db, 'settings/activeSkin'), s => s.exists() && setCurrentSkin(s.val()));
    onValue(ref(db, 'events'), s => {
      if (s.exists()) {
        const data = s.val();
        setEvents(Object.entries(data).filter(([_, val]) => val !== null).map(([key, val]: [string, any]) => ({ ...val, id: key })));
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
            .filter(([_, val]) => val !== null)
            .map(([key, val]: [string, any]) => ({ ...val, id: key }))
            .filter((h: any) => h.userId === selectedUser.id);
          setUserHistory(mapped.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)));
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
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const verified = await confirm({
      title: "Delete Player",
      description: `Target: ${user.name}. All data will be lost. Proceed?`,
      type: 'confirm'
    });
    if (!verified) return;

    try {
      await remove(ref(db, `users/${userId}`));
      if (selectedUser?.id === userId) setSelectedUser(null);
    } catch (error: any) {
      console.error("Delete failed:", error);
      await alert({ title: "Error", description: 'Failed to delete user: ' + error.message, type: 'error' });
    }
  };

  const saveServiceAccountToCloud = async () => {
    if (!serviceAccount) return;
    const verified = await confirm({
      title: "Save to Cloud",
      description: "Do you want to securely save this Admin SDK to the database? This allows one-click access in the future.",
      type: 'confirm'
    });
    if (!verified) return;
    try {
      await set(ref(db, 'adminConfig/serviceAccount'), serviceAccount);
      await alert({ title: 'Success', description: 'Admin SDK saved to cloud!', type: 'success' });
    } catch (err: any) {
      console.error("Save to cloud failed:", err);
      await alert({ title: 'Error', description: 'Failed to save to cloud: ' + err.message, type: 'error' });
    }
  };

  const deleteServiceAccountFromCloud = async () => {
    const verified = await confirm({
      title: "Remove from Cloud",
      description: "Are you sure you want to delete the stored Admin SDK from the database? This cannot be undone.",
      type: 'confirm'
    });
    if (!verified) return;
    try {
      await remove(ref(db, 'adminConfig/serviceAccount'));
      setServiceAccount(null);
      await alert({ title: 'Removed', description: 'Admin SDK cleared from cloud and local session.', type: 'info' });
    } catch (err: any) {
      console.error("Delete from cloud failed:", err);
      await alert({ title: 'Error', description: 'Failed to delete from cloud: ' + err.message, type: 'error' });
    }
  };

  const createPlayerAccount = async () => {
    if (!newPlayerName || !newPlayerUsername || !newPlayerPassword) {
      await alert({ title: 'Error', description: 'All fields are required', type: 'error' });
      return;
    }

    const cleanUsername = newPlayerUsername.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    const finalEmail = `${cleanUsername}@Rahee.in`;
    
    setIsCreatingUser(true);
    try {
      // 1. Proactive check if username exists in RTDB
      const usersRef = ref(db, 'users');
      const usernameQuery = query(usersRef, orderByChild('username'), equalTo(cleanUsername));
      const nameCheck = await get(usernameQuery);
      
      if (nameCheck.exists()) {
        await alert({ title: 'Error', description: 'Username already taken', type: 'error' });
        setIsCreatingUser(false);
        return;
      }

      // 2. Create secondary auth instance to avoid signing out the admin
      const secondaryApp = initializeApp(firebaseConfig, `SecondaryApp_${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      
      // 3. Create Auth User
      const authResult = await createUserWithEmailAndPassword(secondaryAuth, finalEmail, newPlayerPassword);
      const uid = authResult.user.uid;

      // 4. Create DB User profile
      const userRef = ref(db, `users/${uid}`);
      const newUser: User = {
        id: uid,
        name: newPlayerName,
        email: finalEmail,
        username: cleanUsername,
        password: newPlayerPassword,
        role: 'user',
        status: 'pending', // Manual admin creation also starts as pending
        xp: 0,
        rank: 1,
        raheeCoins: 100,
        currentRound: 1,
        currentQuizIndex: 0,
        lifelines: { fiftyFifty: 1, changeQuiz: 1, audiencePoll: 1, hint: 1 },
        language: 'en',
        scores: {},
        selectedTopicId: null
      };

      await set(userRef, newUser);
      
      // 5. Cleanup secondary app
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

      await alert({ title: 'Success', description: 'Player account created successfully!', type: 'success' });
      setIsAddingUser(false);
      setNewPlayerName('');
      setNewPlayerUsername('');
      setNewPlayerPassword('');

    } catch (err: any) {
      console.error("Failed to create user:", err);
      let msg = err.message;
      if (err.code === 'auth/email-already-in-use' || (msg && msg.includes('auth/email-already-in-use'))) {
        msg = "Username already taken";
      }
      await alert({ title: 'Error', description: msg, type: 'error' });
    } finally {
      setIsCreatingBot(false);
    }
  };

  const createBot = async () => {
    if (!newBotName || !newBotUsername) {
      await alert({ title: 'Error', description: 'Name and Username are required', type: 'error' });
      return;
    }

    const cleanUsername = newBotUsername.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    const finalEmail = `${cleanUsername}@bot.rahee.games`;
    
    setIsCreatingBot(true);
    try {
      const usersRef = ref(db, 'users');
      const usernameQuery = query(usersRef, orderByChild('username'), equalTo(cleanUsername));
      const nameCheck = await get(usernameQuery);
      
      if (nameCheck.exists()) {
        await alert({ title: 'Error', description: 'Username already taken', type: 'error' });
        setIsCreatingBot(false);
        return;
      }

      const bRef = push(ref(db, 'users'));
      const uid = bRef.key || '';

      const bot: User = {
        id: uid,
        name: newBotName,
        email: finalEmail,
        username: cleanUsername,
        role: 'user',
        status: 'approved',
        isBot: true,
        xp: newBotXP || 0,
        rank: Math.floor((newBotXP || 0) / 1600) + 1,
        currentRound: 1,
        currentQuizIndex: 0,
        selectedTopicId: 'general',
        language: 'en',
        raheeCoins: 100,
        lifelines: {
          fiftyFifty: 1,
          changeQuiz: 1,
          audiencePoll: 1,
          hint: 1
        },
        scores: {}
      };

      await set(bRef, bot);

      await alert({ title: 'Success', description: 'Bot created successfully!', type: 'success' });
      setIsAddingBot(false);
      setNewBotName('');
      setNewBotUsername('');
      setNewBotXP(0);

    } catch (err: any) {
      console.error("Failed to create bot:", err);
      await alert({ title: 'Error', description: err.message, type: 'error' });
    } finally {
      setIsCreatingBot(false);
    }
  };

  const exportBotsCsv = () => {
    const botPlayers = users.filter(u => u.isBot);
    const data = botPlayers.map(b => ({
      name: b.name,
      username: b.username,
      xp: b.xp,
      rank: b.rank,
      email: b.email
    }));
    
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `bots_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSampleBotsCsv = () => {
    const data = [
      { name: 'Bot Alpha', username: 'bot_alpha', xp: 5000 },
      { name: 'Bot Beta', username: 'bot_beta', xp: 1200 },
      { name: 'Bot Gamma', username: 'bot_gamma', xp: 8500 }
    ];
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', 'sample_bots.csv');
    link.click();
  };

  const addTopic = async () => {
    if (!newTopic.name) return;
    const topicId = editingTopicId || newTopic.name.toLowerCase().replace(/\s+/g, '_');
    const topicData: any = {
      id: topicId,
      name: newTopic.name,
      order: newTopic.order || topics.length
    };
    
    // Preserve existing children if editing
    if (editingTopicId) {
       const existingTopic = topics.find(t => t.id === editingTopicId);
       if (existingTopic?.children) {
          topicData.children = existingTopic.children;
       }
    }
    
    await set(ref(db, `topics/${topicId}`), topicData);
    setNewTopic({ name: '', order: 0 });
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
      description: newNode.description,
      order: newNode.order || 0
    };
    
    if (nodeEditMode) {
      const current = getCurrentNode();
      const existing = current?.children?.[nodeEditMode];
      if (existing?.children) {
        nodeData.children = existing.children;
      }
    }

    await set(ref(db, dbPath), nodeData);
    setNewNode({ id: '', name: '', description: '', order: 0 });
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

  const moveTopic = async (topicId: string, direction: 'up' | 'down') => {
    const index = topics.findIndex(t => t.id === topicId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === topics.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const currentTopic = topics[index];
    const otherTopic = topics[newIndex];

    const updates: any = {};
    updates[`topics/${currentTopic.id}/order`] = newIndex;
    updates[`topics/${otherTopic.id}/order`] = index;
    await update(ref(db), updates);
  };

  const moveNode = async (nodeId: string, direction: 'up' | 'down') => {
    const parent = getCurrentNode();
    if (!parent?.children) return;
    
    // Sort logic to match displayed list
    const children = Object.values(parent.children).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const index = children.findIndex(c => c.id === nodeId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === children.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const currentNode = children[index];
    const otherNode = children[newIndex];

    let parentPath = `topics/${editingTopicId}`;
    topicPath.forEach(pid => {
        parentPath += `/children/${pid}`;
    });

    const updates: any = {};
    updates[`${parentPath}/children/${currentNode.id}/order`] = newIndex;
    updates[`${parentPath}/children/${otherNode.id}/order`] = index;
    await update(ref(db), updates);
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
      question: { en: newQuiz.questionEn, hi: newQuiz.questionHi || newQuiz.questionEn },
      options: {
        en: [newQuiz.opt1En, newQuiz.opt2En, newQuiz.opt3En, newQuiz.opt4En].filter(o => o),
        hi: [newQuiz.opt1Hi || newQuiz.opt1En, newQuiz.opt2Hi || newQuiz.opt2En, newQuiz.opt3Hi || newQuiz.opt3En, newQuiz.opt4Hi || newQuiz.opt4En].filter(o => o)
      },
      correctAnswerIndex: newQuiz.correct - 1,
      explanation: { en: newQuiz.explanationEn, hi: newQuiz.explanationHi || newQuiz.explanationEn },
      hint: { en: newQuiz.hintEn, hi: newQuiz.hintHi || newQuiz.hintEn },
      questionImage: newQuiz.questionImage || '',
      optionImages: [newQuiz.opt1Image, newQuiz.opt2Image, newQuiz.opt3Image, newQuiz.opt4Image].map(img => img || '')
    };

    await set(ref(db, `topicQuizzes/${quiz.topicId}/${quizId}`), quiz);
    setNewQuiz({
      questionEn: '', questionHi: '',
      opt1En: '', opt1Hi: '',
      opt2En: '', opt2Hi: '',
      opt3En: '', opt3Hi: '',
      opt4En: '', opt4Hi: '',
      correct: 1, topicId: '', 
      explanationEn: '', explanationHi: '',
      hintEn: '', hintHi: '',
      questionImage: '',
      opt1Image: '', opt2Image: '', opt3Image: '', opt4Image: ''
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
      explanationEn: q.explanation?.en || '',
      explanationHi: q.explanation?.hi || '',
      hintEn: q.hint?.en || '',
      hintHi: q.hint?.hi || '',
      questionImage: q.questionImage || '',
      opt1Image: q.optionImages?.[0] || '',
      opt2Image: q.optionImages?.[1] || '',
      opt3Image: q.optionImages?.[2] || '',
      opt4Image: q.optionImages?.[3] || ''
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
        q.explanation?.en || '',
        q.explanation?.hi || '',
        q.hint?.en || '',
        q.hint?.hi || '',
        q.questionImage || '',
        q.optionImages?.[0] || '',
        q.optionImages?.[1] || '',
        q.optionImages?.[2] || '',
        q.optionImages?.[3] || ''
      ];
      return parts.join(', ');
    }).join('\n');
    setBulkText(csvContent);
    await alert({
      title: "Data Loaded",
      description: 'Loaded all quizzes. Format: ID, Q_EN, Q_HI, O1_EN, O1_HI, O2_EN, O2_HI, O3_EN, O3_HI, O4_EN, O4_HI, Correct, Topic, Exp_EN, Exp_HI, HINT_EN, HINT_HI, Q_IMG, O1_IMG, O2_IMG, O3_IMG, O4_IMG',
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
        let id, qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, expEn, expHi, hEn, hHi, qImg, o1Img, o2Img, o3Img, o4Img;
        
        // Check if first part is a numeric ID or looks like a question
        const isFirstPartId = !isNaN(parseInt(parts[0])) && parts[0].length < 10;
        
        if (isFirstPartId) {
          [id, qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, expEn, expHi, hEn, hHi, qImg, o1Img, o2Img, o3Img, o4Img] = parts;
        } else {
          [qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, expEn, expHi, hEn, hHi, qImg, o1Img, o2Img, o3Img, o4Img] = parts;
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
          explanation: { 
            en: expEn || '', 
            hi: expHi || expEn || '' 
          },
          hint: {
            en: hEn || '',
            hi: hHi || hEn || ''
          },
          questionImage: qImg || '',
          optionImages: [o1Img || '', o2Img || '', o3Img || '', o4Img || '']
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
               },
               hint: {
                 en: row.hintEn || row.HintEn || row.hint || row.Hint || '',
                 hi: row.hintHi || row.HintHi || row.hint || row.Hint || ''
               },
               questionImage: row.questionImage || row.QuestionImage || row.qImage || row.QImage || '',
               optionImages: [
                 row.opt1Image || row.Opt1Image || row.o1Image || row.O1Image || '',
                 row.opt2Image || row.Opt2Image || row.o2Image || row.O2Image || '',
                 row.opt3Image || row.Opt3Image || row.o3Image || row.O3Image || '',
                 row.opt4Image || row.Opt4Image || row.o4Image || row.O4Image || ''
               ]
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
              email: row.email || `${(row.name || 'bot').toLowerCase().replace(/\s+/g, '_')}@bot.rahee.games`,
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
                'changeQuiz': 0,
                'audiencePoll': 0,
                'hint': 0
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

  const renameUser = async (u: User, newName: string, newUsername: string) => {
    if (!newName || !newUsername) return;
    const cleanUsername = newUsername.toLowerCase().replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    const oldUsername = (u.username || '').toLowerCase();
    
    // Check if new username is taken by a DIFFERENT user
    if (cleanUsername !== oldUsername) {
        const usersRef = ref(db, 'users');
        const usernameQuery = query(usersRef, orderByChild('username'), equalTo(cleanUsername));
        const usernameCheck = await get(usernameQuery);
        
        if (usernameCheck.exists()) {
            const data = usernameCheck.val();
            const existingUids = Object.keys(data);
            if (existingUids.some(uid => uid !== u.id)) {
                await alert({
                  title: "Error",
                  description: 'This username is already taken',
                  type: 'error'
                });
                return;
            }
        }
    }

    const updates: any = {};
    updates[`users/${u.id}/name`] = newName;
    
    if (cleanUsername !== oldUsername) {
        updates[`users/${u.id}/username`] = cleanUsername;
    }

    try {
      await update(ref(db), updates);
      setSelectedUser(null);
      await alert({
        title: "Success",
        description: 'User updated successfully',
        type: 'success'
      });
    } catch (error: any) {
      console.error("Rename failed:", error);
      await alert({
        title: "Error",
        description: 'Update failed: ' + error.message,
        type: 'error'
      });
    }
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
      explanationEn: 'Explanation in English',
      explanationHi: 'Explanation in Hindi',
      hintEn: 'Hint in English',
      hintHi: 'Hint in Hindi',
      questionImage: 'https://example.com/question.jpg',
      opt1Image: 'https://example.com/opt1.jpg',
      opt2Image: '',
      opt3Image: '',
      opt4Image: ''
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
      explanationEn: q.explanation?.en || '',
      explanationHi: q.explanation?.hi || '',
      hintEn: q.hint?.en || '',
      hintHi: q.hint?.hi || '',
      questionImage: q.questionImage || '',
      opt1Image: q.optionImages?.[0] || '',
      opt2Image: q.optionImages?.[1] || '',
      opt3Image: q.optionImages?.[2] || '',
      opt4Image: q.optionImages?.[3] || ''
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

  const renderAdsSection = () => {
    const totalAds = ads.length;
    const activeAds = ads.filter(a => a.active).length;
    const inactiveAds = totalAds - activeAds;

    const handleCreateAd = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newAdTitle || !newAdMediaUrl) {
        await alert({ title: 'Error', description: 'Please fill in all required fields.', type: 'error' });
        return;
      }

      const newAdRef = push(ref(db, 'ads'));
      const newAd: Ad = {
        id: newAdRef.key!,
        title: newAdTitle,
        mediaType: newAdMediaType,
        mediaUrl: newAdMediaUrl,
        active: true,
        durationSeconds: Number(newAdDuration) || 15,
        rewardValue: newAdRewardValue || '',
        createdAt: Date.now()
      };

      try {
        await set(newAdRef, newAd);
        setNewAdTitle('');
        setNewAdMediaUrl('');
        setNewAdDuration(15);
        setNewAdRewardValue('');
        setIsAddingAd(false);
        await alert({ title: 'Success', description: 'Ad published successfully.', type: 'success' });
      } catch (err: any) {
        await alert({ title: 'Error', description: err.message || 'Failed to save ad.', type: 'error' });
      }
    };

    const toggleAdStatus = async (ad: Ad) => {
      try {
        await update(ref(db, `ads/${ad.id}`), { active: !ad.active });
      } catch (err: any) {
        await alert({ title: 'Error', description: err.message, type: 'error' });
      }
    };

    const handleDeleteAd = async (id: string) => {
      const isConfirmed = await confirm({
        title: 'Delete Ad',
        description: 'Are you sure you want to delete this ad? This action is permanent.',
        type: 'warning'
      });
      if (!isConfirmed) return;

      try {
        await remove(ref(db, `ads/${id}`));
        await alert({ title: 'Deleted', description: 'Ad deleted successfully.', type: 'success' });
      } catch (err: any) {
        await alert({ title: 'Error', description: err.message, type: 'error' });
      }
    };

    return (
      <div className="space-y-8 pb-32">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Ad Manager & Rewards Engine</h2>
            <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Manage in-game promotional ads & rewards</p>
          </div>
          <button
            onClick={() => setIsAddingAd(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-primary/20"
          >
            <Plus size={14} />
            Create Promotional Ad
          </button>
        </div>

        {/* Ad Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
            <p className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 mb-1">Total Campaigns</p>
            <h4 className="text-3xl font-black text-primary">{totalAds}</h4>
          </div>
          <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
            <p className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 mb-1">Active Ads</p>
            <h4 className="text-3xl font-black text-green-500">{activeAds}</h4>
          </div>
          <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
            <p className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 mb-1">Paused Ads</p>
            <h4 className="text-3xl font-black text-red-500">{inactiveAds}</h4>
          </div>
        </div>

        {/* Add Ad Drawer/Form */}
        <AnimatePresence>
          {isAddingAd && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-primary/20 space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black uppercase tracking-tight text-black dark:text-white">Create New Promotional Ad Campaign</h3>
                <button
                  onClick={() => setIsAddingAd(false)}
                  className="p-1 px-3 bg-red-500/15 text-red-500 rounded-lg text-[9px] font-bold uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreateAd} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Campaign Title</label>
                  <input
                    type="text"
                    value={newAdTitle}
                    onChange={(e) => setNewAdTitle(e.target.value)}
                    placeholder="e.g. Mega Sale - 50% Off Rahee Cards!"
                    className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/15 px-4 py-3 rounded-2xl text-xs font-bold focus:outline-none focus:border-primary text-black dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Media Type</label>
                  <select
                    value={newAdMediaType}
                    onChange={(e: any) => setNewAdMediaType(e.target.value)}
                    className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/15 px-4 py-3 rounded-2xl text-xs font-bold focus:outline-none focus:border-primary text-black dark:text-white"
                  >
                    <option value="video">Video Stream URL</option>
                    <option value="image">Banner Graphic URL</option>
                    <option value="text">Slogan / Text Display</option>
                  </select>
                </div>

                <div className="space-y-1 col-span-1 md:col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">
                    {newAdMediaType === 'text' ? 'Promotional Slogan / Message Content' : 'Media Asset URL'}
                  </label>
                  <input
                    type="text"
                    value={newAdMediaUrl}
                    onChange={(e) => setNewAdMediaUrl(e.target.value)}
                    placeholder={newAdMediaType === 'text' ? 'Enter short attractive copy...' : 'https://images.unsplash.com/... or youtube embed URL'}
                    className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/15 px-4 py-3 rounded-2xl text-xs font-bold focus:outline-none focus:border-primary text-black dark:text-white"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Force Ad Duration (Seconds)</label>
                  <input
                    type="number"
                    value={newAdDuration}
                    onChange={(e) => setNewAdDuration(Math.max(3, Number(e.target.value)))}
                    className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/15 px-4 py-3 rounded-2xl text-xs font-bold focus:outline-none focus:border-primary text-black dark:text-white"
                    min="3"
                    max="60"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Ad Target Label (Rewards Note)</label>
                  <input
                    type="text"
                    value={newAdRewardValue}
                    onChange={(e) => setNewAdRewardValue(e.target.value)}
                    placeholder="e.g. +200 Coins Booster"
                    className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/15 px-4 py-3 rounded-2xl text-xs font-bold focus:outline-none focus:border-primary text-black dark:text-white"
                  />
                </div>

                <div className="col-span-1 md:col-span-2 pt-2">
                  <button
                    type="submit"
                    className="w-full py-4 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-2xl cursor-pointer hover:bg-primary/90 hover:scale-[1.01] transition-transform active:scale-95"
                  >
                    🚀 PUBLISH PROMOTION
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing Ads List */}
        <div className="space-y-4">
          <h3 className="text-lg font-black uppercase tracking-tight text-black dark:text-white">Active Promotional Feed</h3>

          {totalAds === 0 ? (
            <div className="bg-black/5 dark:bg-[#111] p-16 rounded-[3rem] border border-dashed border-black/10 dark:border-white/10 text-center">
              <Play size={48} className="mx-auto mb-3 text-black/15 dark:text-white/15 animate-bounce" />
              <p className="font-black uppercase tracking-widest text-black/30 dark:text-white/30 text-xs text-black dark:text-white">No Ads configured in database</p>
              <p className="text-[10px] text-black/20 dark:text-white/20 mt-1">Add promotional ads for users to watch and claim free boosts!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {ads.map((ad) => (
                <div
                  key={ad.id}
                  className="p-5 bg-white dark:bg-[#111] rounded-[2.5rem] border border-black/5 dark:border-white/5 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <span className="text-[8px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg bg-primary/20 text-primary">
                        {ad.mediaType} • {ad.durationSeconds}s
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => toggleAdStatus(ad)}
                          className={`px-3 py-1 rounded-md text-[8px] font-extrabold uppercase tracking-widest ${
                            ad.active
                              ? 'bg-green-500/15 text-green-500 border border-green-500/20'
                              : 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/20'
                          }`}
                        >
                          {ad.active ? 'ACTIVE' : 'PAUSED'}
                        </button>
                        <button
                          onClick={() => handleDeleteAd(ad.id)}
                          className="p-1 px-2.5 bg-red-500/15 text-red-500 rounded-md border border-red-500/20 hover:bg-red-500 hover:text-white transition-all text-[8px] font-black"
                        >
                          DELETE
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-extrabold text-sm text-black dark:text-white uppercase leading-tight">{ad.title}</h4>
                      {ad.rewardValue && (
                        <p className="text-[9px] font-black text-purple-500 uppercase tracking-widest mt-1">
                          Reward: {ad.rewardValue}
                        </p>
                      )}
                    </div>

                    <div className="p-3 bg-black/5 dark:bg-black/40 rounded-xl max-h-[140px] overflow-hidden text-ellipsis border border-black/5 dark:border-white/5">
                      {ad.mediaType === 'image' && (
                        <img
                          src={ad.mediaUrl}
                          alt="Banner Preview"
                          className="w-full h-20 object-cover rounded-lg"
                          referrerPolicy="no-referrer"
                        />
                      )}
                      {ad.mediaType === 'text' && (
                        <p className="text-[10px] font-medium text-black/60 dark:text-white/60 italic leading-relaxed text-center py-2">
                          "{ad.mediaUrl}"
                        </p>
                      )}
                      {ad.mediaType === 'video' && (
                        <div className="w-full h-20 bg-[#151515] rounded-lg flex items-center justify-center text-white/40 text-[9px] font-bold uppercase tracking-widest gap-2">
                          <span>🎥 Video Embed Link:</span>
                          <span className="truncate max-w-[100px] text-[7px] text-gray-500">{ad.mediaUrl}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-black/5 dark:border-white/5 mt-4 pt-3 text-[9px] font-bold text-black/30 dark:text-white/30 truncate uppercase tracking-widest">
                    ID: {ad.id}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ad Viewer / Impression Logs Table */}
        <div className="space-y-4 mt-12">
          <div className="flex items-center justify-between px-2">
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight text-black dark:text-white">Ad Views & Impression Log</h3>
              <p className="text-[9px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.15em]">Real-time audit log of which players played which ad and when</p>
            </div>
            <button 
              onClick={clearAdLogs} 
              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all"
            >
              Clear Logs
            </button>
          </div>

          <div className="bg-black/5 dark:bg-[#111] rounded-[2rem] border border-black/5 dark:border-white/5 overflow-hidden">
            <div className="max-h-[450px] overflow-y-auto custom-scrollbar">
              {adLogs.length === 0 ? (
                <div className="py-16 text-center opacity-30 italic text-xs uppercase tracking-widest font-bold">
                  No ad impression logs found
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-white dark:bg-[#111] z-10 border-b border-black/5 dark:border-white/5">
                    <tr>
                      <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Player</th>
                      <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Ad Title / ID</th>
                      <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Reward Tier</th>
                      <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 dark:divide-white/5">
                    {adLogs.map((log, i) => (
                      <tr key={log.id || i} className="hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                        <td className="p-4">
                          <p className="text-[10px] font-black text-black dark:text-white">{log.userName}</p>
                          <p className="text-[8px] font-mono text-black/40 dark:text-white/40">ID: {log.userId}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-[10px] font-black text-[#32befa] uppercase tracking-tight">{log.adTitle}</p>
                          <p className="text-[8px] font-mono text-black/30 dark:text-white/30 font-bold">Ad ID: {log.adId}</p>
                        </td>
                        <td className="p-4">
                          <span className="text-[9px] font-black uppercase px-2 py-1 rounded bg-purple-500/10 text-purple-500 border border-purple-500/10">
                            Tier {log.rewardType || 'Unknown'}
                          </span>
                        </td>
                        <td className="p-4 text-[8px] font-bold text-black/45 dark:text-white/45">
                          {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMarketingSection = () => {
    const usedCoupons = coupons.filter(c => c.isUsed).length;
    const unusedCoupons = coupons.filter(c => !c.isUsed).length;

    return (
      <div className="space-y-8 pb-32">
        <div className="flex items-center justify-between">
           <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Marketing & Growth</h2>
              <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Coupons and Referral Systems</p>
           </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
              <p className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 mb-1">Total Coupons</p>
              <h4 className="text-3xl font-black text-primary">{coupons.length}</h4>
           </div>
           <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
              <p className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 mb-1">Used Coupons</p>
              <h4 className="text-3xl font-black text-green-500">{usedCoupons}</h4>
           </div>
           <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
              <p className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 mb-1">Total Referrals</p>
              <h4 className="text-3xl font-black text-[#32befa]">{referralLogs.length}</h4>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           {/* Coupon Generator */}
           <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5 space-y-6">
              <h3 className="text-lg font-black uppercase flex items-center gap-2">
                 <Plus size={20} className="text-primary" />
                 Generate Coupons
              </h3>
              <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 ml-2">Custom Code (Optional)</label>
                    <input 
                      type="text"
                      placeholder="e.g. WELCOME100"
                      value={newCouponForm.code}
                      onChange={e => setNewCouponForm({...newCouponForm, code: e.target.value})}
                      className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary transition-all uppercase"
                    />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 ml-2">Coin Value</label>
                       <input 
                         type="number"
                         value={newCouponForm.value}
                         onChange={e => setNewCouponForm({...newCouponForm, value: parseInt(e.target.value)})}
                         className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary transition-all"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 ml-2">Quantity</label>
                       <input 
                         type="number"
                         min="1"
                         max="100"
                         value={newCouponForm.count}
                         onChange={e => setNewCouponForm({...newCouponForm, count: parseInt(e.target.value)})}
                         className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary transition-all"
                       />
                    </div>
                 </div>
                 <button 
                   onClick={generateCoupons}
                   className="w-full py-4 bg-primary text-black font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                 >
                    <Zap size={18} />
                    Generate Now
                 </button>
              </div>
           </div>

           {/* Referrals & Growth Settings */}
           <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5 space-y-6">
              <h3 className="text-lg font-black uppercase flex items-center gap-2">
                 <TrendingUp size={20} className="text-[#32befa]" />
                 Referral Settings
              </h3>
              <div className="space-y-6">
                 <div className="p-6 bg-white/5 dark:bg-black/20 rounded-3xl border border-black/5 dark:border-white/5">
                    <div className="flex items-center justify-between mb-4">
                       <span className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Reward per Referral</span>
                       <span className="text-xl font-black text-[#32befa] flex items-center gap-1">
                          <Coins size={20} />
                          {settings?.referralReward || 500}
                       </span>
                    </div>
                    <p className="text-[9px] text-black/30 dark:text-white/30 font-bold uppercase leading-relaxed mb-6">Both the referrer and the joiner receive this amount upon account creation with code.</p>
                    <div className="flex gap-2">
                       {[100, 200, 500, 1000].map(val => (
                          <button 
                            key={val}
                            onClick={async () => {
                               await update(ref(db, 'settings'), { referralReward: val });
                            }}
                            className={cn(
                               "flex-1 py-3 rounded-xl text-[10px] font-black transition-all",
                               settings?.referralReward === val ? "bg-[#32befa] text-black" : "bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 hover:bg-black/10"
                            )}
                          >
                             {val}
                          </button>
                       ))}
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* Coupons List */}
        <div className="space-y-4">
           <div className="flex items-center justify-between px-2">
              <h3 className="text-sm font-black text-black/40 dark:text-white/40 uppercase tracking-widest">Active Coupons</h3>
              <button 
                onClick={async () => {
                   const v = await confirm({ title: 'Delete Unused?', description: 'Delete all unused coupons?', type: 'error' });
                   if (!v) return;
                   const unused = coupons.filter(c => !c.isUsed);
                   const updates: any = {};
                   unused.forEach(c => updates[`coupons/${c.code}`] = null);
                   await update(ref(db), updates);
                }}
                className="text-[8px] font-black text-red-500 uppercase hover:underline"
              >
                 Purge Unused
              </button>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {coupons.slice().reverse().slice(0, 24).map(c => (
                 <div key={c.code} className="bg-black/5 dark:bg-[#111] p-4 rounded-2xl border border-black/5 dark:border-white/5 relative group">
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-[10px] font-black tracking-widest text-[#32befa] bg-[#32befa]/5 px-2 py-0.5 rounded">{c.value} CR</span>
                       <button onClick={() => deleteCoupon(c.code)} className="opacity-0 group-hover:opacity-100 p-1 text-red-500/30 hover:text-red-500 transition-all">
                          <Trash2 size={12} />
                       </button>
                    </div>
                    <code className="block text-sm font-black text-black dark:text-white mb-2 font-mono truncate select-all">{c.code}</code>
                    <div className="flex items-center justify-between">
                       <span className={cn(
                          "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                          c.isUsed ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"
                       )}>
                          {c.isUsed ? 'USED' : 'ACTIVE'}
                       </span>
                       <span className="text-[8px] font-bold text-black/20 dark:text-white/20">{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                 </div>
              ))}
              {coupons.length === 0 && <div className="col-span-full py-12 text-center opacity-20 italic">No coupons found</div>}
           </div>
        </div>

        {/* Logs Tables */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
           {/* Redemption Logs */}
           <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                 <h3 className="text-sm font-black text-black/40 dark:text-white/40 uppercase tracking-widest">Redemption History</h3>
                 <button onClick={clearCouponLogs} className="text-[8px] font-black text-red-500/40 hover:text-red-500 uppercase transition-all">Clear Logs</button>
              </div>
              <div className="bg-black/5 dark:bg-[#111] rounded-[2rem] border border-black/5 dark:border-white/5 overflow-hidden">
                 <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                       <thead className="sticky top-0 bg-white dark:bg-[#111] z-10 border-b border-black/5 dark:border-white/5">
                          <tr>
                             <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">User</th>
                             <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Code</th>
                             <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Status</th>
                             <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Time</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-black/5 dark:divide-white/5">
                          {couponLogs.map((log, i) => (
                             <tr key={i} className="hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                                <td className="p-4">
                                   <p className="text-[10px] font-black text-black dark:text-white">{log.userName}</p>
                                   <p className="text-[8px] font-bold text-black/30 dark:text-white/30 truncate max-w-[80px]">@{log.userId}</p>
                                </td>
                                <td className="p-4 font-mono text-[10px] font-bold">{log.code}</td>
                                <td className="p-4">
                                   <span className={cn(
                                      "text-[8px] font-black uppercase px-2 py-0.5 rounded",
                                      log.isSuccess ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                   )}>
                                      {log.isSuccess ? 'Success' : 'Failed'}
                                   </span>
                                </td>
                                <td className="p-4 text-[8px] font-bold text-black/30 dark:text-white/30">
                                   {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>

           {/* Referral Logs */}
           <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                 <h3 className="text-sm font-black text-black/40 dark:text-white/40 uppercase tracking-widest">Referral Wins</h3>
                 <button onClick={clearReferralLogs} className="text-[8px] font-black text-red-500/40 hover:text-red-500 uppercase transition-all">Reset Referrals</button>
              </div>
              <div className="bg-black/5 dark:bg-[#111] rounded-[2rem] border border-black/5 dark:border-white/5 overflow-hidden">
                 <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                       <thead className="sticky top-0 bg-white dark:bg-[#111] z-10 border-b border-black/5 dark:border-white/5">
                          <tr>
                             <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Referrer</th>
                             <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Joiner</th>
                             <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Reward</th>
                             <th className="p-4 text-[9px] font-black uppercase text-black/40 dark:text-white/40">Time</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-black/5 dark:divide-white/5">
                          {referralLogs.map((log, i) => (
                             <tr key={i} className="hover:bg-black/5 dark:hover:bg-white/5 transition-all">
                                <td className="p-4">
                                   <p className="text-[10px] font-black text-primary">{log.referrerName}</p>
                                </td>
                                <td className="p-4">
                                   <p className="text-[10px] font-black text-black dark:text-white">{log.referredName}</p>
                                </td>
                                <td className="p-4">
                                   <div className="flex items-center gap-1 text-green-500 font-black text-[10px]">
                                      <TrendingUp size={10} />
                                      {log.rewardValue}
                                   </div>
                                </td>
                                <td className="p-4 text-[8px] font-bold text-black/30 dark:text-white/30">
                                   {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
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
                      <div className="flex flex-col gap-4 mb-6">
                         <div className="flex items-center justify-center md:justify-start gap-2">
                            <p className="text-black/40 dark:text-white/40 font-bold uppercase tracking-widest text-xs">Player ID: @{u.id}</p>
                         </div>
                         
                         <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl space-y-3">
                            <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Link FCM Token</label>
                            <div className="flex gap-2">
                               <input 
                                 value={tokenLinkInput}
                                 onChange={e => setTokenLinkInput(e.target.value)}
                                 placeholder="Paste FCM Token here..."
                                 className="flex-1 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-black dark:text-white outline-none focus:border-primary"
                               />
                               <button 
                                 onClick={async () => {
                                   if (!tokenLinkInput) return;
                                   await linkTokenToUser(u.id, tokenLinkInput);
                                   setTokenLinkInput('');
                                 }}
                                 className="bg-primary text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all"
                               >
                                  Save
                               </button>
                            </div>
                            <div className="pt-2">
                               <button 
                                 onClick={async () => {
                                   const verified = await confirm({
                                     title: "Unlink Tokens",
                                     description: "Clear all notification tokens for this player?",
                                     type: 'confirm'
                                   });
                                   if (verified) {
                                      await remove(ref(db, `fcmTokens/${u.id}`));
                                      await alert({ title: 'Success', description: 'Tokens cleared', type: 'success' });
                                   }
                                 }}
                                 className="w-full py-2 bg-red-500/10 text-red-500 rounded-xl text-[10px] font-black uppercase hover:bg-red-500 hover:text-white transition-all border border-red-500/20"
                               >
                                  Unlink All Tokens
                               </button>
                            </div>
                         </div>
                      </div>
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

                      <div className="mt-6 border-t border-black/5 dark:border-white/5 pt-6">
                        <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-3 ml-1">Topic Lock Settings</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-4 bg-white dark:bg-black rounded-2xl border border-black/5 dark:border-white/5">
                             <span className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">Allow Topic Switch</span>
                             <button 
                                onClick={() => update(ref(db, `users/${u.id}`), { canSwitchTopic: !u.canSwitchTopic })}
                                className={cn(
                                   "w-12 h-6 rounded-full transition-colors relative",
                                   u.canSwitchTopic ? "bg-green-500" : "bg-black/20 dark:bg-white/10"
                                )}
                             >
                                <div className={cn(
                                   "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                                   u.canSwitchTopic ? "left-7" : "left-1"
                                )} />
                             </button>
                          </div>
                          <div className="flex flex-col gap-1 p-4 bg-white dark:bg-black rounded-2xl border border-black/5 dark:border-white/5">
                             <span className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Fixed Topic</span>
                             <select 
                                value={u.fixedTopicId || ''}
                                onChange={(e) => update(ref(db, `users/${u.id}`), { fixedTopicId: e.target.value === '' ? null : e.target.value })}
                                className="w-full bg-black/5 dark:bg-white/5 border-none rounded-lg p-2 text-[10px] font-bold uppercase tracking-widest outline-none text-black dark:text-white"
                             >
                                <option value="">NO FIXED TOPIC</option>
                                {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                             </select>
                          </div>
                        </div>
                      </div>

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
                      <Star size={18} className="text-primary" />
                      Lives System
                   </h4>
                   <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Current Lives</p>
                           <input 
                              type="number"
                              defaultValue={u.lives?.count ?? 16}
                              key={`lives-${u.id}-${u.lives?.count}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val)) {
                                    await update(ref(db, `users/${u.id}/lives`), { count: val });
                                 }
                              }}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-3 ml-1">Status</p>
                           <button 
                             onClick={async () => {
                               const newState = !u.lives?.enabled;
                               await update(ref(db, `users/${u.id}/lives`), { enabled: newState });
                             }}
                             className={cn(
                               "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all border",
                               u.lives?.enabled 
                                 ? "bg-green-500/10 text-green-500 border-green-500/20" 
                                 : "bg-red-500/10 text-red-500 border-red-500/20"
                             )}
                           >
                             {u.lives?.enabled ? 'LIVES ENABLED' : 'LIVES DISABLED'}
                           </button>
                        </div>
                      </div>
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
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Poll Lifelines</p>
                           <input 
                              type="number"
                              defaultValue={u.lifelines?.audiencePoll ?? 0}
                              key={`poll-${u.id}-${u.lifelines?.audiencePoll}`}
                              onChange={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val)) {
                                    await update(ref(db, `users/${u.id}/lifelines`), { audiencePoll: val });
                                 }
                              }}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Hint Lifelines</p>
                           <input 
                              type="number"
                              defaultValue={u.lifelines?.hint ?? 0}
                              key={`hint-${u.id}-${u.lifelines?.hint}`}
                              onChange={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val)) {
                                    await update(ref(db, `users/${u.id}/lifelines`), { hint: val });
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

  const renderNotificationsSection = () => {
    return (
      <div className="space-y-8 pb-32">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black uppercase tracking-tighter">Notifications Dashboard</h2>
          <label className="flex items-center gap-2 bg-primary text-black px-4 py-2 rounded-xl font-black text-xs cursor-pointer hover:scale-105 transition-all">
            <Upload size={16} />
            LOAD ADMIN SDK JSON
            <input type="file" accept=".json" className="hidden" onChange={handleServiceAccountUpload} />
          </label>
        </div>

        {serviceAccount && (
          <div className="flex flex-col gap-3">
            <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl text-green-500 text-xs font-bold uppercase tracking-widest flex items-center justify-between">
               <div className="flex items-center gap-2">
                  <CheckCircle size={16} />
                  Service Account Loaded: {serviceAccount.project_id}
               </div>
               <button 
                 onClick={() => setServiceAccount(null)}
                 className="text-white/20 hover:text-red-500 transition-colors"
                 title="Unload from session"
               >
                 <XCircle size={16} />
               </button>
            </div>
            
            <div className="flex gap-2">
               <button 
                 onClick={saveServiceAccountToCloud}
                 className="flex-1 bg-primary text-black px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20"
               >
                 <HistoryIcon size={14} />
                 SAVE TO CLOUD
               </button>
               <button 
                 onClick={deleteServiceAccountFromCloud}
                 className="px-4 py-3 bg-red-500/10 text-red-500 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-500 hover:text-black transition-all"
               >
                 <Trash2 size={14} />
                 CLEAR CLOUD
               </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Send Section */}
          <div className="space-y-6">
            <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5">
              <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-tighter">
                <Send size={20} className="text-primary" />
                Send Notification
              </h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Title</label>
                  <input 
                    value={notifForm.title}
                    onChange={e => setNotifForm({...notifForm, title: e.target.value})}
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary"
                    placeholder="Notification Title"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Body</label>
                  <textarea 
                    value={notifForm.body}
                    onChange={e => setNotifForm({...notifForm, body: e.target.value})}
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary h-24"
                    placeholder="Notification Message"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Image URL (Optional)</label>
                  <div className="relative">
                    <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-primary" size={18} />
                    <input 
                      value={notifForm.imageUrl}
                      onChange={e => setNotifForm({...notifForm, imageUrl: e.target.value})}
                      className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 pl-12 rounded-2xl font-bold outline-none focus:border-primary"
                      placeholder="https://example.com/image.jpg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 col-span-2 md:col-span-1">
                    <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Target Type</label>
                    <select 
                      value={notifForm.targetType}
                      onChange={e => setNotifForm({...notifForm, targetType: e.target.value as any})}
                      className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary"
                    >
                      <option value="all">Broadcast (All Users)</option>
                      <option value="topic">Topic-wise</option>
                      <option value="player">Single Player</option>
                      <option value="token">Specific Token</option>
                    </select>
                  </div>
                  {notifForm.targetType === 'player' && (
                    <div className="space-y-1 col-span-2 md:col-span-1">
                      <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Select Player</label>
                      <select 
                        value={notifForm.targetUserId}
                        onChange={e => setNotifForm({...notifForm, targetUserId: e.target.value})}
                        className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary"
                      >
                        <option value="">Choose a player...</option>
                        {users.filter(u => !u.isBot).map(u => <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>)}
                      </select>
                    </div>
                  )}
                  {notifForm.targetType === 'topic' && (
                    <div className="space-y-1 col-span-2 md:col-span-1">
                      <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Select Topic</label>
                      <select 
                        value={notifForm.topic}
                        onChange={e => setNotifForm({...notifForm, topic: e.target.value})}
                        className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary"
                      >
                        <option value="all_users">All Users Topic</option>
                        {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  {notifForm.targetType === 'token' && (
                    <div className="space-y-1 col-span-2 md:col-span-1">
                      <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">FCM Token</label>
                      <input 
                        value={notifForm.token}
                        onChange={e => setNotifForm({...notifForm, token: e.target.value})}
                        className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-xs"
                        placeholder="Paste FCM Token"
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    disabled={isSendingNotif}
                    onClick={() => sendNotification(true)}
                    className="flex-1 bg-primary text-black font-black uppercase tracking-widest py-4 rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    <Send size={18} />
                    Send Now
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5">
               <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-tighter">
                <Clock size={20} className="text-primary" />
                Schedule Notification
              </h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Date & Time</label>
                  <input 
                    type="datetime-local"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary"
                  />
                </div>
                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendNotification(false)}
                  className="w-full bg-white/10 text-white font-black uppercase tracking-widest py-4 rounded-2xl hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                >
                  <Calendar size={18} />
                  Schedule
                </button>
              </div>
            </div>
          </div>

          {/* Tokens & Schedules Section */}
          <div className="space-y-6">
             <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5">
              <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-tighter">
                <Users size={20} className="text-primary" />
                Token Management
              </h3>
              <div className="mb-4 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                <input 
                  value={searchTokenUser}
                  onChange={e => setSearchTokenUser(e.target.value)}
                  placeholder="Search Player..."
                  className="w-full bg-black/40 border border-white/5 p-3 pl-12 rounded-xl text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                {users
                  .filter(u => !u.isBot && (u.name.toLowerCase().includes(searchTokenUser.toLowerCase()) || u.id.toLowerCase().includes(searchTokenUser.toLowerCase())))
                  .map(u => (
                  <div key={u.id} className="bg-black/20 p-4 rounded-xl border border-white/5 flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-bold">{u.name}</p>
                      <p className="text-[8px] font-mono text-white/20 uppercase">@{u.id}</p>
                    </div>
                    <button 
                      onClick={async () => {
                        const token = prompt('Paste FCM Token for this user:');
                        if (token) await linkTokenToUser(u.id, token);
                      }}
                      className="text-[8px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2 py-1 rounded hover:bg-primary hover:text-black transition-all"
                    >
                      Link Token
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5">
              <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-tighter">
                <Clock size={20} className="text-primary" />
                Active Schedules
              </h3>
              <div className="space-y-3">
                {notifSchedules.length === 0 ? (
                  <p className="text-center text-white/10 italic text-xs">No pending schedules</p>
                ) : (
                  notifSchedules.map(s => (
                    <div key={s.id} className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-2 relative group">
                      <button 
                        onClick={() => remove(ref(db, `notificationSchedules/${s.id}`))}
                        className="absolute top-2 right-2 text-white/10 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-primary px-2 py-0.5 bg-primary/10 rounded uppercase">{s.targetType}</span>
                        <span className="text-[10px] font-bold text-white/40">{new Date(s.scheduledTime).toLocaleString()}</span>
                      </div>
                      <p className="text-xs font-black truncate">{s.title}</p>
                      <p className="text-[10px] text-white/40 line-clamp-2">{s.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5">
              <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-tighter">
                <Palette size={20} className="text-primary" />
                Custom Templates
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-white/20 uppercase ml-2">Challenge Request</p>
                  <input 
                    value={customTemplates.challenge.title}
                    onChange={e => setCustomTemplates({...customTemplates, challenge: {...customTemplates.challenge, title: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none mb-1 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Title"
                  />
                  <textarea 
                    value={customTemplates.challenge.body}
                    onChange={e => setCustomTemplates({...customTemplates, challenge: {...customTemplates.challenge, body: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none h-16 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Body (Use {player} for name)"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-white/20 uppercase ml-2">Rank Increase</p>
                  <input 
                    value={customTemplates.rankUp.title}
                    onChange={e => setCustomTemplates({...customTemplates, rankUp: {...customTemplates.rankUp, title: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none mb-1 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Title"
                  />
                  <textarea 
                    value={customTemplates.rankUp.body}
                    onChange={e => setCustomTemplates({...customTemplates, rankUp: {...customTemplates.rankUp, body: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none h-16 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Body (Use {rank} for number)"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-white/20 uppercase ml-2">Daily Leaderboard Reset</p>
                  <input 
                    value={customTemplates.dailyReset.title}
                    onChange={e => setCustomTemplates({...customTemplates, dailyReset: {...customTemplates.dailyReset, title: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none mb-1 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Title"
                  />
                  <textarea 
                    value={customTemplates.dailyReset.body}
                    onChange={e => setCustomTemplates({...customTemplates, dailyReset: {...customTemplates.dailyReset, body: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none h-16 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Body (Use {rank} for number)"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-white/20 uppercase ml-2">Weekly Leaderboard Reset</p>
                  <input 
                    value={customTemplates.weeklyReset.title}
                    onChange={e => setCustomTemplates({...customTemplates, weeklyReset: {...customTemplates.weeklyReset, title: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none mb-1 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Title"
                  />
                  <textarea 
                    value={customTemplates.weeklyReset.body}
                    onChange={e => setCustomTemplates({...customTemplates, weeklyReset: {...customTemplates.weeklyReset, body: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none h-16 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Body (Use {rank} for number)"
                  />
                </div>

                <div className="bg-white/5 border border-white/5 p-2 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-primary tracking-widest px-1 mb-2">Friend Request</p>
                  <input 
                    value={customTemplates.friendRequest.title}
                    onChange={e => setCustomTemplates({...customTemplates, friendRequest: {...customTemplates.friendRequest, title: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none mb-1 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Title"
                  />
                  <textarea 
                    value={customTemplates.friendRequest.body}
                    onChange={e => setCustomTemplates({...customTemplates, friendRequest: {...customTemplates.friendRequest, body: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none h-16 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Body (Use {player} for name)"
                  />
                </div>

                <div className="bg-white/5 border border-white/5 p-2 rounded-2xl">
                  <p className="text-[10px] font-black uppercase text-primary tracking-widest px-1 mb-2">Friend Acceptance</p>
                  <input 
                    value={customTemplates.friendAccept.title}
                    onChange={e => setCustomTemplates({...customTemplates, friendAccept: {...customTemplates.friendAccept, title: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none mb-1 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Title"
                  />
                  <textarea 
                    value={customTemplates.friendAccept.body}
                    onChange={e => setCustomTemplates({...customTemplates, friendAccept: {...customTemplates.friendAccept, body: e.target.value}})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none h-16 shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Body (Use {player} for name)"
                  />
                </div>

                <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between">
                   <div>
                      <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-1">Question Delivery Order</p>
                      <p className="text-white/40 text-[8px] uppercase font-bold">Global setting for all game modes</p>
                   </div>
                   <div className="flex bg-black/40 p-1 rounded-xl">
                      <button 
                        onClick={() => { setCustomTemplates(prev => ({...prev, questionOrder: 'random'})); updateTemplates(); }}
                        className={cn("px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all", customTemplates.questionOrder === 'random' ? "bg-primary text-black" : "text-white/40 hover:text-white")}
                      >
                         Random
                      </button>
                      <button 
                        onClick={() => { setCustomTemplates(prev => ({...prev, questionOrder: 'sequential'})); updateTemplates(); }}
                        className={cn("px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all", customTemplates.questionOrder === 'sequential' ? "bg-primary text-black" : "text-white/40 hover:text-white")}
                      >
                         Sequence
                      </button>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCustomization = () => {
    return (
      <div className="space-y-8 pb-32">
        <div className="flex items-center justify-between px-2">
           <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">App Customization</h2>
              <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Global visual and audio overrides</p>
           </div>
           <div className="flex items-center gap-3">
              <button 
                onClick={resetCustomization}
                className="px-6 py-4 bg-white/5 hover:bg-red-500/10 text-black/40 dark:text-white/40 hover:text-red-500 rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <RotateCcw size={14} />
                Reset Defaults
              </button>
              <button 
                onClick={saveCustomization}
                className="px-8 py-4 bg-primary text-black rounded-[2rem] font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-primary/20"
              >
                Save Changes
              </button>
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Color Pallet */}
           <div className="bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5 p-8 rounded-[3rem] space-y-6">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Palette size={24} />
                 </div>
                 <div>
                    <h4 className="font-black uppercase tracking-tight">Theme Overrides</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Custom Colors</p>
                 </div>
              </div>
              
              <div className="space-y-4">
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-2">Primary Color</label>
                    <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 p-2 rounded-2xl border border-black/5 dark:border-white/5">
                       <input 
                         type="color" 
                         value={custForm.primaryColor}
                         onChange={e => setCustForm({...custForm, primaryColor: e.target.value})}
                         className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border-none"
                       />
                       <input 
                         type="text" 
                         value={custForm.primaryColor}
                         onChange={e => setCustForm({...custForm, primaryColor: e.target.value})}
                         className="bg-transparent text-sm font-mono outline-none flex-1 text-black dark:text-white"
                       />
                    </div>
                 </div>

                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-60 ml-2">Accent Color</label>
                    <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 p-2 rounded-2xl border border-black/5 dark:border-white/5">
                       <input 
                         type="color" 
                         value={custForm.accentColor}
                         onChange={e => setCustForm({...custForm, accentColor: e.target.value})}
                         className="w-10 h-10 rounded-xl bg-transparent cursor-pointer border-none"
                       />
                       <input 
                         type="text" 
                         value={custForm.accentColor}
                         onChange={e => setCustForm({...custForm, accentColor: e.target.value})}
                         className="bg-transparent text-sm font-mono outline-none flex-1 text-black dark:text-white"
                       />
                    </div>
                 </div>
              </div>
           </div>

           {/* Audio & Haptics */}
           <div className="bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5 p-8 rounded-[3rem] space-y-6">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                    <Volume2 size={24} />
                 </div>
                 <div>
                    <h4 className="font-black uppercase tracking-tight">Audio & Feedback</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Sounds & Vibrations</p>
                 </div>
              </div>

              <div className="space-y-4">
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Correct Answer Sound (URL)</label>
                    <div className="flex items-center gap-2">
                       <input 
                          value={custForm.correctSound}
                          onChange={e => setCustForm({...custForm, correctSound: e.target.value})}
                          className="flex-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-4 rounded-2xl font-bold outline-none text-xs text-black dark:text-white"
                       />
                       <button 
                         onClick={() => testSound(custForm.correctSound)}
                         className="p-4 bg-green-500/10 text-green-500 rounded-2xl hover:bg-green-500/20 transition-all"
                         title="Preview Correct Sound"
                       >
                         <Play size={16} />
                       </button>
                    </div>
                 </div>
                 <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Incorrect Answer Sound (URL)</label>
                    <div className="flex items-center gap-2">
                       <input 
                          value={custForm.incorrectSound}
                          onChange={e => setCustForm({...custForm, incorrectSound: e.target.value})}
                          className="flex-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-4 rounded-2xl font-bold outline-none text-xs text-black dark:text-white"
                       />
                       <button 
                         onClick={() => testSound(custForm.incorrectSound)}
                         className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500/20 transition-all"
                         title="Preview Incorrect Sound"
                       >
                         <Play size={16} />
                       </button>
                    </div>
                 </div>
                 <div className="flex items-center justify-between p-4 bg-black/5 dark:bg-white/5 rounded-[2rem] border border-black/5 dark:border-white/5">
                    <div className="flex items-center gap-4">
                       <span className="text-[10px] font-black uppercase tracking-[0.2em] text-black dark:text-white">Enable Vibration</span>
                    </div>
                    <button 
                      onClick={() => setCustForm({...custForm, vibrationEnabled: !custForm.vibrationEnabled})}
                      className={cn(
                        "w-12 h-6 rounded-full relative transition-all",
                        custForm.vibrationEnabled ? "bg-primary" : "bg-black/20 dark:bg-white/20"
                      )}
                    >
                       <div className={cn(
                         "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                         custForm.vibrationEnabled ? "right-1" : "left-1"
                       )} />
                    </button>
                 </div>

                 {/* Vibration Durations */}
                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-2">
                       <div className="flex justify-between items-center">
                          <label className="text-[8px] font-black uppercase tracking-widest opacity-40">Correct Vib (ms)</label>
                          <button onClick={() => testVibration(custForm.correctVibration)} className="p-1 hover:bg-green-500/10 text-green-500 rounded"><Zap size={10} /></button>
                       </div>
                       <input 
                         type="number" 
                         value={custForm.correctVibration}
                         onChange={e => setCustForm({...custForm, correctVibration: parseInt(e.target.value) || 0})}
                         className="w-full bg-transparent text-xs font-bold outline-none text-black dark:text-white"
                       />
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-2">
                       <div className="flex justify-between items-center">
                          <label className="text-[8px] font-black uppercase tracking-widest opacity-40">Incorrect Vib (ms)</label>
                          <button onClick={() => testVibration(custForm.incorrectVibration)} className="p-1 hover:bg-red-500/10 text-red-500 rounded"><Zap size={10} /></button>
                       </div>
                       <input 
                         type="number" 
                         value={custForm.incorrectVibration}
                         onChange={e => setCustForm({...custForm, incorrectVibration: parseInt(e.target.value) || 0})}
                         className="w-full bg-transparent text-xs font-bold outline-none text-black dark:text-white"
                       />
                    </div>
                 </div>
              </div>
           </div>

           {/* Animation Intensity */}
           <div className="col-span-full bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5 p-8 rounded-[3rem] space-y-6">
              <div className="flex items-center gap-4 mb-4">
                 <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <TrendingUp size={24} />
                 </div>
                 <div>
                    <h4 className="font-black uppercase tracking-tight">Animation Dynamics</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Motion Intensity</p>
                 </div>
              </div>
              
              <div className="space-y-6">
                 <div className="flex flex-col gap-4">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] opacity-40">
                       <span>Static</span>
                       <span>Bouncy</span>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={custForm.animationIntensity}
                      onChange={e => setCustForm({...custForm, animationIntensity: parseFloat(e.target.value)})}
                      className="w-full accent-primary h-1.5 bg-black/10 dark:bg-white/10 rounded-full appearance-none cursor-pointer"
                    />
                    <div className="text-center text-[8px] font-black text-primary uppercase">Value: {custForm.animationIntensity}</div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const [selectedChatUser, setSelectedChatUser] = useState<string | null>(null);

  const renderSpecialAccessSection = () => {
    const groupedMessages = specialMessages.reduce((acc, msg) => {
      if (!acc[msg.userId]) {
        acc[msg.userId] = {
          userName: msg.userName,
          messages: []
        };
      }
      acc[msg.userId].messages.push(msg);
      return acc;
    }, {} as Record<string, { userName: string, messages: SpecialMessage[] }>);

    const activeChat = selectedChatUser ? groupedMessages[selectedChatUser] : null;

    return (
      <div className="flex flex-col md:flex-row gap-6 h-[700px] pb-32">
        {/* Sidebar List */}
        <div className="w-full md:w-80 bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5 rounded-[2.5rem] overflow-hidden flex flex-col">
          <div className="p-6 border-b border-black/5 dark:border-white/5">
            <h2 className="text-xl font-black uppercase tracking-tighter text-black dark:text-white">Access Hub</h2>
            <p className="text-[8px] font-bold text-black/30 dark:text-white/30 uppercase tracking-widest mt-1">Pending Requests</p>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {Object.keys(groupedMessages).length === 0 && (
              <div className="p-10 text-center opacity-10">
                <Shield size={32} className="mx-auto mb-2" />
                <p className="text-[10px] font-black uppercase">No requests</p>
              </div>
            )}
            {Object.entries(groupedMessages).map(([uId, data]: [string, any]) => (
              <button 
                key={uId}
                onClick={() => setSelectedChatUser(uId)}
                className={cn(
                  "w-full p-4 flex items-center gap-3 transition-all border-l-4",
                  selectedChatUser === uId 
                    ? "bg-primary/10 border-primary" 
                    : "border-transparent hover:bg-black/5 dark:hover:bg-white/5"
                )}
              >
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black uppercase text-sm">
                  {data.userName?.[0] || 'U'}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <p className="font-bold text-xs text-black dark:text-white truncate uppercase">{data.userName}</p>
                  <p className="text-[8px] font-bold text-black/40 dark:text-white/40 truncate italic">
                    {data.messages?.[0]?.text || 'No messages'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-black text-primary uppercase">
                    {(data as any).messages?.length || 0}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Chat Window */}
        <div className="flex-1 bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5 rounded-[2.5rem] overflow-hidden flex flex-col relative shadow-2xl">
          {activeChat ? (
            <>
              {/* WhatsApp Style Header */}
              <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between bg-white/5 backdrop-blur-md">
                 <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-black font-black uppercase shadow-lg shadow-primary/20">
                       {activeChat.userName[0]}
                    </div>
                    <div>
                       <h3 className="font-black text-sm uppercase tracking-tight text-black dark:text-white">{activeChat.userName}</h3>
                       <p className="text-[8px] font-black text-primary uppercase animate-pulse">Requesting Access</p>
                    </div>
                 </div>
                 <button 
                    onClick={async () => {
                      const verified = await confirm({ title: "Delete Thread?", description: "Remove all messages for this user?", type: 'error' });
                      if (verified) {
                        await remove(ref(db, `specialMessages/${selectedChatUser}`));
                        setSelectedChatUser(null);
                      }
                    }}
                    className="p-3 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all"
                 >
                    <Trash2 size={20} />
                 </button>
              </div>

              {/* Message History */}
              <div className="flex-1 overflow-y-auto p-8 space-y-6 scrollbar-hide flex flex-col-reverse">
                {[...activeChat.messages].map((msg) => (
                  <div key={msg.id} className="space-y-4">
                    {/* Player Message */}
                    <div className="flex items-start gap-3">
                       <div className="bg-white/80 dark:bg-white/5 border border-black/5 dark:border-white/5 p-4 rounded-[2rem] rounded-tl-none max-w-[80%] relative group shadow-sm transition-all hover:bg-white dark:hover:bg-white/10">
                          <p className="text-xs font-bold leading-relaxed text-black/80 dark:text-white/80">{msg.text}</p>
                          <div className="flex items-center justify-between mt-2 gap-4">
                             <p className="text-[8px] font-black text-black/20 dark:text-white/20 uppercase">
                               {new Date(msg.timestamp).toLocaleTimeString()}
                             </p>
                             <button 
                                onClick={async () => {
                                  const newText = prompt("Edit message:", msg.text);
                                  if (newText) await update(ref(db, `specialMessages/${msg.userId}/${msg.id}`), { text: newText });
                                }}
                                className="opacity-0 group-hover:opacity-100 text-[8px] font-black text-primary uppercase transition-all"
                             >
                               Edit
                             </button>
                          </div>
                       </div>
                    </div>

                    {/* Admin Reply */}
                    {msg.adminReply && (
                      <div className="flex flex-col items-end gap-1">
                        <div className="bg-primary p-4 rounded-[2rem] rounded-tr-none max-w-[80%] shadow-lg shadow-primary/20 relative group overflow-hidden">
                           <p className="text-xs font-black text-black leading-relaxed">{msg.adminReply}</p>
                           <div className="flex items-center justify-between mt-2 gap-4">
                              <div className="flex items-center gap-1 text-[8px] font-black text-black/40">
                                 <Clock size={10} />
                                 {Math.max(0, Math.ceil(((msg.replyExpiresAt || 0) - Date.now()) / 1000))}s
                              </div>
                              <button 
                                 onClick={async () => {
                                   await update(ref(db, `specialMessages/${msg.userId}/${msg.id}`), { adminReply: null, replyExpiresAt: null });
                                 }}
                                 className="opacity-0 group-hover:opacity-100 text-[8px] font-black text-red-700 uppercase"
                              >
                                Delete
                              </button>
                           </div>
                        </div>
                      </div>
                    )}

                    {/* Reply Input Trigger */}
                    {!msg.adminReply && (
                      <div className="flex justify-center">
                        <button 
                          onClick={() => {
                            const r = prompt("Reply to request (expires in 1 min):");
                            if (r) update(ref(db, `specialMessages/${msg.userId}/${msg.id}`), { adminReply: r, replyExpiresAt: Date.now() + 60000 });
                          }}
                          className="text-[8px] font-black text-primary uppercase py-2 px-4 bg-primary/5 rounded-full border border-primary/20 hover:bg-primary hover:text-black transition-all"
                        >
                          Quick Reply
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-20 opacity-10">
              <MessageSquare size={80} className="mb-6" />
              <h3 className="text-2xl font-black uppercase tracking-tighter">Select a Request</h3>
              <p className="text-xs font-bold uppercase tracking-widest mt-2">Manage hidden player access messages</p>
            </div>
          )}
        </div>
      </div>
    );
  };


  const renderDatabaseExplorer = () => {
    const isObject = (val: any) => typeof val === 'object' && val !== null && !Array.isArray(val);
    const isArray = (val: any) => Array.isArray(val);
    
    return (
      <div className="space-y-6 pb-32">
        <div className="flex items-center justify-between px-2">
           <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Database Explorer</h2>
              <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Live Realtime Database Management</p>
           </div>
           <div className="flex items-center gap-2">
              <button 
                onClick={() => setDbExplorerPath([])}
                className="bg-primary/10 text-primary p-2 rounded-xl border border-primary/20 hover:bg-primary hover:text-black transition-all"
              >
                <RotateCcw size={16} />
              </button>
           </div>
        </div>

        {/* Path Breadcrumbs */}
        <div className="flex items-center gap-2 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5 overflow-x-auto scrollbar-hide">
           <button 
             onClick={() => setDbExplorerPath([])}
             className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline whitespace-nowrap"
           >
             ROOT
           </button>
           {dbExplorerPath.map((p, i) => (
             <React.Fragment key={i}>
                <ChevronRight size={12} className="text-black/20 dark:text-white/20 shrink-0" />
                <button 
                  onClick={() => setDbExplorerPath(dbExplorerPath.slice(0, i + 1))}
                  className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline whitespace-nowrap"
                >
                  {p}
                </button>
             </React.Fragment>
           ))}
        </div>

        {/* Data View */}
        <div className="bg-white dark:bg-[#0a0a0a] border border-black/5 dark:border-white/5 rounded-[2.5rem] overflow-hidden shadow-2xl">
           <div className="p-6 border-b border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
                    {dbExplorerPath.length === 0 ? <Database size={20} /> : <Folder size={20} />}
                 </div>
                 <div>
                    <h3 className="font-black text-sm uppercase tracking-tight text-black dark:text-white">
                       {dbExplorerPath.length === 0 ? 'Home' : dbExplorerPath[dbExplorerPath.length - 1]}
                    </h3>
                    <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">
                       {dbExplorerPath.length === 0 ? 'Global Tree' : `Path: /${dbExplorerPath.join('/')}`}
                    </p>
                 </div>
              </div>
              <button 
                onClick={async () => {
                  const key = prompt("Enter Key Name:");
                  if (!key) return;
                  const value = prompt("Enter Value (JSON supported):");
                  if (value === null) return;
                  let parsedValue: any = value;
                  try {
                    parsedValue = JSON.parse(value);
                  } catch (e) {}
                  
                  await set(ref(db, `${dbExplorerPath.join('/')}/${key}`), parsedValue);
                }}
                className="bg-primary text-black px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all"
              >
                <Plus size={14} /> Add Property
              </button>
           </div>

           <div className="divide-y divide-black/5 dark:divide-white/5">
              {dbExplorerData === null || dbExplorerData === undefined ? (
                 <div className="p-20 text-center opacity-10">
                    <Database size={64} className="mx-auto mb-4" />
                    <p className="font-black uppercase tracking-widest text-black dark:text-white">No data found at this path</p>
                 </div>
              ) : typeof dbExplorerData !== 'object' ? (
                 <div className="p-10 text-center">
                    <div className="bg-primary/5 p-6 rounded-3xl border border-primary/20 inline-block">
                       <p className="text-2xl font-black text-primary font-mono">{JSON.stringify(dbExplorerData)}</p>
                       <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mt-2">
                          Type: {typeof dbExplorerData}
                       </p>
                       <div className="flex gap-2 mt-6">
                          <button 
                             onClick={async () => {
                               const newValue = prompt("Edit Value:", JSON.stringify(dbExplorerData));
                               if (newValue === null) return;
                               let parsed: any = newValue;
                               try { parsed = JSON.parse(newValue); } catch (e) {}
                               await set(ref(db, dbExplorerPath.join('/')), parsed);
                             }}
                             className="flex-1 bg-primary text-black py-3 rounded-xl font-black text-[10px] uppercase tracking-widest"
                          >
                             Update
                          </button>
                          <button 
                             onClick={async () => {
                               if (await confirm({ title: "Delete Node?", description: "This will remove the current value.", type: 'error' })) {
                                  await remove(ref(db, dbExplorerPath.join('/')));
                                  setDbExplorerPath(prev => prev.slice(0, -1));
                               }
                             }}
                             className="px-6 bg-red-500/10 text-red-500 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest"
                          >
                             <Trash2 size={14} />
                          </button>
                       </div>
                    </div>
                 </div>
              ) : (
                 Object.entries(dbExplorerData).map(([key, value]: [string, any]) => (
                    <div key={key} className="group p-4 flex items-center hover:bg-primary/[0.02] transition-colors gap-4">
                       <div className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center text-black/30 dark:text-white/30 group-hover:bg-primary/20 group-hover:text-primary transition-all">
                          {isObject(value) || isArray(value) ? <Folder size={14} /> : <FileText size={14} />}
                       </div>
                       
                       <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                             <span className="font-black text-xs text-black dark:text-white uppercase tracking-tight truncate">{key}</span>
                             <span className="text-[8px] font-bold text-black/20 dark:text-white/20 uppercase tracking-[0.2em] font-mono shrink-0">
                                {typeof value} {isArray(value) ? '[]' : ''}
                             </span>
                          </div>
                          {!isObject(value) && !isArray(value) && (
                             <p className="text-[10px] font-bold text-black/50 dark:text-white/50 truncate font-mono">
                                {JSON.stringify(value)}
                             </p>
                          )}
                       </div>

                       <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                             onClick={async () => {
                               const newValue = prompt(`Update value for "${key}":`, JSON.stringify(value));
                               if (newValue === null) return;
                               let parsed: any = newValue;
                               try { parsed = JSON.parse(newValue); } catch (e) {}
                               await set(ref(db, `${dbExplorerPath.join('/')}/${key}`), parsed);
                             }}
                             className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                             title="Edit Value"
                          >
                             <Edit2 size={14} />
                          </button>
                          <button 
                             onClick={async () => {
                               if (await confirm({ title: `Delete "${key}"?`, description: "This cannot be undone.", type: 'error' })) {
                                  await remove(ref(db, `${dbExplorerPath.join('/')}/${key}`));
                               }
                             }}
                             className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                             title="Delete"
                          >
                             <Trash2 size={14} />
                          </button>
                          {(isObject(value) || isArray(value)) && (
                             <button 
                               onClick={() => setDbExplorerPath([...dbExplorerPath, key])}
                               className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors ml-2"
                               title="Open Folder"
                             >
                                <ChevronRight size={14} />
                             </button>
                          )}
                       </div>
                    </div>
                 ))
              )}
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
                     <h3 className="text-xl font-black uppercase tracking-tighter text-black dark:text-white">Real Players ({realPlayers.length})</h3>
                     <button 
                       onClick={() => setIsAddingUser(true)}
                       className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 transition-all shadow-lg shadow-primary/20"
                     >
                       <Plus size={14} />
                       Add Player
                     </button>
                  </div>

                  {isAddingUser && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 p-6 rounded-[2rem] space-y-4"
                    >
                       <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-black uppercase tracking-widest text-primary">New Player Form</h4>
                          <button onClick={() => setIsAddingUser(false)} className="text-black/30 dark:text-white/30 hover:text-red-500">
                             <CloseIcon size={16} />
                          </button>
                       </div>
                       <div className="space-y-3">
                          <input 
                            value={newPlayerName}
                            onChange={e => setNewPlayerName(e.target.value)}
                            placeholder="Display Name"
                            className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm"
                          />
                          <div className="relative">
                             <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-black">@</span>
                             <input 
                               value={newPlayerUsername}
                               onChange={e => setNewPlayerUsername(e.target.value)}
                               placeholder="Username"
                               className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 pl-10 rounded-2xl font-bold outline-none focus:border-primary text-sm"
                             />
                          </div>
                          <input 
                            type="password"
                            value={newPlayerPassword}
                            onChange={e => setNewPlayerPassword(e.target.value)}
                            placeholder="Password"
                            className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm"
                          />
                       </div>
                       <button 
                         disabled={isCreatingUser}
                         onClick={createPlayerAccount}
                         className="w-full bg-primary text-black font-black uppercase tracking-widest py-4 rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all text-xs"
                       >
                         {isCreatingUser ? 'Creating Account...' : 'Create Account'}
                       </button>
                    </motion.div>
                  )}
                  <div className="space-y-4">
                    {realPlayers.length === 0 ? (
                      <p className="text-white/20 italic p-4 text-center">No real players found</p>
                    ) : (
                      realPlayers.map(u => (
                        <motion.div 
                          key={u.id} 
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setSelectedUser(u)}
                          className="w-full bg-white dark:bg-[#111] p-4 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between hover:border-primary/20 transition-all group cursor-pointer shadow-sm"
                        >
                          <div className="text-left flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-bold flex items-center gap-2 text-black dark:text-white text-sm truncate">
                                {u.name}
                                {u.status === 'pending' && <span className="text-[8px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest">PENDING</span>}
                                {u.extraTriesRequested && <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest">RESET REQ</span>}
                              </p>
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-primary/60 dark:text-primary uppercase tracking-widest bg-primary/5 dark:bg-primary/10 px-2 py-0.5 rounded-full border border-primary/10">
                                  KEY: {u.password || 'N/A'}
                                </span>
                                {u.isBot && (
                                  <button 
                                     onClick={async (e) => {
                                        e.stopPropagation();
                                        const verified = await confirm({
                                           title: "Impersonate Bot",
                                           description: `Do you want to login as bot "${u.name}"?`,
                                           type: 'confirm'
                                        });
                                        if (verified) {
                                           impersonateBot(u);
                                           await alert({ title: 'Success', description: `Now playing as ${u.name}`, type: 'success' });
                                        }
                                     }}
                                     className="p-1 px-2 bg-primary text-black rounded-full hover:scale-110 transition-all"
                                     title="Play as Bot"
                                  >
                                     <Play size={10} fill="currentColor" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
                               <span className="text-primary truncate max-w-[120px]">@{u.username || 'no_username'}</span>
                               <span className="opacity-20">•</span>
                               <span>RANK #{getUserRank(u.id)}</span>
                               <span className="opacity-20">•</span>
                               <span className="text-primary">{u.xp} XP</span>
                            </p>
                          </div>
                          <ChevronRight size={20} className="text-black/10 dark:text-white/10 group-hover:text-primary transition-all group-hover:translate-x-1 ml-4" />
                        </motion.div>
                      ))
                    )}
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                     <h3 className="text-xl font-black uppercase tracking-tighter">Bot Players ({botsList.length})</h3>
                  </div>
                  <div className="grid grid-cols-1 gap-3 max-h-[600px] overflow-y-auto scrollbar-hide pr-1">
                    {botsList.length === 0 ? (
                       <p className="text-center p-8 text-white/10 italic">Zero bots active</p>
                    ) : (
                       botsList.map(b => (
                          <motion.div 
                            key={b.id} 
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            className="bg-white/5 dark:bg-black/40 p-4 rounded-2xl border border-white/5 flex items-center justify-between group shadow-xl"
                          >
                             <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-primary border border-white/5">
                                   <Bot size={20} />
                                </div>
                                <div className="text-left flex-1 truncate">
                                   <div className="flex items-center gap-2">
                                      <p className="font-black text-sm tracking-tight truncate text-white uppercase">{b.name}</p>
                                      <span className="text-[8px] font-black text-primary uppercase tracking-widest bg-primary/10 px-1.5 py-0.5 rounded">@{b.username}</span>
                                   </div>
                                   <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1 flex items-center gap-2">
                                      <span>{b.xp} XP</span>
                                      <span className="opacity-20">•</span>
                                      <span>RANK #{getUserRank(b.id)}</span>
                                      <span className="opacity-20">•</span>
                                      <span className="text-primary font-black">KEY: {b.password || 'BOT'}</span>
                                   </p>
                                </div>
                             </div>
                             <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all ml-3">
                                <motion.button 
                                   whileHover={{ scale: 1.1 }}
                                   whileTap={{ scale: 0.9 }}
                                   onClick={async () => {
                                      const verified = await confirm({
                                         title: "Impersonate Bot",
                                         description: `Do you want to login as bot "${b.name}"?`,
                                         type: 'confirm'
                                      });
                                      if (verified) {
                                         impersonateBot(b);
                                         await alert({ title: 'Success', description: `Now playing as ${b.name}`, type: 'success' });
                                      }
                                   }}
                                   className="w-10 h-10 bg-primary text-black rounded-xl flex items-center justify-center shadow-lg shadow-primary/20"
                                   title="Play as Bot"
                                >
                                   <Play size={16} fill="currentColor" />
                                </motion.button>
                                <button 
                                   onClick={() => deleteUser(b.id)}
                                   className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-white/40 hover:text-red-500 hover:bg-red-500/10 transition-all border border-white/5"
                                   title="Delete Bot"
                                >
                                   <Trash2 size={16} />
                                </button>
                             </div>
                          </motion.div>
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
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Sequence Order</label>
                      <input 
                        type="number"
                        value={newTopic.order} 
                        onChange={e => setNewTopic({...newTopic, order: parseInt(e.target.value) || 0})}
                        className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl outline-none text-black dark:text-white font-bold focus:border-primary"
                        placeholder="0"
                      />
                    </div>
                    <button onClick={addTopic} className="bg-primary text-black font-black uppercase tracking-widest py-4 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all md:col-span-2">
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
                        <div className="space-y-1">
                           <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Sequence Order</label>
                           <input 
                             type="number"
                             value={newNode.order}
                             onChange={e => setNewNode({...newNode, order: parseInt(e.target.value) || 0})}
                             className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl outline-none text-black dark:text-white text-xs"
                             placeholder="0"
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
                           Object.values(currentNode.children)
                             .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                             .map((child: Topic, cIdx) => (
                              <div key={`${child.id}-${cIdx}`} className="flex items-center justify-between p-3 bg-black/20 dark:bg-white/5 rounded-xl border border-white/5 group/node">
                                 <div className="flex-1 cursor-pointer" onClick={() => setTopicPath([...topicPath, child.id])}>
                                    <div className="flex items-center gap-2">
                                       <p className="font-bold text-xs text-black dark:text-white group-hover/node:text-primary transition-colors">{child.name}</p>
                                       {child.children && <span className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{Object.keys(child.children).length}</span>}
                                    </div>
                                    <p className="text-[8px] font-mono text-black/30 dark:text-white/30 mb-0.5">{child.id}</p>
                                 </div>
                                 <div className="flex items-center opacity-40 group-hover/node:opacity-100 transition-opacity gap-0.5">
                                    <button onClick={() => moveNode(child.id, 'up')} className="text-black/40 dark:text-white/40 hover:text-primary p-1 bg-black/5 dark:bg-white/5 rounded"><ChevronUp size={12} /></button>
                                    <button onClick={() => moveNode(child.id, 'down')} className="text-black/40 dark:text-white/40 hover:text-primary p-1 bg-black/5 dark:bg-white/5 rounded"><ChevronDown size={12} /></button>
                                    <button onClick={() => {
                                      setNewNode({ id: child.id, name: child.name, description: child.description || '', order: child.order || 0 });
                                      setNodeEditMode(child.id);
                                    }} className="text-primary p-2 ml-1"><Edit2 size={12} /></button>
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topics.map((t, tIdx) => (
                <motion.div 
                  key={`${t.id}-${tIdx}`} 
                  whileHover={{ scale: 1.02 }}
                  className="bg-white dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/10 flex justify-between items-center group shadow-sm hover:border-primary/20 transition-all font-sans"
                >
                  <div className="flex-1 truncate pr-4 text-left">
                    <span className="font-black text-black dark:text-white uppercase tracking-tighter text-base truncate block">{t.name}</span>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {t.children && <span className="text-[10px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/10">{Object.keys(t.children).length} Sub-topics</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex flex-col gap-1 mr-1">
                       <button onClick={() => moveTopic(t.id, 'up')} className="text-black/20 dark:text-white/20 hover:text-primary transition-all p-1 bg-black/5 dark:bg-white/5 rounded-lg"><ChevronUp size={14} /></button>
                       <button onClick={() => moveTopic(t.id, 'down')} className="text-black/20 dark:text-white/20 hover:text-primary transition-all p-1 bg-black/5 dark:bg-white/5 rounded-lg"><ChevronDown size={14} /></button>
                    </div>
                    <motion.button 
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { setEditingTopicId(t.id); setTopicPath([]); }} 
                      className="bg-primary text-black px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20"
                    >
                      Manage
                    </motion.button>
                    <button onClick={async () => { 
                      const verified = await confirm({
                        title: "Delete Topic",
                        description: 'Delete entire topic and its configuration?',
                        type: 'error'
                      });
                      if(verified) remove(ref(db, `topics/${t.id}`)); 
                    }} className="text-black/10 dark:text-white/10 group-hover:text-red-500 transition-all p-2"><Trash2 size={20} /></button>
                  </div>
                </motion.div>
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
          // Use end time if provided, otherwise fallback to duration calculation
          let endTime = newEvent.endTime ? new Date(newEvent.endTime).getTime() : (startTime + (parseInt(newEvent.durationHours) * 60 * 60 * 1000));
          
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
            title: '', description: '', topicId: '', startTime: '', endTime: '', durationHours: '1', type: 'test',
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Start Date & Time</label>
                            <input 
                              type="datetime-local"
                              value={newEvent.startTime}
                              onChange={e => setNewEvent({...newEvent, startTime: e.target.value})}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                            />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">End Date & Time</label>
                            <input 
                              type="datetime-local"
                              value={newEvent.endTime}
                              onChange={e => setNewEvent({...newEvent, endTime: e.target.value})}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                            />
                         </div>
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
                          hintEn: '', hintHi: '',
                          questionImage: '',
                          opt1Image: '', opt2Image: '', opt3Image: '', opt4Image: ''
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
                  <input type="text" placeholder="Question Image URL" value={newQuiz.questionImage} onChange={e => setNewQuiz({...newQuiz, questionImage: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                  
                  <div className="space-y-4 pt-4 border-t border-black/5 dark:border-white/5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <input type="text" placeholder="Opt 1 (EN)" value={newQuiz.opt1En} onChange={e => setNewQuiz({...newQuiz, opt1En: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                        <input type="text" placeholder="Opt 1 (HI)" value={newQuiz.opt1Hi} onChange={e => setNewQuiz({...newQuiz, opt1Hi: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                        <input type="text" placeholder="Opt 1 Image URL" value={newQuiz.opt1Image} onChange={e => setNewQuiz({...newQuiz, opt1Image: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-2 rounded-lg outline-none text-[10px] text-black dark:text-white" />
                      </div>
                      <div className="space-y-2">
                        <input type="text" placeholder="Opt 2 (EN)" value={newQuiz.opt2En} onChange={e => setNewQuiz({...newQuiz, opt2En: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                        <input type="text" placeholder="Opt 2 (HI)" value={newQuiz.opt2Hi} onChange={e => setNewQuiz({...newQuiz, opt2Hi: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                        <input type="text" placeholder="Opt 2 Image URL" value={newQuiz.opt2Image} onChange={e => setNewQuiz({...newQuiz, opt2Image: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-2 rounded-lg outline-none text-[10px] text-black dark:text-white" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <input type="text" placeholder="Opt 3 (EN)" value={newQuiz.opt3En} onChange={e => setNewQuiz({...newQuiz, opt3En: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                        <input type="text" placeholder="Opt 3 (HI)" value={newQuiz.opt3Hi} onChange={e => setNewQuiz({...newQuiz, opt3Hi: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                        <input type="text" placeholder="Opt 3 Image URL" value={newQuiz.opt3Image} onChange={e => setNewQuiz({...newQuiz, opt3Image: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-2 rounded-lg outline-none text-[10px] text-black dark:text-white" />
                      </div>
                      <div className="space-y-2">
                        <input type="text" placeholder="Opt 4 (EN)" value={newQuiz.opt4En} onChange={e => setNewQuiz({...newQuiz, opt4En: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                        <input type="text" placeholder="Opt 4 (HI)" value={newQuiz.opt4Hi} onChange={e => setNewQuiz({...newQuiz, opt4Hi: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                        <input type="text" placeholder="Opt 4 Image URL" value={newQuiz.opt4Image} onChange={e => setNewQuiz({...newQuiz, opt4Image: e.target.value})} className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-2 rounded-lg outline-none text-[10px] text-black dark:text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Explanation (EN)" value={newQuiz.explanationEn} onChange={e => setNewQuiz({...newQuiz, explanationEn: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                    <input type="text" placeholder="Explanation (HI)" value={newQuiz.explanationHi} onChange={e => setNewQuiz({...newQuiz, explanationHi: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Hint (EN)" value={newQuiz.hintEn} onChange={e => setNewQuiz({...newQuiz, hintEn: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
                    <input type="text" placeholder="Hint (HI)" value={newQuiz.hintHi} onChange={e => setNewQuiz({...newQuiz, hintHi: e.target.value})} className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl outline-none text-xs text-black dark:text-white" />
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
                  placeholder="Format: ID, Q_EN, Q_HI, O1_EN, O1_HI, O2_EN, O2_HI, O3_EN, O3_HI, O4_EN, O4_HI, Correct, Topic, Exp_EN, Exp_HI"
                  className="w-full bg-white dark:bg-black border border-black/5 dark:border-white/5 p-4 rounded-2xl h-48 outline-none focus:border-[#32befa] transition-all text-[10px] font-mono leading-relaxed text-black dark:text-white opacity-60 focus:opacity-100"
                />
                <button onClick={addBulkQuizzes} className="w-full mt-4 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white font-black p-4 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all">BATCH PROCESS</button>
              </div>
            </div>

            {/* List Section */}
            <div className="space-y-4">
               <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                 <h3 className="font-black text-sm uppercase tracking-widest text-black/40 dark:text-white/40">Registered Quizzes ({quizzes.length})</h3>
                 <div className="flex items-center gap-2 flex-wrap">
                    <button 
                      onClick={() => {
                        if (selectedQuizKeys.length === quizzes.length) {
                          setSelectedQuizKeys([]);
                        } else {
                          const allKeys = quizzes.map(q => `${q.topicId}_${q.id}`);
                          setSelectedQuizKeys(allKeys);
                        }
                      }}
                      className="text-[8px] font-black bg-[#32befa]/20 text-[#32befa] px-3 py-1.5 rounded-lg border border-[#32befa]/20 hover:bg-[#32befa]/30 transition-all uppercase"
                    >
                      {selectedQuizKeys.length === quizzes.length ? 'Deselect All' : 'Select All'}
                    </button>

                    {/* Bulk Selection/Deselection of Entire Topics including Sub-topics */}
                    <select
                      onChange={(e) => {
                        const targetTopicId = e.target.value;
                        if (!targetTopicId) return;
                        const matchingKeys = quizzes
                          .filter(q => q.topicId === targetTopicId)
                          .map(q => `${q.topicId}_${q.id}`);
                        
                        setSelectedQuizKeys(prev => {
                          const union = new Set([...prev, ...matchingKeys]);
                          return Array.from(union);
                        });
                        e.target.value = '';
                      }}
                      className="text-[8px] font-black bg-[#32befa]/10 hover:bg-[#32befa]/20 text-[#32befa] px-2 py-1.5 rounded-lg border border-[#32befa]/20 transition-all uppercase cursor-pointer outline-none max-w-[150px] truncate"
                    >
                      <option value="" className="text-black bg-white dark:bg-zinc-900 dark:text-zinc-300 font-bold">Select Entire Topic...</option>
                      {allFlattenedTopics.map(t => (
                        <option key={`sel-${t.id}`} value={t.id} className="text-black bg-white dark:bg-zinc-900 dark:text-zinc-300">
                          {t.label}
                        </option>
                      ))}
                    </select>

                    <select
                      onChange={(e) => {
                        const targetTopicId = e.target.value;
                        if (!targetTopicId) return;
                        const matchingKeys = quizzes
                          .filter(q => q.topicId === targetTopicId)
                          .map(q => `${q.topicId}_${q.id}`);
                        
                        setSelectedQuizKeys(prev => prev.filter(key => !matchingKeys.includes(key)));
                        e.target.value = '';
                      }}
                      className="text-[8px] font-black bg-red-500/10 hover:bg-red-550/20 text-red-500 px-2 py-1.5 rounded-lg border border-red-500/20 transition-all uppercase cursor-pointer outline-none max-w-[150px] truncate"
                    >
                      <option value="" className="text-black bg-white dark:bg-zinc-900 dark:text-zinc-300 font-bold">Deselect Entire Topic...</option>
                      {allFlattenedTopics.map(t => (
                        <option key={`desel-${t.id}`} value={t.id} className="text-black bg-white dark:bg-zinc-900 dark:text-zinc-300">
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <button onClick={reindexQuizzes} className="text-[8px] font-black bg-yellow-500/10 text-yellow-500 px-3 py-1.5 rounded-lg border border-yellow-500/20 hover:bg-yellow-500/20 transition-all uppercase">Re-index IDs</button>
                    <span className="text-[10px] font-bold text-[#32befa]">LATEST UPLOADS</span>
                 </div>
               </div>

               {/* Bulk actions bar if items are selected */}
               {selectedQuizKeys.length > 0 && (
                 <div className="sticky top-0 z-50 bg-black/95 dark:bg-zinc-950 text-white p-4 rounded-3xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-2xl border border-white/10 backdrop-blur-lg animate-in slide-in-from-top duration-200">
                   <div className="flex items-center gap-3">
                     <span className="bg-[#32befa] text-black w-6 h-6 rounded-full flex items-center justify-center text-xs font-black animate-scale">{selectedQuizKeys.length}</span>
                     <div>
                       <span className="text-xs font-black uppercase tracking-widest block text-[#32befa]">Quizzes Selected</span>
                       <span className="text-[10px] text-zinc-400">Topic Transfer & Bulk Delete Options</span>
                     </div>
                   </div>

                   {/* Actions Controls container */}
                   <div className="flex flex-wrap items-center gap-3">
                     {/* Move Topic section */}
                     <div className="flex items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
                       <select 
                         value={bulkTargetTopicId} 
                         onChange={(e) => setBulkTargetTopicId(e.target.value)}
                         className="bg-transparent text-white border-0 text-[10px] font-bold outline-none py-1.5 px-3 min-w-[140px] focus:ring-0 cursor-pointer"
                       >
                         <option value="" className="text-black bg-white">Move to Topic/Node...</option>
                         {allFlattenedTopics.map(t => (
                           <option key={t.id} value={t.id} className="text-black bg-white">
                             {t.label}
                           </option>
                         ))}
                       </select>
                       <button 
                         onClick={async () => {
                           if (!bulkTargetTopicId) {
                             await alert({
                               title: "Notice",
                               description: "Please select a target topic / node from the dropdown.",
                               type: "error"
                             });
                             return;
                           }
                           const targetTopic = allFlattenedTopics.find(t => t.id === bulkTargetTopicId);
                           const targetLabel = targetTopic ? targetTopic.name : bulkTargetTopicId;
                           
                           const verified = await confirm({
                             title: "Bulk Relocate Quizzes",
                             description: `Relocate the ${selectedQuizKeys.length} selected quizzes to topic/node "${targetLabel}"?`,
                             type: 'error'
                           });
                           
                           if (verified) {
                             const promises = selectedQuizKeys.map(async (key) => {
                               const [oldTopicId, id] = key.split('_');
                               const q = quizzes.find(item => `${item.topicId}_${item.id}` === key);
                               if (q) {
                                 const updatedQuiz = { ...q, topicId: bulkTargetTopicId };
                                 // 1. Set at the new topic location
                                 await set(ref(db, `topicQuizzes/${bulkTargetTopicId}/${id}`), updatedQuiz);
                                 // 2. Remove from the old topic location
                                 await remove(ref(db, `topicQuizzes/${oldTopicId}/${id}`));
                               }
                             });
                             await Promise.all(promises);
                             setSelectedQuizKeys([]);
                             setBulkTargetTopicId('');
                             await alert({
                               title: "Success",
                               description: `Successfully relocated ${promises.length} quizzes to "${targetLabel}".`,
                               type: 'success'
                             });
                           }
                         }}
                         disabled={!bulkTargetTopicId}
                         className={cn(
                           "text-[10px] font-black uppercase py-1.5 px-4 rounded-xl flex items-center gap-1.5 transition-all text-black",
                           bulkTargetTopicId 
                             ? "bg-[#32befa] hover:bg-[#28afd9] active:scale-95 cursor-pointer" 
                             : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5"
                         )}
                       >
                          <Folder size={12} /> Move
                       </button>
                     </div>

                     {/* Action Separator in desktop */}
                     <div className="hidden lg:block w-px h-6 bg-white/10" />

                     {/* Delete option */}
                     <button 
                       onClick={async () => {
                         const verified = await confirm({
                           title: "Bulk Delete Quizzes",
                           description: `Are you sure you want to delete the ${selectedQuizKeys.length} selected quizzes? This action cannot be undone.`,
                           type: 'error'
                         });
                         if (verified) {
                           const promises = selectedQuizKeys.map(async (key) => {
                             const [topicId, id] = key.split('_');
                             await remove(ref(db, `topicQuizzes/${topicId}/${id}`));
                           });
                           await Promise.all(promises);
                           setSelectedQuizKeys([]);
                           await alert({
                             title: "Success",
                             description: `Successfully deleted ${promises.length} quizzes.`,
                             type: 'success'
                           });
                         }
                       }}
                       className="bg-red-500/10 hover:bg-red-500 text-red-450 hover:text-white border border-red-500/20 text-[10px] font-black uppercase py-2 px-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-1.5"
                     >
                        <Trash2 size={12} /> Delete Selected
                     </button>

                     {/* Clear button */}
                     <button 
                       onClick={() => {
                         setSelectedQuizKeys([]);
                         setBulkTargetTopicId('');
                       }}
                       className="text-[10px] text-zinc-400 hover:text-white font-black uppercase py-2 px-3 border border-transparent hover:border-white/10 rounded-xl transition-all"
                     >
                       Cancel
                     </button>
                   </div>
                 </div>
               )}

               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {quizzes.slice().reverse().map(q => {
                   const compoundKey = `${q.topicId}_${q.id}`;
                   const isChecked = selectedQuizKeys.includes(compoundKey);
                   return (
                     <div key={compoundKey} className={cn(
                       "border p-5 rounded-[2rem] group relative overflow-hidden transition-all duration-200",
                       isChecked 
                         ? "bg-red-500/5 border-red-500/30" 
                         : "bg-black/5 dark:bg-black/60 border-black/5 dark:border-white/5"
                     )}>
                        <div className={cn(
                          "absolute top-0 left-0 w-1 h-full bg-[#32befa] opacity-0 group-hover:opacity-100 transition-all",
                          isChecked && "bg-red-500 opacity-100"
                        )} />
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                             <input 
                               type="checkbox" 
                               checked={isChecked}
                               onChange={(e) => {
                                 if (e.target.checked) {
                                   setSelectedQuizKeys(prev => [...prev, compoundKey]);
                                 } else {
                                   setSelectedQuizKeys(prev => prev.filter(k => k !== compoundKey));
                                 }
                               }}
                               className="w-4 h-4 rounded text-[#32befa] border-black/20 dark:border-white/20 bg-transparent cursor-pointer focus:ring-0 active:scale-90 transition-transform"
                             />
                             {!isNaN(parseInt(q.id)) && (
                                <span className="w-5 h-5 flex items-center justify-center bg-[#32befa] text-black text-[10px] font-black rounded-lg">
                                   {q.id}
                                </span>
                             )}
                             <span className="text-[8px] bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 px-2 py-0.5 rounded font-black uppercase tracking-widest">{q.topicId}</span>
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
                                 // Remove from selection if it was selected
                                 setSelectedQuizKeys(prev => prev.filter(k => k !== compoundKey));
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
                   );
                 })}
               </div>
               {quizzes.length === 0 && <p className="text-center text-black/20 dark:text-white/20 italic p-12">No quizzes created yet</p>}
            </div>
          </div>
        );
      case 'bots':
        const botPlayers = users.filter(u => u.isBot);
        return (
          <div className="space-y-6 pb-32">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Manual Add Bot Section */}
                <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
                  <h3 className="text-lg font-black mb-6 flex items-center gap-2 uppercase tracking-tighter text-black dark:text-white">
                    <Plus size={20} className="text-[#32befa]" />
                    Manual Bot Entry
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                      <input 
                        type="text" 
                        placeholder="Bot Display Name" 
                        value={newBotName} 
                        onChange={e => setNewBotName(e.target.value)} 
                        className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-4 rounded-xl outline-none focus:border-[#32befa] transition-all text-sm text-black dark:text-white font-bold" 
                      />
                      <input 
                        type="text" 
                        placeholder="Bot Username" 
                        value={newBotUsername} 
                        onChange={e => setNewBotUsername(e.target.value)} 
                        className="bg-white dark:bg-black border border-black/5 dark:border-white/5 p-4 rounded-xl outline-none focus:border-[#32befa] transition-all text-sm text-black dark:text-white font-mono" 
                      />
                      <div className="space-y-1 px-1">
                        <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40">Starting XP: {newBotXP}</label>
                        <input 
                          type="range" min="0" max="50000" step="100"
                          value={newBotXP}
                          onChange={e => setNewBotXP(parseInt(e.target.value))}
                          className="w-full accent-[#32befa]"
                        />
                      </div>
                    </div>
                    <button 
                      onClick={createBot} 
                      disabled={isCreatingBot}
                      className={cn(
                        "w-full font-black p-4 rounded-xl shadow-[0_10px_20px_rgba(50,190,250,0.2)] active:scale-95 transition-all text-black bg-[#32befa]",
                        isCreatingBot && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isCreatingBot ? 'GENERATING...' : 'ADD SIMULATOR'}
                    </button>
                  </div>
                </div>

                {/* Bulk & Export Section */}
                <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
                   <div className="flex justify-between items-center mb-6">
                     <h3 className="text-lg font-black flex items-center gap-2 uppercase tracking-tighter text-black dark:text-white">
                       <Bot size={20} className="text-[#32befa]" />
                       Bot Engine
                     </h3>
                     <div className="flex items-center gap-2">
                        <button 
                          onClick={exportSampleBotsCsv}
                          className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 px-3 py-1.5 rounded-xl text-[10px] font-black hover:bg-yellow-500 hover:text-black transition-all uppercase"
                        >
                          Sample
                        </button>
                        <button 
                          onClick={exportBotsCsv}
                          className="bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1.5 rounded-xl text-[10px] font-black hover:bg-green-500 hover:text-black transition-all uppercase"
                        >
                          Export
                        </button>
                     </div>
                   </div>
                   
                   <div className="space-y-4">
                      <div className="p-6 border-2 border-dashed border-black/10 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center text-center space-y-3 group hover:border-[#32befa]/50 transition-all">
                        <div className="w-12 h-12 bg-black/5 dark:bg-white/5 rounded-2xl flex items-center justify-center text-black/20 dark:text-white/20 group-hover:text-[#32befa] transition-all">
                          <Upload size={24} />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-black dark:text-white">Bulk Data Upload</p>
                          <p className="text-[10px] text-black/40 dark:text-white/40 font-bold">CSV Required Fields: name, xp</p>
                        </div>
                        <label className="bg-[#32befa] text-black px-6 py-2 rounded-xl font-black text-[10px] cursor-pointer hover:scale-105 active:scale-95 transition-all">
                           CHOOSE FILE
                           <input type="file" accept=".csv" className="hidden" onChange={e => handleCsvUpload(e, 'bots')} />
                        </label>
                      </div>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
               <div className="flex items-center justify-between px-2">
                 <h3 className="text-sm font-black text-black/20 dark:text-white/20 uppercase tracking-widest">Active Simulators ({botPlayers.length})</h3>
                 <span className="text-[10px] font-black text-[#32befa] bg-[#32befa]/10 px-3 py-1 rounded-full uppercase tracking-tighter">Instance List</span>
               </div>
               
               {botPlayers.length === 0 ? (
                  <div className="bg-black/5 dark:bg-white/5 p-12 rounded-[2rem] border border-black/5 dark:border-white/5 text-center">
                    <p className="text-black/20 dark:text-white/20 italic font-medium">Zero bots active in the system</p>
                  </div>
               ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {botPlayers.map(b => (
                       <div key={b.id} className="bg-black/5 dark:bg-[#111] p-5 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between text-black dark:text-white hover:border-[#32befa]/30 transition-all group">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-[#32befa]/10 rounded-xl flex items-center justify-center text-[#32befa] group-hover:bg-[#32befa] group-hover:text-black transition-all">
                                <Bot size={20} />
                             </div>
                             <div>
                                <p className="font-black text-sm tracking-tight leading-none mb-1">{b.name}</p>
                                <p className="text-[9px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">{b.xp} XP • LVL {b.rank}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-1">
                             <button 
                                onClick={async () => {
                                   const verified = await confirm({
                                      title: "Delete Bot",
                                      description: `Permanently delete ${b.name}?`,
                                      type: 'error'
                                   });
                                   if(verified) deleteUser(b.id);
                                }} 
                                className="p-2 text-black/10 dark:text-white/10 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                             >
                                <Trash2 size={16} />
                             </button>
                          </div>
                       </div>
                    ))}
                  </div>
               )}
             </div>
          </div>
        );
      case 'config':
        return (
          <div className="space-y-8">
            <h3 className="text-xl font-black uppercase tracking-tighter text-black dark:text-white">Global Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Star size={24} />
                  </div>
                  <div>
                    <h4 className="font-black uppercase tracking-tight">Lives System</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Global Toggle</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                   <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                     When enabled, the 16-lives system is active for all accounts unless overridden individually. Lives refill every 16 minutes.
                   </p>
                   <button 
                     onClick={async () => {
                       const newState = !settings?.livesEnabledForAll;
                       await update(ref(db, 'settings'), { livesEnabledForAll: newState });
                     }}
                     className={cn(
                       "w-full py-6 rounded-3xl font-black uppercase tracking-widest text-xs transition-all border shadow-lg",
                       settings?.livesEnabledForAll 
                         ? "bg-green-500 text-white border-green-400 shadow-green-500/20" 
                         : "bg-red-500 text-white border-red-400 shadow-red-500/20"
                     )}
                   >
                     {settings?.livesEnabledForAll ? 'SYSTEM LIVES ENABLED' : 'SYSTEM LIVES DISABLED'}
                   </button>
                </div>
              </div>

              <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Clock size={24} />
                  </div>
                  <div>
                    <h4 className="font-black uppercase tracking-tight">Quiz Timer</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Global Question Timer</p>
                  </div>
                </div>
                
                <div className="space-y-6">
                   <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                     Control whether a countdown timer is active during standard quiz play and set the duration per question.
                   </p>
                   
                   <div className="flex flex-col gap-4">
                      <button 
                        onClick={async () => {
                          const newState = !settings?.quizTimerEnabled;
                          await update(ref(db, 'settings'), { quizTimerEnabled: newState });
                        }}
                        className={cn(
                          "w-full py-6 rounded-3xl font-black uppercase tracking-widest text-xs transition-all border shadow-lg",
                          settings?.quizTimerEnabled 
                            ? "bg-green-500 text-white border-green-400 shadow-green-500/20" 
                            : "bg-red-500 text-white border-red-400 shadow-red-500/20"
                        )}
                      >
                        {settings?.quizTimerEnabled ? 'GLOBAL TIMER ON' : 'GLOBAL TIMER OFF'}
                      </button>

                      <div className="bg-white/5 dark:bg-black/20 p-6 rounded-3xl border border-black/5 dark:border-white/5">
                        <div className="flex items-center justify-between mb-4">
                           <span className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Timer Duration</span>
                           <span className="text-xl font-black text-primary">{settings?.quizTimerSeconds || 30}s</span>
                        </div>
                        <div className="flex gap-2">
                           <button 
                             onClick={async () => {
                               const current = settings?.quizTimerSeconds || 30;
                               if (current <= 5) return;
                               await update(ref(db, 'settings'), { quizTimerSeconds: current - 5 });
                             }}
                             className="flex-1 py-4 bg-black/5 dark:bg-white/10 rounded-2xl flex items-center justify-center text-black dark:text-white hover:bg-primary hover:text-black transition-all"
                           >
                              <ChevronDown size={20} />
                           </button>
                           <button 
                             onClick={async () => {
                               await update(ref(db, 'settings'), { quizTimerSeconds: 30 });
                             }}
                             className="px-6 py-4 bg-black/5 dark:bg-white/10 rounded-2xl flex items-center justify-center text-black/40 dark:text-white/40 hover:text-primary transition-all"
                           >
                              <RotateCcw size={16} />
                           </button>
                           <button 
                             onClick={async () => {
                               const current = settings?.quizTimerSeconds || 30;
                               if (current >= 120) return;
                               await update(ref(db, 'settings'), { quizTimerSeconds: current + 5 });
                             }}
                             className="flex-1 py-4 bg-black/5 dark:bg-white/10 rounded-2xl flex items-center justify-center text-black dark:text-white hover:bg-primary hover:text-black transition-all"
                           >
                              <ChevronUp size={20} />
                           </button>
                        </div>
                      </div>
                   </div>
                </div>
              </div>

              {/* Hidden Access PIN */}
              <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Shield size={24} />
                  </div>
                  <div>
                    <h4 className="font-black uppercase tracking-tight">Hidden Access PIN</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Secret Access Code</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                   <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                     This PIN is required to access the hidden "Special Quiz Access" feature.
                   </p>
                   <div className="relative">
                     <input 
                       type="text"
                       value={settings?.specialPin || ''}
                       onChange={async (e) => {
                         await update(ref(db, 'settings'), { specialPin: e.target.value });
                       }}
                       placeholder="Set Secret PIN"
                       className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm transition-all"
                     />
                     <Shield className="absolute right-4 top-1/2 -translate-y-1/2 text-black/10 dark:text-white/10" size={20} />
                   </div>
                </div>
              </div>

              {/* Push Notifications Toggle */}
              <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Bell size={24} />
                  </div>
                  <div>
                    <h4 className="font-black uppercase tracking-tight">Push Notifications</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Global Master Switch</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                   <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                     When disabled, all automated push notifications (Challenges, Social, Rank Ups) will be blocked globally. Manual notifications from the dashboard will still work if the Admin SDK is loaded.
                   </p>
                   <button 
                     onClick={async () => {
                       const newState = !settings?.pushNotificationsEnabled;
                       await update(ref(db, 'settings'), { pushNotificationsEnabled: newState });
                     }}
                     className={cn(
                       "w-full py-6 rounded-3xl font-black uppercase tracking-widest text-xs transition-all border shadow-lg",
                       settings?.pushNotificationsEnabled 
                         ? "bg-green-500 text-white border-green-400 shadow-green-500/20" 
                         : "bg-red-500 text-white border-red-400 shadow-red-500/20"
                     )}
                   >
                     {settings?.pushNotificationsEnabled ? 'NOTIFICATIONS ARE ACTIVE' : 'NOTIFICATIONS ARE DISABLED'}
                   </button>
                </div>
              </div>
            </div>

            {/* Game Update Code Settings */}
            <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h4 className="font-black uppercase tracking-tight text-black dark:text-white">Game Update Settings</h4>
                  <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Update Code & Redirect Configuration</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Target Update Code</label>
                  <input
                    type="text"
                    value={localUpdateCode}
                    onChange={(e) => setLocalUpdateCode(e.target.value)}
                    placeholder="e.g. 100"
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Platform Update URL</label>
                  <input
                    type="text"
                    value={localUpdateUrl}
                    onChange={(e) => setLocalUpdateUrl(e.target.value)}
                    placeholder="e.g. https://play.google.com/store"
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Update Alert Message</label>
                <textarea
                  value={localUpdateMessage}
                  onChange={(e) => setLocalUpdateMessage(e.target.value)}
                  placeholder="Enter the message to display on the update required popup..."
                  rows={2}
                  className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm transition-all resize-none"
                />
              </div>

              <button
                onClick={async () => {
                  if (!localUpdateCode) {
                    await alert({ title: 'Validation Error', description: 'Please enter a valid update code.', type: 'error' });
                    return;
                  }
                  await update(ref(db, 'settings'), {
                    code: localUpdateCode,
                    updateCodeSettings: {
                      code: localUpdateCode,
                      updateUrl: localUpdateUrl,
                      message: localUpdateMessage
                    }
                  });
                  await alert({ title: 'Settings Saved', description: 'Game update settings saved successfully!', type: 'success' });
                }}
                className="w-full py-6 bg-primary text-black rounded-3xl font-black uppercase tracking-widest text-xs transition-all border border-primary/20 shadow-lg shadow-primary/10 hover:scale-[1.01] active:scale-95"
              >
                Save Update Settings
              </button>
            </div>
          </div>
        );
      case 'special_access':
        return renderSpecialAccessSection();
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
      case 'notifications':
        return renderNotificationsSection();
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
      case 'database':
         return renderDatabaseExplorer();
      case 'marketing':
        return renderMarketingSection();
      case 'ads':
        return renderAdsSection();
      case 'verification':
        const pendingUsers = users.filter(u => u.pendingAvatarUrl);
        return (
          <div className="space-y-8 pb-32">
            <h3 className="text-xl font-black uppercase tracking-tighter text-black dark:text-white">Profile Verification Queue ({pendingUsers.length})</h3>
            
            {pendingUsers.length === 0 ? (
              <div className="bg-black/5 dark:bg-[#111] p-20 rounded-[3rem] border border-black/5 dark:border-white/5 text-center">
                <ImageIcon size={64} className="mx-auto mb-4 text-black/10 dark:text-white/10" />
                <p className="font-black uppercase tracking-widest text-black/20 dark:text-white/20">No pending profile pictures</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingUsers.map(u => (
                  <motion.div 
                    key={u.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5 space-y-6"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary font-black">
                        {u.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-sm text-black dark:text-white uppercase leading-none">{u.name}</p>
                        <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mt-1">@{u.id}</p>
                      </div>
                    </div>

                    <div className="aspect-square w-full rounded-2xl overflow-hidden border border-black/5 dark:border-white/5 bg-black/10 flex items-center justify-center relative group">
                      <img 
                        src={u.pendingAvatarUrl || ''} 
                        alt="Pending" 
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(u.name);
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={() => window.open(u.pendingAvatarUrl || '', '_blank')}
                          className="px-4 py-2 bg-white text-black rounded-xl font-black text-[10px] uppercase tracking-widest shadow-xl"
                        >
                          View Full
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button 
                         onClick={async () => {
                           const v = await confirm({ title: 'Approve Profile Picture?', description: `Allow ${u.name} to use this image as their avatar?`, type: 'confirm' });
                           if (!v) return;
                           await update(ref(db, `users/${u.id}`), {
                             avatarUrl: u.pendingAvatarUrl,
                             pendingAvatarUrl: null
                           });
                           await alert({ title: 'Approved', description: 'User profile updated!', type: 'success' });
                         }}
                         className="flex-1 bg-green-500 text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-2xl shadow-lg shadow-green-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                         <CheckCircle size={14} />
                         Approve
                      </button>
                      <button 
                         onClick={async () => {
                           const v = await confirm({ title: 'Reject Profile Picture?', description: `Reject ${u.name}'s image request?`, type: 'error' });
                           if (!v) return;
                           await update(ref(db, `users/${u.id}`), {
                             pendingAvatarUrl: null
                           });
                           await alert({ title: 'Rejected', description: 'Request removed.', type: 'info' });
                         }}
                         className="px-6 bg-red-500 text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-2xl shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                      >
                         <XCircle size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        );
      case 'requests':
        const unapprovedUsers = users.filter(u => u.status === 'pending');
        const retryRequests = users.filter(u => u.extraTriesRequested);
        return (
          <div className="space-y-12 pb-32">
            {/* Registration Requests */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Registration Requests</h2>
                  <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Users waiting for arena access</p>
                </div>
                <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl border border-primary/20 text-xs font-black uppercase tracking-widest">
                  {unapprovedUsers.length} Pending
                </div>
              </div>

              {unapprovedUsers.length === 0 ? (
                <div className="bg-black/5 dark:bg-[#111] p-12 rounded-[3rem] border border-black/5 dark:border-white/5 text-center">
                  <Shield size={48} className="mx-auto mb-4 text-black/10 dark:text-white/10" />
                  <p className="font-black uppercase tracking-widest text-black/20 dark:text-white/20 text-xs text-black/40">All users are approved</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {unapprovedUsers.map(u => (
                    <motion.div 
                      key={u.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5 space-y-6 flex flex-col"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary font-black">
                          {u.name?.[0]?.toUpperCase() || 'P'}
                        </div>
                        <div>
                          <p className="font-black text-sm text-black dark:text-white uppercase leading-none">{u.name}</p>
                          <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mt-1">@{u.id}</p>
                        </div>
                      </div>

                      <div className="bg-white/5 dark:bg-black/20 p-4 rounded-2xl border border-black/10 dark:border-white/5 flex-1">
                        <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mb-1">Email</p>
                        <p className="text-xs text-black/70 dark:text-white/70 truncate">{u.email}</p>
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            const v = await confirm({ title: 'Approve User?', description: `Allow ${u.name} to play Rahee Quiz?`, type: 'confirm' });
                            if (!v) return;
                            await update(ref(db, `users/${u.id}`), { status: 'approved' });
                            await alert({ title: 'User Approved', description: `${u.name} can now login.`, type: 'success' });
                          }}
                          className="flex-1 bg-green-500 text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-2xl shadow-lg shadow-green-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={14} />
                          Approve
                        </button>
                        <button 
                          onClick={async () => {
                            const v = await confirm({ title: 'Reject User?', description: `Reject ${u.name}'s registration?`, type: 'error' });
                            if (!v) return;
                            await remove(ref(db, `users/${u.id}`));
                            await alert({ title: 'Rejected', description: 'User registration removed.', type: 'info' });
                          }}
                          className="px-6 bg-red-500 text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-2xl shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Retry Extension Requests */}
            <div className="space-y-6">
              <div className="flex items-center justify-between px-2 pt-12 border-t border-black/5 dark:border-white/5">
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Retry Extensions</h2>
                  <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Players requesting additional attempts</p>
                </div>
                <div className="bg-primary/10 text-primary px-4 py-2 rounded-xl border border-primary/20 text-xs font-black uppercase tracking-widest">
                  {retryRequests.length} Requests
                </div>
              </div>

              {retryRequests.length === 0 ? (
                <div className="bg-black/5 dark:bg-[#111] p-12 rounded-[3rem] border border-black/5 dark:border-white/5 text-center">
                  <RotateCcw size={48} className="mx-auto mb-4 text-black/10 dark:text-white/10" />
                  <p className="font-black uppercase tracking-widest text-black/20 dark:text-white/20 text-xs text-black/40">No pending retry requests</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {retryRequests.map(u => (
                    <motion.div 
                      key={u.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5 space-y-6 flex flex-col"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary font-black">
                          {u.name?.[0]?.toUpperCase() || 'P'}
                        </div>
                        <div>
                          <p className="font-black text-sm text-black dark:text-white uppercase leading-none">{u.name}</p>
                          <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mt-1">@{u.id}</p>
                        </div>
                      </div>

                      <div className="bg-white/5 dark:bg-black/20 p-4 rounded-2xl border border-black/10 dark:border-white/5 flex-1">
                        <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mb-1">XP / Round</p>
                        <p className="text-xs text-black/70 dark:text-white/70">{u.xp} XP • Round {u.currentRound}</p>
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={() => allowExtraTries(u.id)}
                          className="flex-1 bg-primary text-black font-black uppercase tracking-widest text-[10px] py-4 rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={14} />
                          Approve
                        </button>
                        <button 
                          onClick={async () => {
                            const v = await confirm({ title: 'Reject Request?', description: `Reject ${u.name}'s extension request?`, type: 'error' });
                            if (!v) return;
                            await update(ref(db, `users/${u.id}`), { extraTriesRequested: false });
                          }}
                          className="px-6 bg-red-500 text-white font-black uppercase tracking-widest text-[10px] py-4 rounded-2xl active:scale-95 transition-all"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      case 'customization':
        return renderCustomization();
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

          <nav className="flex-1 space-y-2 pb-16">
             {[
               { id: 'users', label: 'Players', icon: Users },
               { id: 'requests', label: 'Requests', icon: Clock },
               { id: 'events', label: 'Events', icon: Calendar },
               { id: 'certificate', label: 'Cert Editor', icon: Shield },
               { id: 'topics', label: 'Topics', icon: HelpCircle },
               { id: 'quizzes', label: 'Quizzes', icon: FileText },
               { id: 'bots', label: 'Bots', icon: Bot },
               { id: 'notifications', label: 'Notifications', icon: Bell },
               { id: 'verification', label: 'Verifications', icon: ImageIcon },
               { id: 'feedback', label: 'Support', icon: MessageSquare },
               { id: 'database', label: 'Database', icon: Database },
               { id: 'marketing', label: 'Marketing', icon: Zap },
               { id: 'ads', label: 'Ad Manager', icon: Play },
               { id: 'special_access', label: 'Special Access', icon: Shield },
               { id: 'config', label: 'Config', icon: SettingsIcon },
               { id: 'appearance', label: 'Skin', icon: Palette },
               { id: 'customization', label: 'Customization', icon: Edit2 },
             ].map(tab => (
               <motion.button
                 key={tab.id}
                 whileHover={{ scale: 1.02 }}
                 whileTap={{ scale: 0.98 }}
                 onClick={() => { 
                   setActiveSubTab(tab.id); 
                   setSelectedUser(null);
                   setIsSidebarOpen(false);
                 }}
                 className={cn(
                   "w-full flex items-center gap-2 px-3 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all",
                   activeSubTab === tab.id 
                     ? "bg-primary text-black shadow-lg shadow-primary/20" 
                     : "text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5"
                 )}
               >
                 <tab.icon size={14} />
                 {tab.label}
               </motion.button>
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full max-w-7xl mx-auto space-y-8"
            >
               {renderSection()}
            </motion.div>
          </AnimatePresence>
       </div>
    </div>
  );
}
