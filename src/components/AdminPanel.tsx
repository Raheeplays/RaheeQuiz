import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, firebaseConfig } from '../firebase/config';
import { ref, onValue, set, push, remove, get, update, query, orderByChild, equalTo } from 'firebase/database';
import { User, Topic, Quiz, Feedback, QuizHistory, SpecialMessage, Ad } from '../types';
import ScoreCard from './ScoreCard';
import { Database, Folder, Shield, Users, HelpCircle, FileText, Bot, Plus, Trash2, CheckCircle, XCircle, Upload, MessageSquare, Info, Palette, ChevronRight, History as HistoryIcon, Clock, AlertTriangle, Menu, X as CloseIcon, Edit2, Coins, TrendingUp, Calendar, Sun, Moon, Star, Settings as SettingsIcon, Bell, Send, Share2, Image as ImageIcon, Search, Volume2, Play, RotateCcw, Zap, ChevronUp, ChevronDown, CornerDownRight, Download, Tv, Activity, Maximize2, Heart } from 'lucide-react';
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
import { logActivity, logAdminNotification } from '../activityService';

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
  const [activeSubTab, setActiveSubTab] = useState('dashboard');
  const [users, setUsers] = useState<User[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const getTopicName = (tid: string): string => {
    if (!tid) return 'General';
    const findInArrayOrTree = (list: any[], tId: string): string | null => {
      for (const item of list) {
        if (item.id === tId) return item.name;
        if (item.children) {
          const res = findInArrayOrTree(Object.values(item.children), tId);
          if (res) return res;
        }
      }
      return null;
    };
    return findInArrayOrTree(topics, tid) || tid;
  };
  const [specialMessages, setSpecialMessages] = useState<SpecialMessage[]>([]);
  const [currentSkin, setCurrentSkin] = useState('rahee');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [fullscreenDashboardUser, setFullscreenDashboardUser] = useState<User | null>(null);
  const [historyFullscreenUser, setHistoryFullscreenUser] = useState<User | null>(null);
  const [fullscreenHistorySearch, setFullscreenHistorySearch] = useState('');
  const [fullscreenHistoryTypeFilter, setFullscreenHistoryTypeFilter] = useState<'all' | 'correct' | 'incorrect'>('all');
  const [fullscreenHistoryTopicFilter, setFullscreenHistoryTopicFilter] = useState<string>('all');
  const [deviceUidInput, setDeviceUidInput] = useState('');
  const [userLuxThresholdInput, setUserLuxThresholdInput] = useState('');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved' | 'dismissed'>('pending');
  const [editReportForm, setEditReportForm] = useState<any>(null);

  // Appreciation Note Admin configuration states
  const [userNoteTitle, setUserNoteTitle] = useState('');
  const [userNoteBody, setUserNoteBody] = useState('');
  const [userNoteActive, setUserNoteActive] = useState(false);
  const [userNoteTarget, setUserNoteTarget] = useState('');

  useEffect(() => {
    const noteRef = ref(db, 'gameNote');
    const unsubscribe = onValue(noteRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setUserNoteTitle(val.title || '');
        setUserNoteBody(val.body || '');
        setUserNoteActive(!!val.active);
        setUserNoteTarget(val.targetUserIds || '');
      }
    });
    return () => unsubscribe();
  }, []);

  const saveGameNote = async () => {
    try {
      await set(ref(db, 'gameNote'), {
        title: userNoteTitle,
        body: userNoteBody,
        active: userNoteActive,
        targetUserIds: userNoteTarget,
      });
      await alert({
        title: 'Appreciation Note Saved',
        description: 'The player note screen settings have been successfully updated.',
        type: 'success'
      });
    } catch (err: any) {
      await alert({
        title: 'Error Saving Note',
        description: err.message,
        type: 'error'
      });
    }
  };

  // RTDB Visual Custom Node Grid state declarations
  const [gridCustomConfigs, setGridCustomConfigs] = useState<any[]>([]);
  const [isGridConfigModalOpen, setIsGridConfigModalOpen] = useState(false);
  const [gridFormMode, setGridFormMode] = useState<'add' | 'edit'>('add');
  const [activeEditingConfigId, setActiveEditingConfigId] = useState<string | null>(null);

  const [formPath, setFormPath] = useState('');
  const [formLabel, setFormLabel] = useState('');
  const [formColor, setFormColor] = useState('#32befa');
  const [formMaxVal, setFormMaxVal] = useState('100');

  useEffect(() => {
    try {
      const configsRef = ref(db, 'adminCustomGridConfigs');
      const unsubscribe = onValue(configsRef, (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val();
          const formatted = Object.entries(val).map(([id, item]: any) => ({
            id,
            ...item
          }));
          setGridCustomConfigs(formatted);
        } else {
          // Pre-seed 4 highly styled default configs aligned with the application DB
          const defaults = {
            default_game_timer: {
              path: 'settings/gameSessionTimeLimit',
              label: 'Quiz Session duration',
              color: '#a855f7',
              maxExpectedVal: 120
            },
            default_trivia_size: {
              path: 'settings/triviaRoundSize',
              label: 'Questions Per Set',
              color: '#32befa',
              maxExpectedVal: 20
            },
            default_multiplier: {
              path: 'settings/multiplier',
              label: 'Global Coin Multiplier',
              color: '#10b981',
              maxExpectedVal: 5
            },
            default_lux_threshold: {
              path: 'settings/defaultThemeLuxThreshold',
              label: 'Lux Light Auto Threshold',
              color: '#f59e0b',
              maxExpectedVal: 1000
            }
          };
          set(configsRef, defaults);
        }
      }, (err) => {
        console.error("RTDB custom configurations fetch error:", err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error("Failed to fetch admin configurations:", e);
    }
  }, []);

  useEffect(() => {
    if (selectedUser) {
      setDeviceUidInput(selectedUser.deviceUid || '');
      setUserLuxThresholdInput(selectedUser.ambientThreshold !== undefined ? String(selectedUser.ambientThreshold) : '');
    } else {
      setDeviceUidInput('');
      setUserLuxThresholdInput('');
    }
  }, [selectedUser?.id]);

  const [adminCustomBotNames, setAdminCustomBotNames] = useState('');

  useEffect(() => {
    if (settings && settings.customBotNames !== undefined) {
      setAdminCustomBotNames(settings.customBotNames || '');
    }
  }, [settings?.customBotNames]);

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
  const [newNode, setNewNode] = useState<{ id: string; name: string; description: string; order?: number; disableMultiSelect?: boolean }>({ id: '', name: '', description: '', order: 0, disableMultiSelect: false });
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
  const [forceLoadRoot, setForceLoadRoot] = useState(false);
  const [isRtdbReplicaLayout, setIsRtdbReplicaLayout] = useState(false);
  const [rtdbExpandedPaths, setRtdbExpandedPaths] = useState<Record<string, boolean>>({});
  const [dbExplorerData, setDbExplorerData] = useState<any>(null);
  const [jsonImporterText, setJsonImporterText] = useState('');
  const [jsonImporterPath, setJsonImporterPath] = useState('');
  const [jsonImporterMode, setJsonImporterMode] = useState<'update' | 'set'>('update');
  const [isImportingJson, setIsImportingJson] = useState(false);
  const [csvMakerText, setCsvMakerText] = useState('');
  const [csvMakerError, setCsvMakerError] = useState('');
  const [tokenLinkInput, setTokenLinkInput] = useState('');
  const [adminPlayerUsernameInput, setAdminPlayerUsernameInput] = useState('');
  const [localUpdateCode, setLocalUpdateCode] = useState('');
  const [localUpdateUrl, setLocalUpdateUrl] = useState('');
  const [localUpdateMessage, setLocalUpdateMessage] = useState('');
  const [testFcmToken, setTestFcmToken] = useState('');
  const [adminFcmInput, setAdminFcmInput] = useState<string | null>(null);
  const [fcmSavedFeedback, setFcmSavedFeedback] = useState(false);

  const [globalUpdateCode, setGlobalUpdateCode] = useState('');
  const [globalUpdateUrl, setGlobalUpdateUrl] = useState('');
  const [globalUpdateMessage, setGlobalUpdateMessage] = useState('');
  const [globalCheckedPathPattern, setGlobalCheckedPathPattern] = useState('UserDevices/{deviceUid}/User/UserCode');
  const [globalUpdateHelpMessage, setGlobalUpdateHelpMessage] = useState('Please Contact Developer Or Admin For More Info');

  // Database AppCode path transference tool states
  const [transferenceSourcePath, setTransferenceSourcePath] = useState('users/{userId}/AppCode');
  const [transferenceTargetPath, setTransferenceTargetPath] = useState('UserDevices/{deviceUid}/User/UserCode');
  const [isTransferring, setIsTransferring] = useState(false);

  useEffect(() => {
    const updateRef = ref(db, 'Update');
    const unsubscribe = onValue(updateRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        setGlobalUpdateCode(val.Code !== undefined ? String(val.Code) : '');
        setGlobalUpdateUrl(val.Url || '');
        setGlobalUpdateMessage(val.Message || '');
        setGlobalCheckedPathPattern(val.CheckedPathPattern || 'UserDevices/{deviceUid}/User/UserCode');
        setGlobalUpdateHelpMessage(val.HelpMessage || 'Please Contact Developer Or Admin For More Info');
      }
    });
    return () => unsubscribe();
  }, []);

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
  const [notificationReplies, setNotificationReplies] = useState<any[]>([]);
  const [countdownDuration, setCountdownDuration] = useState<number>(30);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [couponLogs, setCouponLogs] = useState<any[]>([]);
  const [referralLogs, setReferralLogs] = useState<any[]>([]);
  const [adLogs, setAdLogs] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [logsSearchFilter, setLogsSearchFilter] = useState('');
  const [logsTypeFilter, setLogsTypeFilter] = useState('all');
  const [newCouponForm, setNewCouponForm] = useState({ code: '', value: 100, count: 1 });
  const [customTemplates, setCustomTemplates] = useState({
    challenge: { title: 'New Challenge!', body: '{player} has challenged you to a match!' },
    rankUp: { title: 'Rank Increased!', body: 'Congratulations! You reached Rank {rank}!' },
    dailyReset: { title: 'Daily Leaderboard Reset!', body: 'The daily leaderboard has reset! You finished at Rank #{rank}. Start playing to climb back up!' },
    weeklyReset: { title: 'Weekly Arena Reset!', body: 'A new week begins! Your final rank was #{rank}. Can you top the charts this week?' },
    friendRequest: { title: 'New Friend Request', body: '{player} wants to be your friend!' },
    friendAccept: { title: 'Friend Request Accepted', body: '{player} accepted your friend request!' },
    approval: { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true },
    questionOrder: 'random' // 'random' or 'sequential'
  });
  const [pendingTokens, setPendingTokens] = useState<Record<string, string>>({});
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [examTestTimer, setExamTestTimer] = useState<number | null>(null);
  const [scheduleTime, setScheduleTime] = useState('');
  const [searchTokenUser, setSearchTokenUser] = useState('');
  const [certPreviewData, setCertPreviewData] = useState<any>({
    name: 'Rohit Sharma',
    topic: 'General Knowledge',
    score: 18,
    total: 20
  });
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
    return onValue(ref(db, 'notificationReplies'), (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        const arr = Object.keys(val).map(key => ({
          id: key,
          ...val[key]
        }));
        setNotificationReplies(arr.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        setNotificationReplies([]);
      }
    });
  }, []);

  // Auto-synchronize live notification replies from Android into Activity logs for tracking
  useEffect(() => {
    if (notificationReplies.length === 0 || activityLogs.length === 0) return;
    
    const syncReplies = async () => {
      for (const reply of notificationReplies) {
        const uniqueDetailsId = `[Notification Reply ID: ${reply.id}]`;
        // Check if we've already logged this reply
        const alreadyLogged = activityLogs.some(log => log.details && log.details.includes(uniqueDetailsId));
        if (!alreadyLogged) {
          const uId = reply.userId || 'android_client';
          const uName = reply.userName || reply.username || 'Android User';
          // Call logActivity!
          await logActivity(
            uId,
            uName,
            'textbox_reply',
            `Entered Textbox Reply: "${reply.message}" ${uniqueDetailsId}`
          );
        }
      }
    };
    
    syncReplies();
  }, [notificationReplies, activityLogs]);

  useEffect(() => {
    return onValue(ref(db, 'adminConfig/activityLogs'), (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        const arr = Object.keys(val).map(key => ({
          id: key,
          ...val[key]
        }));
        setActivityLogs(arr.sort((a, b) => b.timestamp - a.timestamp));
      } else {
        setActivityLogs([]);
      }
    });
  }, []);

  useEffect(() => {
    const currentPath = dbExplorerPath.join('/');
    if (!currentPath && !forceLoadRoot) {
      setDbExplorerData({
        settings: "[Object/Collection] App operational configurations",
        users: "[Object/Collection] Complete user profile records",
        rooms: "[Object/Collection] Active and legacy play rooms",
        questions: "[Object/Collection] Multi-category trivia sets",
        activityLogs: "[Object/Collection] Trace records of admin actions",
        coupons: "[Object/Collection] Store redeem validation vouchers",
        referrals: "[Object/Collection] User invitation tracking trees",
        _FORCE_LOAD_ENTIRE_DATABASE: "ATTENTION: Pulling the entire database raw will download multi-megabyte payloads. Choose only if needed."
      });
      return;
    }

    const dbRef = ref(db, currentPath || '/');
    return onValue(dbRef, (snapshot) => {
      setDbExplorerData(snapshot.exists() ? snapshot.val() : null);
    });
  }, [dbExplorerPath, forceLoadRoot]);

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
          const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
          for (const token of tokens) {
            await NotificationService.sendToToken(serviceAccount, token, notifForm.title, notifForm.body, notifForm.imageUrl);
          }
        } else if (notifForm.targetType === 'all') {
          // 1. Send via FCM Topic Broadcast (topic: 'all_users') - extremely fast and scalable!
          let topicSent = false;
          let topicError = null;
          try {
            await NotificationService.sendToAll(serviceAccount, notifForm.title, notifForm.body, notifForm.imageUrl);
            topicSent = true;
          } catch (e: any) {
            console.error("FCM Topic Broadcast failed:", e);
            topicError = e.message;
          }

          // 2. Fallback / supplementary measure: Send individually to all registered DB tokens
          const tokensSnap = await get(ref(db, 'fcmTokens'));
          let successCount = 0;
          let failCount = 0;
          
          if (tokensSnap.exists()) {
            const allTokensVal = tokensSnap.val();
            const uniqueTokens = new Set<string>();
            Object.values(allTokensVal).forEach((userMap: any) => {
              const tokens = NotificationService.getTokensFromValue(userMap);
              tokens.forEach(t => uniqueTokens.add(t));
            });
            
            for (const token of uniqueTokens) {
              try {
                await NotificationService.sendToToken(serviceAccount, token, notifForm.title, notifForm.body, notifForm.imageUrl);
                successCount++;
              } catch (e: any) {
                console.error(`FCM individual broadcast failure for token ${token}:`, e);
                failCount++;
              }
            }
          }
          
          await alert({ 
            title: 'Broadcast Complete', 
            description: `Topic Broadcast: ${topicSent ? 'SUCCESS (Sent to topic: all_users)' : 'FAILED (' + topicError + ')'}. Individual Devices: ${successCount} successfully sent, ${failCount} failed.`, 
            type: topicSent ? 'success' : 'warning' 
          });
          return;
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

  const sendTestExamWorkflow = async () => {
    if (!serviceAccount) {
      await alert({ title: 'Error', description: 'Please upload Admin SDK JSON first.', type: 'error' });
      return;
    }

    let targetTokens: string[] = [];
    let userId = "";

    if (notifForm.targetType === 'player') {
      if (!notifForm.targetUserId) {
        await alert({ title: 'Error', description: 'Please select a Target Player first.', type: 'error' });
        return;
      }
      userId = notifForm.targetUserId;
      const tokensSnap = await get(ref(db, `fcmTokens/${userId}`));
      if (tokensSnap.exists()) {
        targetTokens = NotificationService.getTokensFromValue(tokensSnap.val());
      }
    } else if (notifForm.targetType === 'all') {
      const tokensSnap = await get(ref(db, 'fcmTokens'));
      if (tokensSnap.exists()) {
        const allTokensVal = tokensSnap.val();
        const uniqueTokens = new Set<string>();
        Object.values(allTokensVal).forEach((userMap: any) => {
          const tokens = NotificationService.getTokensFromValue(userMap);
          tokens.forEach(t => uniqueTokens.add(t));
        });
        targetTokens = Array.from(uniqueTokens);
      }
    } else if (notifForm.targetType === 'token') {
      if (!notifForm.token) {
        await alert({ title: 'Error', description: 'Please enter an FCM Token first.', type: 'error' });
        return;
      }
      targetTokens = [notifForm.token];
    } else {
      await alert({ title: 'Error', description: 'Testing supports "All Users", "Single Player", or "Specific Token" target types.', type: 'error' });
      return;
    }

    if (targetTokens.length === 0 && notifForm.targetType !== 'all') {
      await alert({ title: 'Error', description: 'No active FCM tokens found for the target.', type: 'error' });
      return;
    }

    let targetExamId = "test_exam_event";
    if (events && events.length > 0) {
      targetExamId = events[0].id;
    } else {
      const defaultEvent = {
        id: "test_exam_event",
        title: "Physical Geology Exam",
        description: "Standard Test Exam for geology physical parameters",
        topicId: "petrology",
        questionsCount: 5,
        durationMinutes: 10,
        createdAt: Date.now()
      };
      await set(ref(db, `events/test_exam_event`), defaultEvent);
    }

    setIsSendingNotif(true);
    try {
      const regTitle = "Exam Registration Open";
      const regBody = "Quiz Exam starts at 00:00 AM (Registration closes in 1 min). Register now!";
      const regPushData = {
        action_type: "exam_registration",
        examId: targetExamId,
        title: regTitle,
        body: regBody
      };

      if (notifForm.targetType === 'all') {
        await NotificationService.sendToAll(serviceAccount, regTitle, regBody, undefined, regPushData);
      } else {
        for (const token of targetTokens) {
          try {
            await NotificationService.sendToToken(serviceAccount, token, regTitle, regBody, undefined, regPushData);
          } catch (e) {
            console.error("FCM Send token reg error:", e);
          }
        }
      }

      await alert({ 
        title: "Registration Sent", 
        description: `Step 1 sent. Second notification (Exam Started) will trigger automatically in exactly 1 minute. Do not close this tab or panel!`, 
        type: 'success' 
      });

      let remaining = 60;
      setExamTestTimer(remaining);

      const intervalId = setInterval(async () => {
        remaining--;
        setExamTestTimer(remaining);

        if (remaining <= 0) {
          clearInterval(intervalId);
          setExamTestTimer(null);

          try {
            const startTitle = "Exam Started Now!";
            const startBody = "The exam has successfully started at 00:00 AM. Click 'Start Exam' to view!";
            const startPushData = {
              action_type: "exam_started",
              examId: targetExamId,
              title: startTitle,
              body: startBody
            };

            if (notifForm.targetType === 'all') {
              await NotificationService.sendToAll(serviceAccount, startTitle, startBody, undefined, startPushData);
            } else {
              for (const token of targetTokens) {
                try {
                  await NotificationService.sendToToken(serviceAccount, token, startTitle, startBody, undefined, startPushData);
                } catch (e) {
                  console.error("Failed to deliver 2nd notification to token:", token, e);
                }
              }
            }
            await alert({ 
              title: "Exam Started Notification Sent!", 
              description: "The second notification with 'START EXAM' and 'SKIP EXAM' actions has been successfully sent to target devices.", 
              type: "success" 
            });
          } catch (err2: any) {
            console.error("Failed sending 2nd exam notification:", err2);
          }
        }
      }, 1000);

    } catch (err: any) {
      await alert({ title: 'Error', description: err.message, type: 'error' });
    } finally {
      setIsSendingNotif(false);
    }
  };

  const sendTestNotificationType = async (type: 'challenge' | 'reply_accepted' | 'reply_rejected' | 'countdown' | 'textbox_reply' | 'raw' | 'friend_request' | 'friend_accept' | 'friend_reject') => {
    if (!serviceAccount) {
      await alert({ title: 'Error', description: 'Please upload Admin SDK JSON first.', type: 'error' });
      return;
    }

    const trimmedToken = testFcmToken.trim();
    if (!trimmedToken) {
      await alert({ title: 'Error', description: 'Please enter a target FCM Token in the test layout below.', type: 'error' });
      return;
    }

    const targetTokens = [trimmedToken];
    const userId = "test_target_player";

    setIsSendingNotif(true);
    try {
      let title = "";
      let body = "";
      let pushData: { [key: string]: string } = {};

      if (type === 'challenge') {
        title = "RaheeQuiz Match Challenge!";
        body = "Admin has challenged you to an active match. Accept now!";
        pushData = {
          action_type: 'challenge',
          roomId: 'test_room_' + Math.floor(Math.random() * 900000),
          hostId: adminUser?.id || 'admin_test_host',
          hostName: adminUser?.name || 'Admin Tester',
          targetUserId: userId || 'test_target'
        };
      } else if (type === 'reply_accepted') {
        title = "Challenge Accepted! (Test)";
        body = "Admin has accepted your match challenge. Open to play!";
        pushData = {
          action_type: 'reply_accepted',
          roomId: 'test_room_' + Math.floor(Math.random() * 900000),
          opponentId: adminUser?.id || 'admin_test_host',
          opponentName: adminUser?.name || 'Admin Tester'
        };
      } else if (type === 'reply_rejected') {
        title = "Challenge Rejected (Test)";
        body = "Admin has declined your match challenge.";
        pushData = {
          action_type: 'reply_rejected',
          roomId: 'test_room_' + Math.floor(Math.random() * 900000),
          opponentId: adminUser?.id || 'admin_test_host',
          opponentName: adminUser?.name || 'Admin Tester'
        };
      } else if (type === 'countdown') {
        title = "Exam Schedule Starting (Test)";
        body = "The custom physical geology exam is starting. Hurry!";
        pushData = {
          action_type: 'countdown',
          durationSeconds: countdownDuration.toString(),
          title: "Exam Starting Now",
          body: "Answer questions quickly before time expires!"
        };
      } else if (type === 'textbox_reply') {
        title = "Feedback Input Request (Test)";
        body = "We want your feedback. Respond directly in this notification!";
        pushData = {
          action_type: 'textbox_reply',
          title: "Feedback Questionnaire",
          body: "Are you enjoying the app? Please type below and press send:"
        };
      } else if (type === 'friend_request') {
        title = "New Friend Request";
        body = `${adminUser?.name || 'Admin'} wants to be your friend!`;
        pushData = {
          action_type: 'friend_request',
          senderId: adminUser?.id || 'admin_test_host',
          senderName: adminUser?.name || 'Admin Tester',
          targetUserId: userId || 'test_target',
          targetUserName: 'Opponent'
        };
      } else if (type === 'friend_accept') {
        title = "Friend Request Accepted";
        body = `${adminUser?.name || 'Admin'} accepted your friend request!`;
        pushData = {
          action_type: 'friend_accept_test'
        };
      } else if (type === 'friend_reject') {
        title = "Friend Request Declined";
        body = `${adminUser?.name || 'Admin'} rejected your friend request`;
        pushData = {
          action_type: 'friend_reject_test'
        };
      } else {
        // Raw notification - reads directly from Admin Notification Panel Title & Body forms!
        title = notifForm.title || "Admin Update Notification";
        body = notifForm.body || "This is a raw notification with no buttons.";
      }

      let successCount = 0;
      let failCount = 0;
      let lastErrorMessage = "";

      // deliver individually to the testFcmToken
      for (const token of targetTokens) {
        try {
          if (type === 'raw') {
            const imgUrl = notifForm.imageUrl || undefined;
            await NotificationService.sendToToken(serviceAccount, token, title, body, imgUrl, undefined);
          } else {
            await NotificationService.sendToToken(serviceAccount, token, title, body, undefined, pushData);
          }
          successCount++;
        } catch (tokErr: any) {
          console.error(`FCM test send failed for token ${token}:`, tokErr);
          failCount++;
          lastErrorMessage = tokErr.message || "Unknown error";
        }
      }

      if (successCount === 0 && failCount > 0) {
        let errMsg = lastErrorMessage;
        if (errMsg.includes('Requested entity was not found')) {
          errMsg = "Requested entity was not found. This standard FCM error means that the target device's FCM token is invalid or expired for this service account's project. Please re-run the Android app, check your linked FCM tokens, or upload an Admin SDK JSON matching the project!";
        }
        throw new Error(`Failed to deliver notifications to any device: ${errMsg}`);
      }

      await alert({ 
        title: 'Test Broadcast Completed', 
        description: `Successfully sent test "${type}" notification securely to FCM Token. Reached: ${successCount} devices (${failCount} expired devices skipped).`, 
        type: 'success' 
      });
    } catch (err: any) {
      console.error("Test send error:", err);
      let errMsg = err.message || 'Unknown notification error occurred.';
      if (errMsg.includes('Requested entity was not found')) {
        errMsg = "Requested entity was not found. This standard FCM error means that the target device's FCM token is invalid or expired for this service account's project. Please re-run the Android app, check your linked FCM tokens, or upload an Admin SDK JSON matching the project!";
      }
      await alert({ title: 'Error Sending Push', description: errMsg, type: 'error' });
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
        const existingTokens = NotificationService.getTokensFromValue(snapshot.val());
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
              const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
              for (const token of tokens) {
                await NotificationService.sendToToken(authObj, token, payload, undefined, undefined, schedule.data);
              }
            }
          } else if (schedule.targetType === 'all') {
            await NotificationService.sendToAll(authObj, payload, undefined, undefined, schedule.data);
          } else if (schedule.targetType === 'topic') {
            await NotificationService.sendToTopic(authObj, schedule.topic || 'all_users', payload, undefined, undefined, schedule.data);
          } else if (schedule.targetType === 'token') {
            await NotificationService.sendToToken(authObj, schedule.token || '', payload, undefined, undefined, schedule.data);
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
      const customCode = newCouponForm.code ? newCouponForm.code.trim().toUpperCase() : '';

      if (customCode) {
        const secretLinkedCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        updates[`coupons/${customCode}`] = {
          code: customCode,
          value,
          isUsed: false,
          createdAt: timestamp,
          createdBy,
          maxUses: count,
          usesCount: 0,
          secretLinkedCode
        };
        await update(ref(db), updates);
        await alert({ title: 'Success', description: `Generated custom coupon "${customCode}" with limit of ${count} redemptions. (Secret linked: ${secretLinkedCode})`, type: 'success' });
      } else {
        for (let i = 0; i < count; i++) {
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          updates[`coupons/${code}`] = {
            code,
            value,
            isUsed: false,
            createdAt: timestamp,
            createdBy,
            maxUses: 1,
            usesCount: 0
          };
        }
        await update(ref(db), updates);
        await alert({ title: 'Success', description: `Generated ${count} random coupon(s) of value ${value} coins.`, type: 'success' });
      }
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
    topicIds: [] as string[],
    questionStartRange: '',
    questionEndRange: '',
    difficultyFilter: 'all',
    startTime: '',
    durationHours: '1',
    durationMinutes: '0',
    isTesting: false,
    selectedPlayers: [] as string[],
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
    difficulty: 3,
    explanationEn: '', explanationHi: '',
    hintEn: '', hintHi: '',
    questionImage: '',
    opt1Image: '', opt2Image: '', opt3Image: '', opt4Image: ''
  });

  const [selectedFilterTopicId, setSelectedFilterTopicId] = useState<string>('all');
  const [selectedFilterDifficulty, setSelectedFilterDifficulty] = useState<string>('all');

  const [pendingCsvRows, setPendingCsvRows] = useState<any[] | null>(null);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvTopicLinkMode, setCsvTopicLinkMode] = useState<'csv' | 'select'>('csv');
  const [selectedCsvTopicId, setSelectedCsvTopicId] = useState<string>('');

  const [recentlyAddedQuizzes, setRecentlyAddedQuizzes] = useState<{ id: string, topicId: string }[]>(() => {
    try {
      const saved = localStorage.getItem('rahee_recently_added_quizzes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const updateRecentlyAddedQuizzes = (lst: { id: string, topicId: string }[]) => {
    setRecentlyAddedQuizzes(lst);
    try {
      localStorage.setItem('rahee_recently_added_quizzes', JSON.stringify(lst));
    } catch (e) {
      console.error(e);
    }
  };

  const deleteRecentlyAddedQuizzes = async () => {
    if (recentlyAddedQuizzes.length === 0) {
      await alert({
        title: "No Recent Imports",
        description: "You haven't imported or added any quizzes in this batch yet, or they have already been deleted.",
        type: 'info'
      });
      return;
    }

    const verified = await confirm({
      title: "Undo Import/Additions",
      description: `Are you sure you want to delete the recently imported/added batch of ${recentlyAddedQuizzes.length} quizzes in one click? This cannot be undone.`,
      type: 'error'
    });

    if (verified) {
      try {
        for (const item of recentlyAddedQuizzes) {
          await remove(ref(db, `topicQuizzes/${item.topicId}/${item.id}`));
        }
        await alert({
          title: "Undo Successful",
          description: `All ${recentlyAddedQuizzes.length} recently added quizzes have been deleted successfully.`,
          type: 'success'
        });
        updateRecentlyAddedQuizzes([]);
      } catch (err: any) {
        await alert({
          title: "Error occurred",
          description: err.message,
          type: 'error'
        });
      }
    }
  };

  const deleteSingleRecentQuiz = async (topicId: string, id: string) => {
    try {
      await remove(ref(db, `topicQuizzes/${topicId}/${id}`));
      updateRecentlyAddedQuizzes(recentlyAddedQuizzes.filter(item => !(item.id === id && item.topicId === topicId)));
      await alert({
        title: "Quiz Deleted",
        description: `Successfully deleted recently added quiz #${id} from ${topicId}!`,
        type: 'success'
      });
    } catch (err: any) {
      await alert({
        title: "Error",
        description: err.message,
        type: 'error'
      });
    }
  };

  const displayedQuizzes = useMemo(() => {
    return quizzes.filter(q => {
      const matchesTopic = selectedFilterTopicId === 'all' || q.topicId === selectedFilterTopicId;
      const matchesDiff = selectedFilterDifficulty === 'all' || String(q.difficulty ?? 3) === selectedFilterDifficulty;
      return matchesTopic && matchesDiff;
    });
  }, [quizzes, selectedFilterTopicId, selectedFilterDifficulty]);

  const displayedFullscreenHistory = useMemo(() => {
    if (!historyFullscreenUser) return [];
    
    return userHistory.filter(h => {
      const quiz = quizzes.find(q => q.id === h.quizId);
      if (!quiz) return false;
      
      const matchesTopic = fullscreenHistoryTopicFilter === 'all' || quiz.topicId === fullscreenHistoryTopicFilter;
      const matchesType = fullscreenHistoryTypeFilter === 'all' || 
                          (fullscreenHistoryTypeFilter === 'correct' && h.isCorrect) ||
                          (fullscreenHistoryTypeFilter === 'incorrect' && !h.isCorrect);
      
      const qTextEn = quiz?.question?.en || '';
      const qTextHi = quiz?.question?.hi || '';
      const searchLower = fullscreenHistorySearch.toLowerCase();
      
      const matchesSearch = !fullscreenHistorySearch || 
                            qTextEn.toLowerCase().includes(searchLower) ||
                            qTextHi.toLowerCase().includes(searchLower) ||
                            quiz.id.includes(searchLower);
                            
      return matchesTopic && matchesType && matchesSearch;
    });
  }, [userHistory, quizzes, historyFullscreenUser, fullscreenHistorySearch, fullscreenHistoryTypeFilter, fullscreenHistoryTopicFilter]);

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
    let usersList: User[] = [];
    let botsList: User[] = [];

    get(ref(db, 'users')).then(s => {
      if (s.exists()) {
        usersList = Object.entries(s.val())
          .filter(([_, val]) => val !== null)
          .map(([key, val]: [string, any]) => ({ ...val, id: key, isBot: false })) as User[];
      } else {
        usersList = [];
      }
      setUsers(prev => {
        const bots = prev.filter(u => u.isBot);
        return [...usersList, ...bots];
      });
    }).catch(err => {
      console.error("Failed to load users:", err);
    });

    get(ref(db, 'bots')).then(s => {
      if (s.exists()) {
        botsList = Object.entries(s.val())
          .filter(([_, val]) => val !== null)
          .map(([key, val]: [string, any]) => ({ ...val, id: key, isBot: true })) as User[];
      } else {
        botsList = [];
      }
      setUsers(prev => {
        const rUsers = prev.filter(u => !u.isBot);
        return [...rUsers, ...botsList];
      });
    }).catch(err => {
      console.error("Failed to load bots:", err);
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
      } else {
        setQuizzes([]);
      }
    });

    onValue(ref(db, 'feedback'), s => {
      if (s.exists()) {
        const data = s.val();
        setFeedback(Object.entries(data).filter(([_, val]) => val !== null).map(([key, val]: [string, any]) => ({ ...val, id: key })));
      }
    });
    onValue(ref(db, 'reports'), s => {
      if (s.exists()) {
        const data = s.val();
        setReports(Object.entries(data).filter(([_, val]) => val !== null).map(([key, val]: [string, any]) => ({ ...val, id: key })));
      } else {
        setReports([]);
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
    const targetUser = selectedUser || historyFullscreenUser;
    if (targetUser) {
      setAdminPlayerUsernameInput(targetUser.username || '');
      const historyRef = ref(db, 'history');
      const unsubscribe = onValue(historyRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const mapped = Object.entries(data)
            .filter(([_, val]) => val !== null)
            .map(([key, val]: [string, any]) => ({ ...val, id: key }))
            .filter((h: any) => h.userId === targetUser.id);
          setUserHistory(mapped.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0)));
        } else {
          setUserHistory([]);
        }
      });
      return () => unsubscribe();
    } else {
      setUserHistory([]);
    }
  }, [selectedUser, historyFullscreenUser]);

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

  const updateCustomTemplatesDirectly = async (updated: typeof customTemplates) => {
    setCustomTemplates(updated);
    await set(ref(db, 'customNotifications'), updated);
  };

  const linkTokenToUserSilent = async (userId: string, token: string) => {
    if (!token) return;
    try {
      const tokensRef = ref(db, `fcmTokens/${userId}`);
      const snapshot = await get(tokensRef);
      if (snapshot.exists()) {
        const existingTokens = NotificationService.getTokensFromValue(snapshot.val());
        if (existingTokens.includes(token)) {
          return;
        }
      }
      await push(ref(db, `fcmTokens/${userId}`), token);
    } catch (err) {
      console.error("Token link silent failed:", err);
    }
  };

  const sendApprovalNotification = async (userId: string, userName: string) => {
    const config = customTemplates.approval || { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true };
    if (!config.enabled) {
      console.log("Approval notification is disabled globally.");
      return;
    }

    if (!serviceAccount) {
      console.warn("Service account not loaded. Cannot send approval notification.");
      return;
    }

    try {
      const tokensSnap = await get(ref(db, `fcmTokens/${userId}`));
      if (!tokensSnap.exists()) {
        console.warn(`No FCM tokens found for player ${userId}`);
        return;
      }
      const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
      if (tokens.length === 0) return;

      let bodyText = config.body;
      if (config.includeName) {
        bodyText = bodyText.replace(/{player}/g, userName);
      } else {
        bodyText = bodyText.replace(/{player}/g, "").replace(/\s\s+/g, ' ').trim();
      }

      for (const token of tokens) {
        await NotificationService.sendToToken(serviceAccount, token, config.title, bodyText);
      }
      console.log(`Sent approval notification to ${tokens.length} tokens of player ${userName}`);
    } catch (err) {
      console.error("Failed to send approval notification:", err);
    }
  };

  const approveUserAndNotify = async (user: User, tokenInput?: string) => {
    try {
      if (tokenInput && tokenInput.trim()) {
        await linkTokenToUserSilent(user.id, tokenInput.trim());
      }
      await set(ref(db, `users/${user.id}/status`), 'approved');
      
      const config = customTemplates.approval || { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true };
      if (config.enabled) {
        await sendApprovalNotification(user.id, user.name || '');
      }
      await logAdminNotification('approved', user.name || user.username || user.id);
    } catch (e: any) {
      console.error("Failed to approve user:", e);
    }
  };

  const changeUserStatus = async (userId: string, status: any) => {
    if (status === 'approved') {
      const user = users.find(u => u.id === userId);
      if (user) {
        await approveUserAndNotify(user);
        return;
      }
    }
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
    
    setIsCreatingUser(true);
    try {
      const usersRef = ref(db, 'users');
      const snapshot = await get(usersRef);
      
      let finalUsername = cleanUsername;
      let uid = cleanUsername;

      if (snapshot.exists()) {
        const usersData = snapshot.val();
        let suffix = 1;
        while (
          Object.keys(usersData).some(id => id.toLowerCase() === uid.toLowerCase()) ||
          Object.values(usersData).some((u: any) => u.username?.toLowerCase() === finalUsername.toLowerCase())
        ) {
          finalUsername = `${cleanUsername}_${suffix}`;
          uid = `${cleanUsername}_${suffix}`;
          suffix++;
        }
      }

      const finalEmail = `${finalUsername}@Rahee.in`;

      // 3. Create DB User profile
      const userRef = ref(db, `users/${uid}`);
      const newUser: User = {
        id: uid,
        name: newPlayerName,
        email: finalEmail,
        username: finalUsername,
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
      
      await alert({ title: 'Success', description: 'Player account created successfully!', type: 'success' });
      setIsAddingUser(false);
      setNewPlayerName('');
      setNewPlayerUsername('');
      setNewPlayerPassword('');

    } catch (err: any) {
      console.error("Failed to create user:", err);
      await alert({ title: 'Error', description: err.message, type: 'error' });
    } finally {
      setIsCreatingUser(false);
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
      const botsRef = ref(db, 'bots');
      const usernameQueryUsers = query(usersRef, orderByChild('username'), equalTo(cleanUsername));
      const usernameQueryBots = query(botsRef, orderByChild('username'), equalTo(cleanUsername));
      
      const [checkUsers, checkBots] = await Promise.all([
        get(usernameQueryUsers),
        get(usernameQueryBots)
      ]);
      
      if (checkUsers.exists() || checkBots.exists()) {
        await alert({ title: 'Error', description: 'Username already taken', type: 'error' });
        setIsCreatingBot(false);
        return;
      }

      const bRef = push(ref(db, 'bots'));
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
      order: newTopic.order || topics.length,
      disableMultiSelect: newTopic.disableMultiSelect || false
    };
    
    // Preserve existing children if editing
    if (editingTopicId) {
       const existingTopic = topics.find(t => t.id === editingTopicId);
       if (existingTopic?.children) {
          topicData.children = existingTopic.children;
       }
    }
    
    await set(ref(db, `topics/${topicId}`), topicData);
    setNewTopic({ name: '', order: 0, disableMultiSelect: false });
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
      order: newNode.order || 0,
      disableMultiSelect: newNode.disableMultiSelect || false
    };
    
    if (nodeEditMode) {
      const current = getCurrentNode();
      const existing = current?.children?.[nodeEditMode];
      if (existing?.children) {
        nodeData.children = existing.children;
      }
    }

    await set(ref(db, dbPath), nodeData);
    setNewNode({ id: '', name: '', description: '', order: 0, disableMultiSelect: false });
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
      difficulty: newQuiz.difficulty || 3,
      explanation: { en: newQuiz.explanationEn, hi: newQuiz.explanationHi || newQuiz.explanationEn },
      hint: { en: newQuiz.hintEn, hi: newQuiz.hintHi || newQuiz.hintEn },
      questionImage: newQuiz.questionImage || '',
      optionImages: [newQuiz.opt1Image, newQuiz.opt2Image, newQuiz.opt3Image, newQuiz.opt4Image].map(img => img || '')
    };

    await set(ref(db, `topicQuizzes/${quiz.topicId}/${quizId}`), quiz);
    updateRecentlyAddedQuizzes([{ id: quizId, topicId: quiz.topicId }]);
    setNewQuiz({
      questionEn: '', questionHi: '',
      opt1En: '', opt1Hi: '',
      opt2En: '', opt2Hi: '',
      opt3En: '', opt3Hi: '',
      opt4En: '', opt4Hi: '',
      correct: 1, topicId: '', 
      difficulty: 3,
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
      difficulty: q.difficulty || 3,
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
        q.difficulty || 3,
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
      description: 'Loaded all quizzes. Format: ID, Q_EN, Q_HI, O1_EN, O1_HI, O2_EN, O2_HI, O3_EN, O3_HI, O4_EN, O4_HI, Correct, Topic, Difficulty, Exp_EN, Exp_HI, HINT_EN, HINT_HI, Q_IMG, O1_IMG, O2_IMG, O3_IMG, O4_IMG',
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

    const bulkAdded: { id: string, topicId: string }[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(',').map(p => p.trim());
      
      if (parts.length >= 11) {
        let id, qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, diff, expEn, expHi, hEn, hHi, qImg, o1Img, o2Img, o3Img, o4Img;
        
        // Check if first part is a numeric ID or looks like a question
        const isFirstPartId = !isNaN(parseInt(parts[0])) && parts[0].length < 10;
        
        if (isFirstPartId) {
          [id, qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, diff, expEn, expHi, hEn, hHi, qImg, o1Img, o2Img, o3Img, o4Img] = parts;
        } else {
          [qEn, qHi, o1En, o1Hi, o2En, o2Hi, o3En, o3Hi, o4En, o4Hi, corr, topic, diff, expEn, expHi, hEn, hHi, qImg, o1Img, o2Img, o3Img, o4Img] = parts;
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
          difficulty: parseInt(diff, 10) || 3,
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
        bulkAdded.push({ id: id.toString(), topicId: quiz.topicId });
        count++;
      }
    }
    updateRecentlyAddedQuizzes(bulkAdded);
    setBulkText('');
    await alert({
      title: "Bulk Process Complete",
      description: `Successfully processed ${count} quizzes!`,
      type: 'success'
    });
  };

  const processPendingCsvQuizzes = async () => {
    if (!pendingCsvRows) return;

    try {
      // Build maps tracking all quiz IDs currently in use inside each topic
      const topicToIdsMap: { [topicId: string]: Set<string> } = {};
      quizzes.forEach(q => {
        const tId = q.topicId || 'general';
        if (!topicToIdsMap[tId]) {
          topicToIdsMap[tId] = new Set();
        }
        topicToIdsMap[tId].add(q.id.toString());
      });

      // Find highest overall numeric ID to safely fall back to avoiding collisions
      let nextIdNum = quizzes
        .map(q => parseInt(q.id))
        .filter(id => !isNaN(id))
        .reduce((max, id) => Math.max(max, id), 0);

      const csvAdded: { id: string; topicId: string }[] = [];
      let skippedCount = 0;

      for (const row of pendingCsvRows) {
        if (!row.questionEn && !row.QuestionEn && !row.question && !row.Question) continue;

        let finalTopicId = 'general';
        if (csvTopicLinkMode === 'csv') {
          finalTopicId = row.topicId || row.TopicId || (topics[0]?.id || 'general');
        } else {
          finalTopicId = selectedCsvTopicId || (topics[0]?.id || 'general');
        }

        const qEn = (row.questionEn || row.QuestionEn || row.question || row.Question || '').toString().trim();
        const qHi = (row.questionHi || row.QuestionHi || row.questionEn || row.QuestionEn || row.question || row.Question || '').toString().trim();

        const optEn = [
          row.opt1En || row.Opt1En || row.option1 || row.Option1, 
          row.opt2En || row.Opt2En || row.option2 || row.Option2, 
          row.opt3En || row.Opt3En || row.option3 || row.Option3, 
          row.opt4En || row.Opt4En || row.option4 || row.Option4
        ].filter((o: any) => o !== undefined && o !== null && o !== '').map((o: any) => o.toString().trim());

        const optHi = [
          row.opt1Hi || row.Opt1Hi || row.opt1En || row.Opt1En || row.option1 || row.Option1, 
          row.opt2Hi || row.Opt2Hi || row.opt2En || row.Opt2En || row.option2 || row.Option2, 
          row.opt3Hi || row.Opt3Hi || row.opt3En || row.Opt3En || row.option3 || row.Option3, 
          row.opt4Hi || row.Opt4Hi || row.opt4En || row.Opt4En || row.option4 || row.Option4
        ].filter((o: any) => o !== undefined && o !== null && o !== '').map((o: any) => o.toString().trim());

        const expEn = (row.explanationEn || row.ExplanationEn || row.explanation || row.Explanation || row.expEn || row.ExpEn || row.exp || row.Exp || '').toString().trim();
        const expHi = (row.explanationHi || row.ExplanationHi || row.explanation || row.Explanation || row.expHi || row.ExpHi || row.exp || row.Exp || '').toString().trim();

        // Check if there is an existing quiz matching this content and topic
        const isDuplicateQuiz = quizzes.some(existing => {
          if ((existing.topicId || 'general') !== finalTopicId) return false;

          const exQEn = (existing.question?.en || '').toString().trim();
          const exQHi = (existing.question?.hi || '').toString().trim();
          if (exQEn.toLowerCase() !== qEn.toLowerCase()) return false;
          if (exQHi.toLowerCase() !== qHi.toLowerCase()) return false;

          const exExpEn = (existing.explanation?.en || '').toString().trim();
          const exExpHi = (existing.explanation?.hi || '').toString().trim();
          if (exExpEn.toLowerCase() !== expEn.toLowerCase()) return false;
          if (exExpHi.toLowerCase() !== expHi.toLowerCase()) return false;

          const exOptEn = (existing.options?.en || []).map((o: any) => o.toString().trim());
          const exOptHi = (existing.options?.hi || []).map((o: any) => o.toString().trim());

          if (exOptEn.length !== optEn.length) return false;
          if (exOptHi.length !== optHi.length) return false;

          for (let i = 0; i < optEn.length; i++) {
            if (exOptEn[i].toLowerCase() !== optEn[i].toLowerCase()) return false;
          }
          for (let i = 0; i < optHi.length; i++) {
            if (exOptHi[i].toLowerCase() !== optHi[i].toLowerCase()) return false;
          }

          return true;
        });

        if (isDuplicateQuiz) {
          skippedCount++;
          continue;
        }

        if (!topicToIdsMap[finalTopicId]) {
          topicToIdsMap[finalTopicId] = new Set();
        }

        let proposedId = row.id ? row.id.toString().trim() : '';

        // If no ID is specified, or if proposedId already exists in this topic, we generate a fresh, unique numeric ID
        if (!proposedId || topicToIdsMap[finalTopicId].has(proposedId)) {
          nextIdNum++;
          proposedId = nextIdNum.toString();
          // Keep incrementing if there's somehow still a collision under this topic
          while (topicToIdsMap[finalTopicId].has(proposedId)) {
            nextIdNum++;
            proposedId = nextIdNum.toString();
          }
        }

        // Track that this proposedId is now database-bound in this topic to handle matches sequentially
        topicToIdsMap[finalTopicId].add(proposedId);

        const quiz: any = {
          id: proposedId,
          topicId: finalTopicId,
          question: { 
            en: row.questionEn || row.QuestionEn || row.question || row.Question || '', 
            hi: row.questionHi || row.QuestionHi || row.questionEn || row.QuestionEn || row.question || row.Question || '' 
          },
          difficulty: parseInt(row.difficulty || row.Difficulty || row.diff || row.Diff || row.DIFF || '3', 10) || 3,
          options: {
            en: [
              row.opt1En || row.Opt1En || row.option1 || row.Option1, 
              row.opt2En || row.Opt2En || row.option2 || row.Option2, 
              row.opt3En || row.Opt3En || row.option3 || row.Option3, 
              row.opt4En || row.Opt4En || row.option4 || row.Option4
            ].filter((o: any) => o),
            hi: [
              row.opt1Hi || row.Opt1Hi || row.opt1En || row.Opt1En || row.option1 || row.Option1, 
              row.opt2Hi || row.Opt2Hi || row.opt2En || row.Opt2En || row.option2 || row.Option2, 
              row.opt3Hi || row.Opt3Hi || row.opt3En || row.Opt3En || row.option3 || row.Option3, 
              row.opt4Hi || row.Opt4Hi || row.opt4En || row.Opt4En || row.option4 || row.Option4
            ].filter((o: any) => o)
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

        await set(ref(db, `topicQuizzes/${quiz.topicId}/${proposedId}`), quiz);
        csvAdded.push({ id: proposedId, topicId: quiz.topicId });
      }

      updateRecentlyAddedQuizzes(csvAdded);
      setIsCsvModalOpen(false);
      setPendingCsvRows(null);

      await alert({
        title: "Success",
        description: `Successfully imported ${csvAdded.length} new quizzes to the database.${skippedCount > 0 ? ` (${skippedCount} duplicate quizzes were skipped)` : ''}`,
        type: 'success'
      });
    } catch (err: any) {
      await alert({
        title: "Import Failed",
        description: err.message || "An error occurred while importing your quizzes from the CSV file.",
        type: 'error'
      });
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'quizzes' | 'bots') => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        if (type === 'quizzes') {
          setPendingCsvRows(results.data as any[]);
          setIsCsvModalOpen(true);
          setCsvTopicLinkMode('csv');
          if (topics && topics.length > 0) {
            setSelectedCsvTopicId(topics[0].id);
          } else {
            setSelectedCsvTopicId('general');
          }
          e.target.value = '';
        } else {
          for (const row of results.data as any[]) {
            if (!row.name) continue;
            const bRef = push(ref(db, 'bots'));
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
          await alert({
            title: "Import Complete",
            description: `Imported ${results.data.length} Bots`,
            type: 'success'
          });
          e.target.value = '';
        }
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
      difficulty: '3',
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
      difficulty: q.difficulty || 3,
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
              {ads.map((ad, adIdx) => (
                <div
                  key={`ad-card-${ad.id || adIdx}-${adIdx}`}
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
                 <div key={c.code} className="bg-black/5 dark:bg-[#111] p-4 rounded-2xl border border-black/5 dark:border-white/5 relative group flex flex-col justify-between min-h-[9rem]">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                         <span className="text-[10px] font-black tracking-widest text-[#32befa] bg-[#32befa]/5 px-2 py-0.5 rounded">{c.value} CR</span>
                         <button onClick={() => deleteCoupon(c.code)} className="opacity-0 group-hover:opacity-100 p-1 text-red-500/30 hover:text-red-500 transition-all">
                            <Trash2 size={12} />
                         </button>
                      </div>
                      <code className="block text-sm font-black text-black dark:text-white mb-1 font-mono truncate select-all">{c.code}</code>
                      {c.secretLinkedCode && (
                        <p className="text-[9px] font-black font-mono text-purple-500 mb-2 truncate select-all">
                          Secret: {c.secretLinkedCode}
                        </p>
                      )}
                      {c.maxUses && c.maxUses > 1 && (
                        <p className="text-[9px] font-bold text-neutral-500 uppercase tracking-wider mb-2">
                          Uses: {c.usesCount || 0} / {c.maxUses}
                        </p>
                      )}
                    </div>
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
                             <tr key={`coupon-log-${log.timestamp || i}-${i}`} className="hover:bg-black/5 dark:hover:bg-white/5 transition-all">
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
                             <tr key={`referral-log-${log.referrerId || log.timestamp || i}-${i}`} className="hover:bg-black/5 dark:hover:bg-white/5 transition-all">
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

  const resolveOneLinkPath = (configuredPath: string, userId: string): string => {
    if (!configuredPath) return '';
    const parts = configuredPath.split('/');
    if (parts[0] === 'users' && parts.length > 1) {
      parts[1] = userId;
      return parts.join('/');
    }
    return configuredPath.replace('{userId}', userId);
  };

  const AdminOneLinkLiveNode = ({ config, userId, onEdit, onDelete }: { config: any; userId: string; onEdit: (c: any) => void; onDelete: (id: string) => any; key?: any }) => {
    const [liveValue, setLiveValue] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const resolvedPath = useMemo(() => {
      return resolveOneLinkPath(config.path, userId);
    }, [config?.path, userId]);

    useEffect(() => {
      if (!resolvedPath) {
        setLoading(false);
        return;
      }
      try {
        const nodeRef = ref(db, resolvedPath);
        const unsubscribe = onValue(nodeRef, (snapshot) => {
          const newVal = snapshot.exists() ? snapshot.val() : null;
          setLiveValue((oldVal: any) => {
            if (JSON.stringify(oldVal) === JSON.stringify(newVal)) {
              return oldVal;
            }
            return newVal;
          });
          setLoading(false);
        }, (err) => {
          console.error("Error reading live path:", resolvedPath, err);
          setLoading(false);
        });
        return () => unsubscribe();
      } catch (e) {
        console.error("Subscription validation error:", e);
        setLoading(false);
      }
    }, [resolvedPath]);

    const maxExpected = config.maxExpectedVal ? Number(config.maxExpectedVal) : 100;
    const isNumeric = typeof liveValue === 'number' || (typeof liveValue === 'string' && !isNaN(Number(liveValue)) && liveValue.trim() !== '');
    const numericVal = isNumeric ? Number(liveValue) : 0;
    
    let stringRep = 'N/A';
    if (liveValue !== null && liveValue !== undefined) {
      if (typeof liveValue === 'object' && liveValue !== null) {
        stringRep = 'Object 📦';
      } else if (typeof liveValue === 'boolean') {
        stringRep = liveValue ? 'True' : 'False';
      } else {
        stringRep = String(liveValue);
      }
    }

    const radius = 38;
    const strokeCircumference = 2 * Math.PI * radius;
    const percentage = Math.min(Math.max((numericVal / maxExpected) * 100, 0), 100);
    const strokeDashoffset = isNumeric 
      ? strokeCircumference - (strokeCircumference * percentage) / 100 
      : (liveValue === true || liveValue === 'true') 
        ? 0 
        : strokeCircumference;

    const colorHex = config.color || '#32befa';

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-[#0c0f14] border border-black/5 dark:border-white/[0.05] p-6 rounded-[2rem] flex flex-col sm:flex-row items-center justify-between gap-6 relative group transition-all"
      >
        <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <button
            onClick={() => onEdit(config)}
            className="p-1.5 bg-black/5 dark:bg-white/5 hover:text-primary rounded-lg transition-all"
            title="Edit Visual Node"
          >
            <Edit2 size={12} />
          </button>
          <button
            onClick={() => onDelete(config.id)}
            className="p-1.5 bg-black/5 dark:bg-white/5 hover:text-red-500 rounded-lg transition-all"
            title="Delete Visual Node"
          >
            <Trash2 size={12} />
          </button>
        </div>

        <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
          <svg className="absolute inset-0 w-full h-full -rotate-90 select-none pointer-events-none" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="currentColor"
              strokeWidth="5.5"
              className="text-neutral-100 dark:text-neutral-900"
              fill="transparent"
            />
            <motion.circle
              cx="50"
              cy="50"
              r={radius}
              stroke={colorHex}
              strokeWidth="5.5"
              fill="transparent"
              strokeDasharray={strokeCircumference}
              animate={{ strokeDashoffset }}
              transition={{ type: "spring", stiffness: 45, damping: 12 }}
              strokeLinecap="round"
            />
          </svg>

          <motion.div 
            key={stringRep}
            initial={{ scale: 0.95, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{ borderColor: colorHex }}
            className="absolute inset-2 border border-dashed rounded-full pointer-events-none"
          />

          <div className="flex flex-col items-center justify-center px-1 text-center z-10 max-w-[80px] overflow-hidden">
            <span className="text-[7px] font-mono uppercase tracking-widest text-neutral-400 font-bold">
              Live
            </span>
            <span 
              className="text-xs sm:text-sm font-black tracking-tight text-black dark:text-white truncate max-w-full font-mono mt-0.5"
              title={stringRep}
            >
              {loading ? '...' : isNumeric ? numericVal : stringRep}
            </span>
          </div>
        </div>

        <div className="flex-1 text-center sm:text-left min-w-0">
           <h4 className="text-xs font-black text-black dark:text-white mb-1 uppercase tracking-tight">{config.label}</h4>
           <div className="space-y-1">
              <span className="inline-block bg-primary/10 text-primary font-mono text-[9px] px-2 py-0.5 rounded-md truncate max-w-full leading-none">
                 Path: {resolvedPath}
              </span>
              <p className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase tracking-widest leading-none">
                 Max: {maxExpected} | Value: {isNumeric ? `${percentage.toFixed(0)}%` : stringRep}
              </p>
           </div>
        </div>
      </motion.div>
    );
  };

  const renderFullscreenPlayerDashboard = (user: User) => {
    return (
      <div className="fixed inset-0 z-[200] bg-gray-100 dark:bg-[#070a0e] text-black dark:text-white flex flex-col p-6 md:p-12 overflow-y-auto">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-6 mb-8 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setFullscreenDashboardUser(null)} 
                className="flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl text-xs font-black uppercase text-black/60 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/10 transition-all hover:scale-105"
              >
                <ChevronRight className="rotate-180" size={16} />
                Back to Profile
              </button>
              <span className="text-[9px] font-black uppercase px-2.5 py-1 bg-primary/15 text-primary border border-primary/20 rounded-lg tracking-widest leading-none">
                Live Node Dashboard (OneLink Active)
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-black dark:text-white mt-3 flex items-center gap-3">
              <Tv size={26} className="text-primary animate-pulse" />
              {user.name} Tracker Dashboard
            </h2>
            <p className="text-xs font-mono text-black/40 dark:text-neutral-400 mt-1 uppercase leading-none">
              Player UID: <span className="text-primary font-bold">{user.id}</span> • Username: @{user.username || 'user'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => {
                setFormPath(`users/${user.id}/`);
                setFormLabel('');
                setFormColor('#32befa');
                setFormMaxVal('100');
                setGridFormMode('add');
                setActiveEditingConfigId(null);
                setIsGridConfigModalOpen(true);
              }}
              className="px-5 py-3 bg-primary text-black font-black uppercase tracking-widest text-[10px] rounded-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <Plus size={14} />
              Add Node Tracker
            </button>
          </div>
        </div>

        {gridCustomConfigs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-dashed border-black/10 dark:border-white/10 rounded-[2.5rem] bg-black/5 dark:bg-white/[0.01]">
            <Database size={48} className="text-neutral-400 dark:text-neutral-650 mb-3 opacity-20 animate-bounce" />
            <h3 className="text-sm font-black text-black dark:text-white uppercase tracking-widest mb-1">No custom tracking visualizers configured.</h3>
            <p className="text-xs text-black/40 dark:text-neutral-400 max-w-sm font-medium">
              Configure target attributes (realtime database nodes) shared across all players. Any path under <code className="text-primary bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded font-mono font-bold">users/</code> is processed with automated substitution mapping.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gridCustomConfigs.map((config) => (
              <AdminOneLinkLiveNode 
                key={config.id}
                config={config} 
                userId={user.id} 
                onEdit={(c) => {
                  setFormPath(c.path);
                  setFormLabel(c.label);
                  setFormColor(c.color || '#32befa');
                  setFormMaxVal(String(c.maxExpectedVal || 100));
                  setGridFormMode('edit');
                  setActiveEditingConfigId(config.id);
                  setIsGridConfigModalOpen(true);
                }}
                onDelete={async (id) => {
                  const verified = await confirm({
                    title: "Delete Node Tracker",
                    description: "Are you sure you want to delete this custom visual tracking card? It will be removed from all screens."
                  });
                  if (verified) {
                    await remove(ref(db, `adminCustomGridConfigs/${id}`));
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderFullscreenPlayerHistory = (user: User) => {
    const userSpecificHistory = userHistory.filter(h => h.userId === user.id);
    const totalAns = userSpecificHistory.length;
    const correctCount = userSpecificHistory.filter(h => h.isCorrect).length;
    const incorrectCount = totalAns - correctCount;
    const correctRate = totalAns > 0 ? Math.round((correctCount / totalAns) * 100) : 0;
    
    return (
      <div className="fixed inset-0 z-[200] bg-gray-100 dark:bg-[#070a0e] text-black dark:text-white flex flex-col p-6 md:p-12 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-6 mb-6 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setHistoryFullscreenUser(null)} 
                className="flex items-center justify-center gap-2 px-3  py-1.5 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl text-xs font-black uppercase text-black/60 dark:text-neutral-300 hover:bg-black/10 dark:hover:bg-white/10 transition-all hover:scale-105"
              >
                <ChevronRight className="rotate-180" size={16} />
                Close Full Screen
              </button>
              <span className="text-[9px] font-black uppercase px-2.5 py-1 bg-primary/15 text-primary border border-primary/20 rounded-lg tracking-widest leading-none">
                Enterprise History Visualizer
              </span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-black dark:text-white mt-3 flex items-center gap-3">
              <HistoryIcon size={26} className="text-primary animate-pulse" />
              {user.name}'s Complete Quiz History
            </h2>
            <p className="text-xs font-mono text-black/40 dark:text-neutral-400 mt-1 uppercase leading-none">
              Registered Username: <span className="text-primary font-bold">@{user.username || 'user'}</span> • Player ID: {user.id}
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 rounded-2xl text-center min-w-[80px]">
              <span className="text-[9px] font-black uppercase text-emerald-500 block">Correct</span>
              <span className="text-xl font-black block leading-none mt-1 text-emerald-500">{correctCount}</span>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-2xl text-center min-w-[80px]">
              <span className="text-[9px] font-black uppercase text-red-500 block">Incorrect</span>
              <span className="text-xl font-black block leading-none mt-1 text-red-500">{incorrectCount}</span>
            </div>
            <div className="bg-primary/15 border border-primary/25 px-4 py-3 rounded-2xl text-center min-w-[100px]">
              <span className="text-[9px] font-black uppercase text-primary block">Success Rate</span>
              <span className="text-xl font-black block leading-none mt-1 text-primary">{correctRate}%</span>
            </div>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-white dark:bg-[#111] border border-black/5 dark:border-white/5 p-4 rounded-3xl mb-4 shrink-0 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40" size={16} />
            <input 
              type="text"
              value={fullscreenHistorySearch}
              onChange={e => setFullscreenHistorySearch(e.target.value)}
              placeholder="Search quiz question text or ID..."
              className="w-full bg-black/5 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold font-mono outline-none focus:border-primary"
            />
          </div>
          
          <div className="flex gap-2 w-full md:w-auto flex-wrap">
            <select
              value={fullscreenHistoryTypeFilter}
              onChange={e => setFullscreenHistoryTypeFilter(e.target.value as any)}
              className="text-xs bg-black/5 dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl font-black uppercase text-black/60 dark:text-white/60 tracking-wider outline-none"
            >
              <option value="all">All Outcome Results</option>
              <option value="correct">✓ Correct Only</option>
              <option value="incorrect">✗ Incorrect Only</option>
            </select>

            <select
              value={fullscreenHistoryTopicFilter}
              onChange={e => setFullscreenHistoryTopicFilter(e.target.value)}
              className="text-xs bg-black/5 dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl font-black uppercase text-black/60 dark:text-white/60 tracking-wider outline-none max-w-[180px] truncate"
            >
              <option value="all">All Topics</option>
              {topics.map(t => <option key={`full-hist-topic-${t.id}`} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {displayedFullscreenHistory.length === 0 ? (
            <div className="bg-white dark:bg-[#111] border border-black/5 dark:border-white/5 rounded-[2rem] p-16 text-center">
              <HistoryIcon size={48} className="text-black/20 dark:text-white/20 mx-auto mb-4" />
              <p className="text-lg font-black uppercase tracking-widest text-black/40 dark:text-white/40">No Matching Quiz History</p>
              <p className="text-xs text-black/30 dark:text-white/30 uppercase mt-1">Try modifying your query or outcome filter presets</p>
            </div>
          ) : (
            displayedFullscreenHistory.map((h, idx) => {
              const quiz = quizzes.find(q => q.id === h.quizId);
              if (!quiz) return null;
              
              const languageOfQuiz = h.language || 'en';
              const questionToShowEn = quiz.question?.en;
              const questionToShowHi = quiz.question?.hi;
              const userSelectedOpt = h.userAnswerIndex !== -1 && quiz.options?.[languageOfQuiz]
                ? quiz.options[languageOfQuiz][h.userAnswerIndex] || 'Unknown Option'
                : 'Skipped';
              const correctOpt = quiz.options?.[languageOfQuiz]?.[quiz.correctAnswerIndex] || '';
              
              const formattedDate = new Date(h.timestamp).toLocaleString();
              
              return (
                <div 
                  key={h.id || `${h.timestamp}-${idx}`} 
                  className={`border p-6 rounded-[2rem] flex flex-col gap-4 hover:border-primary/20 transition-all ${
                    h.isCorrect 
                      ? 'bg-emerald-500/5 dark:bg-emerald-950/10 border-emerald-500/10' 
                      : 'bg-red-500/5 dark:bg-red-950/10 border-red-500/10'
                  }`}
                >
                  <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${
                        h.isCorrect 
                          ? 'bg-emerald-500/20 text-emerald-500' 
                          : 'bg-red-500/20 text-red-500'
                      }`}>
                        {h.isCorrect ? '✓ CORRECT' : '✗ INCORRECT'}
                      </span>
                      <span className="text-[9px] bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 px-2.5 py-1 rounded-full font-mono">
                        QUIZ ID: {quiz.id}
                      </span>
                      <span className="text-[9px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded font-black uppercase tracking-widest ml-1">
                        DIFF: {quiz.difficulty || 3}
                      </span>
                      <span className="text-[9px] bg-primary/10 text-primary px-2.5 py-1 rounded-full font-black uppercase tracking-widest">
                        TOPIC: {getTopicName(quiz.topicId)}
                      </span>
                    </div>
                    <span className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase tracking-wider">{formattedDate}</span>
                  </div>
                  
                  <div>
                    <h4 className="font-extrabold text-base text-black dark:text-white leading-relaxed">
                      {questionToShowEn || 'Untitled Question'}
                    </h4>
                    {questionToShowHi && questionToShowHi !== questionToShowEn && (
                      <p className="text-sm font-semibold text-black/60 dark:text-white/60 mt-2 leading-relaxed">
                        {questionToShowHi}
                      </p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div className="p-4 rounded-2xl bg-black/5 dark:bg-black/40 border border-black/5 dark:border-white/5 relative">
                      <span className="text-[8px] font-black uppercase text-black/30 dark:text-white/30 block mb-1">Player's Attempted Answer ({languageOfQuiz.toUpperCase()})</span>
                      <p className={`font-black text-xs ${h.isCorrect ? 'text-emerald-500' : 'text-red-500'}`}>
                        {userSelectedOpt}
                      </p>
                    </div>
                    
                    <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/15 relative">
                      <span className="text-[8px] font-black uppercase text-emerald-500/40 block mb-1">Correct Answer ({languageOfQuiz.toUpperCase()})</span>
                      <p className="font-black text-xs text-emerald-500">
                        {correctOpt}
                      </p>
                    </div>
                  </div>
                  
                  {quiz.explanation?.[languageOfQuiz] && (
                    <div className="p-4 rounded-2xl bg-black/5 dark:bg-black/20 border border-black/5 dark:border-white/5">
                      <span className="text-[8px] font-black uppercase text-black/40 dark:text-white/40 block mb-1">Explanation</span>
                      <p className="text-xs text-black/70 dark:text-white/70 leading-relaxed font-sans font-medium">
                        {quiz.explanation[languageOfQuiz]}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
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
                       setEditId(u.username || '');
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
                           onChange={(e) => setEditName(e.target.value)}
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
                         <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-primary/10 border border-primary/20 p-4 rounded-3xl mt-2 text-black dark:text-white">
                            <div className="text-center sm:text-left">
                               <p className="text-primary font-bold uppercase tracking-widest text-[11px]">Username: @{u.username || 'none'}</p>
                               <p className="text-black/40 dark:text-white/40 font-bold uppercase tracking-widest text-[9px] mt-0.5">UID (Player ID): {u.id}</p>
                            </div>
                            <button 
                              onClick={() => setFullscreenDashboardUser(u)}
                              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-black rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-primary/20 shrink-0"
                            >
                              <Tv size={14} />
                              Open Live Dashboard
                            </button>
                         </div>

                         {/* Registered Feedback Email History Section */}
                         <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl space-y-2.5 border border-black/5 dark:border-white/5 mt-2 text-black dark:text-white">
                            <span className="text-[9px] font-black uppercase text-black/40 dark:text-white/40 ml-1 tracking-widest block font-sans">Registered Emails (Feedback History)</span>
                            <div className="space-y-1.5 font-mono">
                               {!u.feedbackEmails || (Array.isArray(u.feedbackEmails) && u.feedbackEmails.length === 0) ? (
                                  <div className="flex items-center gap-2 bg-neutral-100 dark:bg-black/40 rounded-xl px-4 py-2 border border-black/5 dark:border-white/5">
                                     <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                                     <span className="text-[11px] font-medium text-black/60 dark:text-white/60 truncate">{u.email || 'No email registered'}</span>
                                  </div>
                               ) : (
                                  (Array.isArray(u.feedbackEmails) ? u.feedbackEmails : Object.values(u.feedbackEmails)).map((em: any, index: number, arr: any[]) => (
                                     <div key={index} className="flex items-center gap-2 bg-neutral-100 dark:bg-black/40 rounded-xl px-4 py-2 border border-black/5 dark:border-white/5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        <span className="text-[11px] font-bold text-black/80 dark:text-white/80 truncate">{em}</span>
                                        {index === (arr.length - 1) && (
                                           <span className="ml-auto text-[8px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-black tracking-widest uppercase">Active</span>
                                        )}
                                     </div>
                                  ))
                               )}
                            </div>
                         </div>

                         <div className="hidden">
                            <p className="text-primary font-bold uppercase tracking-widest text-[11px]">Username: @{u.username || 'none'}</p>
                            <p className="text-black/40 dark:text-white/40 font-bold uppercase tracking-widest text-[9px]">UID (Player ID): {u.id}</p>
                          </div>

                          <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl space-y-3">
                             <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Edit Username</label>
                             <div className="flex gap-2">
                                <div className="relative flex-1">
                                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary font-black text-xs">@</span>
                                   <input 
                                     value={adminPlayerUsernameInput}
                                     onChange={(e) => setAdminPlayerUsernameInput(e.target.value)}
                                     placeholder="Enter new username..."
                                     className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl pl-7 pr-4 py-3 text-xs font-bold text-black dark:text-white outline-none focus:border-primary"
                                   />
                                </div>
                                <button 
                                  onClick={async () => {
                                    if (!adminPlayerUsernameInput) return;
                                    await renameUser(u, u.name || '', adminPlayerUsernameInput);
                                  }}
                                  className="bg-primary text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all"
                                >
                                   Save
                                </button>
                             </div>
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

                         {/* OneLink Device Linkage */}
                         <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/10 dark:border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                               <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">OneLink Device Linkage</label>
                               <span className="text-[8px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-widest text-center">Active</span>
                            </div>
                            <p className="text-[9px] text-black/40 dark:text-white/40 leading-relaxed px-2">
                               Link player's device with 15-character UID (supports letters, symbols, and numbers). The game can auto-access 
                               <span className="font-mono bg-white/10 px-1 py-0.5 rounded text-primary ml-1">UserDevices/{deviceUidInput || "15-char-uid"}</span>
                            </p>
                            <div className="flex gap-2">
                               <input 
                                 value={deviceUidInput}
                                 onChange={e => setDeviceUidInput(e.target.value.slice(0, 15))}
                                 placeholder="e.g. Alphanumeric/Symbol UID"
                                 className="flex-1 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-mono font-bold text-black dark:text-white outline-none focus:border-primary"
                               />
                               <button 
                                 onClick={async () => {
                                   if (deviceUidInput && deviceUidInput.length !== 15) {
                                     await alert({ title: 'Invalid Link', description: 'Device UID must be exactly 15 characters long (letters, symbols, or numbers allowed).', type: 'error' });
                                     return;
                                   }
                                   await update(ref(db, `users/${u.id}`), { deviceUid: deviceUidInput || null });
                                   await alert({ title: 'Linked', description: 'Device UID updated successfully.', type: 'success' });
                                 }}
                                 className="bg-primary text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all"
                               >
                                  Save
                               </button>
                            </div>

                            <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-2">
                               <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-1 block">Ambient Mode Override (lx)</label>
                               <div className="flex gap-2">
                                  <input 
                                    type="number"
                                    value={userLuxThresholdInput}
                                    onChange={e => setUserLuxThresholdInput(e.target.value)}
                                    placeholder="e.g. 75 (Using global if empty)"
                                    className="flex-1 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-black dark:text-white outline-none focus:border-primary"
                                  />
                                  <button 
                                    onClick={async () => {
                                      const parsed = parseInt(userLuxThresholdInput);
                                      const val = isNaN(parsed) ? null : parsed;
                                      await update(ref(db, `users/${u.id}`), { ambientThreshold: val });
                                      await alert({ title: 'Saved', description: 'Player specific threshold override saved.', type: 'success' });
                                    }}
                                    className="bg-primary text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:scale-105 active:scale-95 transition-all"
                                  >
                                     Save
                                  </button>
                                </div>
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
                    <button 
                      onClick={() => setHistoryFullscreenUser(u)}
                      className="flex items-center gap-1 bg-primary/10 hover:bg-primary border border-primary/20 text-primary hover:text-black font-black px-2.5 py-1.5 rounded-lg text-[9px] uppercase tracking-wider transition-all"
                    >
                      <Maximize2 size={12} /> Full Screen
                    </button>
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
                    {topics.map((t, tIdx) => <option key={`topic-opt1-${t.id || tIdx}-${tIdx}`} value={t.id}>{t.name}</option>)}
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
                                  const quizLang = h.language || 'en';
                                  const questionText = quizLang === 'hi' ? (quiz?.question?.hi || quiz?.question?.en || 'Deleted Quiz') : (quiz?.question?.en || quiz?.question?.hi || 'Deleted Quiz');
                                  const englishQuestionText = quiz?.question?.en;
                                  const hindiQuestionText = quiz?.question?.hi;

                                  const selectedOptionText = h.userAnswerIndex !== -1 && quiz?.options?.[quizLang]
                                    ? quiz.options[quizLang][h.userAnswerIndex] || 'Unknown Option'
                                    : 'Skipped';

                                  const correctOptionText = quiz?.correctAnswerIndex !== undefined && quiz?.options?.[quizLang]
                                    ? quiz.options[quizLang][quiz.correctAnswerIndex] || 'Unknown Option'
                                    : 'Unknown Option';

                                  return (
                                     <div key={`${historyKey}-${historyIndex}`} className="bg-white/5 dark:bg-black/30 p-5 rounded-[1.5rem] border border-black/5 dark:border-white/5 flex flex-col gap-3 hover:bg-black/10 dark:hover:bg-white/5 transition-all group">
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 border-b border-black/5 dark:border-white/5 pb-3">
                                           <div className="space-y-1.5 flex-1 min-w-0">
                                             <div className="flex flex-wrap items-center gap-2">
                                               <span className="text-[8px] font-black text-primary uppercase px-1.5 py-0.5 bg-primary/10 rounded">{quiz?.topicId || 'Unknown'}</span>
                                               
                                               <span className={cn(
                                                 "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border",
                                                 quizLang === 'hi' 
                                                   ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                                                   : "bg-cyan-500/10 text-cyan-500 border-cyan-500/20"
                                               )}>
                                                 {quizLang === 'hi' ? 'Hindi (हिंदी)' : 'English (EN)'}
                                               </span>

                                               <span className={cn(
                                                 "text-[8px] font-black uppercase px-2 py-0.5 rounded-full border flex items-center gap-1",
                                                 h.theme === 'light'
                                                   ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                                                   : "bg-slate-700/30 text-slate-400 border-slate-700/30"
                                               )}>
                                                 {h.theme === 'light' ? '☀ Light Theme' : '🌙 Dark Theme'}
                                               </span>

                                               <span className="text-[8px] font-bold text-black/30 dark:text-white/20 uppercase tracking-widest">{new Date(h.timestamp).toLocaleString()}</span>
                                             </div>
                                             
                                             <p className="font-bold text-sm text-black/95 dark:text-white leading-relaxed break-words">
                                               {questionText}
                                             </p>
                                             
                                             {quizLang === 'hi' && englishQuestionText && (
                                               <p className="text-[10px] italic text-black/40 dark:text-white/40 leading-relaxed">
                                                 English: {englishQuestionText}
                                               </p>
                                             )}
                                             
                                             {quizLang === 'en' && hindiQuestionText && (
                                               <p className="text-[10px] italic text-black/40 dark:text-white/40 leading-relaxed">
                                                 हिंदी: {hindiQuestionText}
                                               </p>
                                             )}
                                           </div>
                                           
                                           <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                                               <button 
                                                 onClick={() => deleteHistoryItem(h.id)}
                                                 className="p-1.5 rounded-lg text-black/30 dark:text-white/10 hover:text-red-500 dark:hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                                 title="Delete Entry"
                                               >
                                                 <Trash2 size={14} />
                                               </button>
                                               <div className={cn(
                                                 "w-8 h-8 rounded-xl flex items-center justify-center border",
                                                 h.userAnswerIndex === -1 ? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" :
                                                 h.isCorrect ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                                               )}>
                                                  {h.userAnswerIndex === -1 ? <span className="text-[8px] font-black">SKIP</span> :
                                                   h.isCorrect ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                               </div>
                                            </div>
                                        </div>
                                        
                                        <div className="p-3 bg-black/5 dark:bg-black/45 rounded-xl border border-black/5 dark:border-white/5 space-y-1 text-[10px]">
                                           <div className="flex items-start gap-1">
                                              <span className="font-black text-black/40 dark:text-white/30 uppercase w-20 shrink-0">Chose:</span>
                                              <span className={cn(
                                                "font-bold",
                                                h.userAnswerIndex === -1 ? "text-zinc-400 italic font-medium" :
                                                h.isCorrect ? "text-green-600 dark:text-green-400" : "text-red-550 dark:text-red-400"
                                              )}>
                                                 {selectedOptionText}
                                              </span>
                                           </div>
                                           
                                           {!h.isCorrect && h.userAnswerIndex !== -1 && (
                                              <div className="flex items-start gap-1 pt-1 border-t border-black/5 dark:border-white/5 mt-1">
                                                 <span className="font-black text-black/40 dark:text-white/30 uppercase w-20 shrink-0">Correct Answer:</span>
                                                 <span className="font-bold text-green-600 dark:text-green-400">
                                                    {correctOptionText}
                                                 </span>
                                              </div>
                                           )}
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

                     <div className="p-4 bg-white/5 dark:bg-black/20 rounded-2xl border border-black/10 dark:border-white/5 space-y-3">
                        <p className="text-[10px] font-black uppercase text-primary tracking-widest pl-1">Approval Notification Options</p>
                        <div className="flex flex-col gap-2">
                           <label className="flex items-center gap-2 text-xs font-bold text-black/70 dark:text-white/70 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={customTemplates.approval?.enabled !== false}
                                onChange={async e => {
                                  const updated = {
                                    ...customTemplates,
                                    approval: {
                                      ...(customTemplates.approval || { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true }),
                                      enabled: e.target.checked
                                    }
                                  };
                                  await updateCustomTemplatesDirectly(updated);
                                }}
                                className="rounded border-black/10 dark:border-white/10 text-primary focus:ring-primary"
                              />
                              Enable Approval Notification
                           </label>
                           <label className="flex items-center gap-2 text-xs font-bold text-black/70 dark:text-white/70 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={customTemplates.approval?.includeName !== false}
                                onChange={async e => {
                                  const updated = {
                                    ...customTemplates,
                                    approval: {
                                      ...(customTemplates.approval || { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true }),
                                      includeName: e.target.checked
                                    }
                                  };
                                  await updateCustomTemplatesDirectly(updated);
                                }}
                                className="rounded border-black/10 dark:border-white/10 text-primary focus:ring-primary"
                              />
                              Include Player Name ({u.name})
                           </label>
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
                        <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-3 ml-1">Topic Lock & AppCode Settings</p>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between p-4 bg-white dark:bg-black rounded-2xl border border-black/5 dark:border-white/5">
                             <span className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">Allow Topic Switch</span>
                             <button 
                                onClick={async () => {
                                    const nextVal = !u.canSwitchTopic;
                                    await update(ref(db, `users/${u.id}`), { canSwitchTopic: nextVal });
                                    setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, canSwitchTopic: nextVal } : usr));
                                 }}
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
                          <div className="flex items-center justify-between p-4 bg-white dark:bg-black rounded-2xl border border-black/5 dark:border-white/5">
                             <span className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">Allow Theme Section</span>
                             <button 
                                onClick={async () => {
                                    const nextVal = !u.themesDisabled;
                                    await update(ref(db, `users/${u.id}`), { themesDisabled: nextVal });
                                    setUsers(prev => prev.map(usr => usr.id === u.id ? { ...usr, themesDisabled: nextVal } : usr));
                                 }}
                                className={cn(
                                   "w-12 h-6 rounded-full transition-colors relative",
                                   !u.themesDisabled ? "bg-green-500" : "bg-black/20 dark:bg-white/10"
                                )}
                             >
                                <div className={cn(
                                   "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                                   !u.themesDisabled ? "left-7" : "left-1"
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
                                {topics.map((t, tIdx) => <option key={`topic-opt2-${t.id || tIdx}-${tIdx}`} value={t.id}>{t.name}</option>)}
                             </select>
                          </div>
                          <div className="flex flex-col gap-1.5 p-4 bg-white dark:bg-black rounded-2xl border border-black/5 dark:border-white/5">
                             <div className="flex items-center justify-between">
                               <span className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">User AppCode</span>
                               <span className="text-[9px] font-mono font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">AppCode</span>
                             </div>
                             <div className="flex gap-2 mt-1">
                               <input 
                                  type="text"
                                  placeholder="e.g. 786"
                                  defaultValue={u.AppCode !== undefined ? String(u.AppCode) : ''}
                                  key={`appcode-${u.id}`}
                                  onBlur={async (e) => {
                                     const val = e.target.value.trim();
                                     await update(ref(db, `users/${u.id}`), { AppCode: val === '' ? null : val });
                                  }}
                                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg p-3 text-xs font-bold font-mono outline-none text-black dark:text-white focus:border-primary"
                               />
                               {globalUpdateCode && (
                                  <button
                                    onClick={async () => {
                                      await update(ref(db, `users/${u.id}`), { AppCode: globalUpdateCode });
                                    }}
                                    className="p-2 px-3 bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                                    title={`Link this user AppCode to current required code: ${globalUpdateCode}`}
                                  >
                                    Link {globalUpdateCode}
                                  </button>
                               )}
                             </div>
                          </div>

                          <div className="flex flex-col gap-1.5 p-4 bg-white dark:bg-black rounded-2xl border border-black/5 dark:border-white/5">
                             <div className="flex items-center justify-between">
                               <span className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">Custom AppCode DB Check Path Override</span>
                               <span className="text-[9px] font-mono font-bold text-blue-500 px-1.5 py-0.5 rounded bg-blue-500/10">Override</span>
                             </div>
                             <div className="flex flex-col gap-2 mt-1">
                               <input 
                                  type="text"
                                  placeholder="e.g. UserDevices/{userId}/appCode"
                                  defaultValue={u.CustomAppCodePath !== undefined ? String(u.CustomAppCodePath) : ''}
                                  key={`custom-path-${u.id}`}
                                  onBlur={async (e) => {
                                     const val = e.target.value.trim();
                                     await update(ref(db, `users/${u.id}`), { CustomAppCodePath: val === '' ? null : val });
                                  }}
                                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg p-3 text-xs font-bold font-mono outline-none text-[#000] dark:text-[#fff] focus:border-blue-500"
                               />
                               <span className="text-[9px] text-black/40 dark:text-white/40 leading-normal text-left">
                                 Define a custom verification path Specifically for this user. Uses <code className="text-primary font-mono">{`{userId}`}</code>. Overrides the global pattern.
                               </span>
                             </div>
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
                              key={`xp-${u.id}`}
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
                              key={`rank-${u.id}`}
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
                              key={`lives-${u.id}`}
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
                              key={`round-${u.id}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val > 0 && val !== (u.currentRound ?? 1)) {
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
                              key={`index-${u.id}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val >= 0 && val !== (u.currentQuizIndex ?? 0)) {
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
                               key={`attempted-${u.id}`}
                               onBlur={async (e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val !== (u.stats?.totalAttempted ?? 0)) {
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
                               key={`correct-${u.id}`}
                               onBlur={async (e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val !== (u.stats?.correctAnswers ?? 0)) {
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
                               key={`incorrect-${u.id}`}
                               onBlur={async (e) => {
                                  const val = parseInt(e.target.value);
                                  if (!isNaN(val) && val !== (u.stats?.incorrectAnswers ?? 0)) {
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
                              key={`coins-${u.id}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== (u.raheeCoins ?? 0)) {
                                    await update(ref(db, `users/${u.id}`), { raheeCoins: val });
                                 }
                              }}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-primary font-black text-2xl outline-none focus:border-primary/50 transition-all font-mono"
                           />
                        </div>
                        <div className="space-y-2">
                           <p className="text-[10px] font-bold text-black/20 dark:text-white/20 uppercase mb-1 ml-1">Quiz Coins</p>
                           <input 
                              type="number"
                              defaultValue={u.quizCoins ?? 0}
                              key={`quizcoins-${u.id}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== (u.quizCoins ?? 0)) {
                                    await update(ref(db, `users/${u.id}`), { quizCoins: val });
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
                              key={`5050-${u.id}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== (u.lifelines?.fiftyFifty ?? 0)) {
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
                              key={`change-${u.id}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== (u.lifelines?.changeQuiz ?? 0)) {
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
                              key={`poll-${u.id}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== (u.lifelines?.audiencePoll ?? 0)) {
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
                              key={`hint-${u.id}`}
                              onBlur={async (e) => {
                                 const val = parseInt(e.target.value);
                                 if (!isNaN(val) && val !== (u.lifelines?.hint ?? 0)) {
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
                        {users.filter(u => !u.isBot).map((u, uIdx) => <option key={`user-opt-${u.id || uIdx}-${uIdx}`} value={u.id}>{u.name} (@{u.username})</option>)}
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
                        {topics.map((t, tIdx) => <option key={`topic-opt3-${t.id || tIdx}-${tIdx}`} value={t.id}>{t.name}</option>)}
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

            {/* Android Challenge Actions Tester */}
            <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2.5rem] border border-black/5 dark:border-white/5">
              <h3 className="text-lg font-black mb-1 flex items-center gap-2 uppercase tracking-tighter">
                <Bell size={20} className="text-primary" />
                Android Action Buttons Test
              </h3>
              <p className="text-[10px] uppercase font-black text-black/40 dark:text-white/40 tracking-widest mb-6">
                Test Accept/Reject buttons for package <strong>RaheeQuiz.in</strong>
              </p>
              
              <div className="bg-black/20 p-4 rounded-2xl border border-black/10 dark:border-white/5 space-y-3 mb-6">
                <p className="text-xs font-bold text-black/60 dark:text-white/60">
                  How to test:
                </p>
                <ol className="list-decimal list-inside text-[11px] text-black/50 dark:text-white/40 space-y-1">
                  <li>Paste your device's individual Firebase Cloud Messaging (<strong className="text-primary">FCM Token</strong>) into the input box below.</li>
                  <li>Ensure the Android application is running or in the background on your device.</li>
                  <li>Click one of the test actions below to send a secure push notification directly to your device!</li>
                </ol>
              </div>

              <div className="space-y-1 mb-6">
                <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Target FCM Token For Test (Isolated Safe Delivery)</label>
                <div className="relative">
                  <Zap className="absolute left-4 top-1/2 -translate-y-1/2 text-primary animate-pulse" size={18} />
                  <input 
                    value={testFcmToken}
                    onChange={e => setTestFcmToken(e.target.value)}
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 pl-12 rounded-2xl font-bold outline-none focus:border-primary text-xs"
                    placeholder="Enter or paste individual FCM token to receive test push..."
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('challenge')}
                  className="w-full bg-primary/20 hover:bg-primary/30 border border-primary/20 text-primary font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <Send size={14} />
                  1. Send Challenge Notification (Try Accept / Reject)
                </button>
                
                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('reply_accepted')}
                  className="w-full bg-green-500/10 hover:bg-green-500/20 border border-green-500/15 text-green-400 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <CheckCircle size={14} />
                  2. Send "Accept" Reply Notification
                </button>

                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('reply_rejected')}
                  className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/15 text-red-400 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <XCircle size={14} />
                  3. Send "Reject" Reply Notification
                </button>

                <div className="border-t border-black/10 dark:border-white/10 my-4 pt-4">
                  <h4 className="text-xs font-black uppercase tracking-wider mb-2 text-primary flex items-center gap-2">
                    <Clock size={12} />
                    Exam / Event Countdown Config
                  </h4>
                  <div className="flex items-center gap-3">
                    <input 
                      type="number"
                      value={countdownDuration}
                      min="5"
                      onChange={e => setCountdownDuration(Math.max(5, parseInt(e.target.value) || 30))}
                      className="w-24 bg-white/5 dark:bg-black border border-black/15 dark:border-white/10 p-3 rounded-xl text-center font-bold text-xs outline-none focus:border-primary"
                    />
                    <span className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase tracking-wider">
                      Timer Countdown (seconds)
                    </span>
                  </div>
                </div>

                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('countdown')}
                  className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/15 text-amber-400 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <Clock size={14} />
                  4. Send Countdown Timer Notification ({countdownDuration}s)
                </button>

                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('textbox_reply')}
                  className="w-full bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/15 text-teal-400 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <MessageSquare size={14} />
                  5. Send Interactive Textbox Input Notification
                </button>

                 <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('raw')}
                  className="w-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/15 text-blue-400 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <Send size={14} />
                  6. Send Raw Notification (No buttons - reads panel Title & Body above)
                </button>

                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('friend_request')}
                  className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/15 text-indigo-400 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <Users size={14} />
                  7. Send Friend Request (Try Accept/Reject Buttons)
                </button>

                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('friend_accept')}
                  className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/15 text-emerald-400 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <CheckCircle size={14} />
                  8. Send "Accepted Friend" Notification
                </button>

                <button 
                  disabled={isSendingNotif}
                  onClick={() => sendTestNotificationType('friend_reject')}
                  className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/15 text-rose-400 font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <XCircle size={14} />
                  9. Send "Declined Friend" Notification
                </button>

                <button 
                  disabled={isSendingNotif || examTestTimer !== null}
                  onClick={sendTestExamWorkflow}
                  className="w-full bg-[#fcd34d]/10 hover:bg-[#fcd34d]/20 border border-[#fcd34d]/15 text-[#f59e0b] font-black uppercase tracking-widest py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <Calendar size={14} />
                  {examTestTimer !== null ? `Exam Starts in ${examTestTimer}s (Do not close)...` : '10. Trigger Scheduled 1-Min Exam Notification (Two-Stage)'}
                </button>

                {/* Real-time Notification Replies Monitor */}
                <div className="mt-6 border-t border-black/10 dark:border-white/10 pt-4 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-2">
                    <MessageSquare size={14} />
                    Live Notification Replies Monitor
                  </h4>
                  <p className="text-[10px] text-black/40 dark:text-white/30 uppercase font-black tracking-wider leading-relaxed">
                    Replies typed inside the notification textbox from Android devices are received here in real-time.
                  </p>
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2 scrollbar-none">
                    {notificationReplies.length === 0 ? (
                      <div className="text-center py-5 bg-black/10 dark:bg-black/40 rounded-xl border border-black/5 dark:border-white/5">
                        <p className="text-[9px] text-black/30 dark:text-white/20 italic font-black uppercase tracking-widest">No replies received yet</p>
                      </div>
                    ) : (
                      notificationReplies.map((rep, repIdx) => (
                        <div key={`reply-${rep.id || repIdx}`} className="bg-white/5 dark:bg-black/30 p-3.5 rounded-2xl border border-black/5 dark:border-white/5 flex flex-col gap-1.5 shadow-sm">
                          <div className="flex justify-between items-center text-[8px] font-mono text-black/40 dark:text-white/40 uppercase">
                            <span className="text-primary font-bold">Reply ID: {rep.id.slice(-6)}</span>
                            <span>{new Date(rep.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className="text-xs font-bold text-black dark:text-white leading-relaxed">{rep.message}</p>
                        </div>
                      ))
                    )}
                  </div>
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
                  .filter(u => !u.isBot && (
                    ((u.name || '').toLowerCase().includes((searchTokenUser || '').toLowerCase())) || 
                    ((u.id || '').toLowerCase().includes((searchTokenUser || '').toLowerCase()))
                  ))
                  .map((u, uIdx) => (
                  <div key={`fcm-link-${u.id || uIdx}-${uIdx}`} className="bg-black/20 p-4 rounded-xl border border-white/5 flex items-center justify-between group">
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
                  notifSchedules.map((s, sIdx) => (
                    <div key={`notif-sched-${s.id || sIdx}-${sIdx}`} className="bg-black/40 p-4 rounded-xl border border-white/5 space-y-2 relative group">
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

                <div className="bg-white/5 border border-white/5 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between col-span-2">
                     <p className="text-[10px] font-black uppercase text-primary tracking-widest px-1">Account Approval Notification</p>
                     <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 cursor-pointer">
                           <input 
                             type="checkbox"
                             checked={customTemplates.approval?.enabled !== false}
                             onChange={e => {
                               const updated = {...customTemplates, approval: { ...(customTemplates.approval || { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true }), enabled: e.target.checked }};
                               updateCustomTemplatesDirectly(updated);
                             }}
                             className="rounded border-white/10 text-primary"
                           />
                           Enabled
                        </label>
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-white/40 cursor-pointer">
                           <input 
                             type="checkbox"
                             checked={customTemplates.approval?.includeName !== false}
                             onChange={e => {
                               const updated = {...customTemplates, approval: { ...(customTemplates.approval || { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true }), includeName: e.target.checked }};
                               updateCustomTemplatesDirectly(updated);
                             }}
                             className="rounded border-white/10 text-primary"
                           />
                           Include Name
                        </label>
                     </div>
                  </div>
                  <input 
                    value={customTemplates.approval?.title || 'Account Approved!'}
                    onChange={e => setCustomTemplates({...customTemplates, approval: { ...(customTemplates.approval || { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true }), title: e.target.value }})}
                    onBlur={updateTemplates}
                    className="w-full bg-black/40 border border-white/5 p-3 rounded-xl text-xs outline-none shadow-inner placeholder:opacity-20 font-bold"
                    placeholder="Title"
                  />
                  <textarea 
                    value={customTemplates.approval?.body || 'Your account has been approved by the admin. Welcome to Rahee Quiz!'}
                    onChange={e => setCustomTemplates({...customTemplates, approval: { ...(customTemplates.approval || { title: 'Account Approved!', body: 'Your account has been approved by the admin. Welcome to Rahee Quiz!', enabled: true, includeName: true }), body: e.target.value }})}
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
                {[...activeChat.messages].map((msg, idx) => (
                  <div key={`chat-msg-${msg.id || idx}-${idx}`} className="space-y-4">
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


  const renderDashboard = () => {
    // KPI Math
    const totalLogs = activityLogs.length;
    const sentChallenges = activityLogs.filter(l => l.action === 'send_challenge').length;
    const acceptedChallenges = activityLogs.filter(l => l.action === 'accept_challenge').length;
    const rejectedChallenges = activityLogs.filter(l => l.action === 'reject_challenge').length;
    const cancelledChallenges = activityLogs.filter(l => l.action === 'cancel_challenge' || l.action === 'cancel_match').length;
    const textboxReplies = activityLogs.filter(l => l.action === 'textbox_reply').length;
    
    const acceptanceRate = sentChallenges > 0 
      ? Math.round((acceptedChallenges / sentChallenges) * 100) 
      : 0;

    // Filter Logs
    const filteredLogs = activityLogs.filter(log => {
      const matchSearch = (log.userName || '').toLowerCase().includes(logsSearchFilter.toLowerCase()) || 
                          (log.userId || '').toLowerCase().includes(logsSearchFilter.toLowerCase()) ||
                          (log.details || '').toLowerCase().includes(logsSearchFilter.toLowerCase());
      
      const matchType = logsTypeFilter === 'all' || log.action === logsTypeFilter;
      return matchSearch && matchType;
    });

    const getActionBadgeClass = (action: string) => {
      switch (action) {
        case 'send_challenge':
          return 'bg-blue-500/10 text-blue-500 border border-blue-500/20';
        case 'accept_challenge':
          return 'bg-green-500/10 text-green-500 border border-green-500/20';
        case 'reject_challenge':
          return 'bg-red-500/10 text-red-500 border border-red-500/20';
        case 'cancel_challenge':
        case 'cancel_match':
          return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
        case 'textbox_reply':
          return 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20';
        case 'play_now':
          return 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';
        case 'claim_daily_rewards':
          return 'bg-purple-500/10 text-purple-500 border border-purple-500/20';
        case 'watch_ad_reward':
          return 'bg-orange-500/10 text-orange-500 border border-orange-500/20';
        default:
          return 'bg-gray-500/10 text-gray-500 border border-gray-500/20';
      }
    };

    const getActionLabel = (action: string) => {
      switch (action) {
        case 'send_challenge': return 'Challenge Sent';
        case 'accept_challenge': return 'Challenge Accepted';
        case 'reject_challenge': return 'Challenge Rejected';
        case 'cancel_challenge': return 'Challenge Cancelled';
        case 'cancel_match': return 'Match Cancelled';
        case 'textbox_reply': return 'Text Input Reply';
        case 'play_now': return 'Play Now Click';
        case 'claim_daily_rewards': return 'Daily Calendar Reward';
        case 'watch_ad_reward': return 'Ad Reward Claimed';
        default: return action;
      }
    };

    return (
      <div className="space-y-8 pb-32">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-black dark:text-white">Activity Dashboard</h2>
          <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Real-time Tracking of Player Engagements & Interactions</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white dark:bg-[#0c0c0c] border border-black/5 dark:border-white/5 p-6 rounded-[2rem] shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#a855f7]">Interactions</p>
              <h3 className="text-3xl font-black tracking-tight mt-1 text-black dark:text-white">{totalLogs}</h3>
            </div>
            <p className="text-[9px] text-black/40 dark:text-white/40 mt-4 font-bold uppercase tracking-wider">Total activities logged in real-time</p>
          </div>

          <div className="bg-white dark:bg-[#0c0c0c] border border-black/5 dark:border-white/5 p-6 rounded-[2rem] shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#3b82f6]">Challenges</p>
              <h3 className="text-3xl font-black tracking-tight mt-1 text-black dark:text-white">{sentChallenges}</h3>
            </div>
            <p className="text-[9px] text-black/40 dark:text-white/40 mt-4 font-bold uppercase tracking-wider">Dual player invitations triggered</p>
          </div>

          <div className="bg-white dark:bg-[#0c0c0c] border border-black/5 dark:border-white/5 p-6 rounded-[2rem] shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#22c55e]">Acceptance Rate</p>
              <h3 className="text-3xl font-black tracking-tight mt-1 text-black dark:text-white">{acceptanceRate}%</h3>
            </div>
            <p className="text-[9px] text-black/40 dark:text-white/40 mt-4 font-bold uppercase tracking-wider">{acceptedChallenges} accepted, {rejectedChallenges} rejected</p>
          </div>

          <div className="bg-white dark:bg-[#0c0c0c] border border-black/5 dark:border-white/5 p-6 rounded-[2rem] shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-[#f59e0b]">Input Responses</p>
              <h3 className="text-3xl font-black tracking-tight mt-1 text-black dark:text-white">{textboxReplies}</h3>
            </div>
            <p className="text-[9px] text-black/40 dark:text-white/40 mt-4 font-bold uppercase tracking-wider">Interactive notification textbox replies</p>
          </div>
        </div>

        {/* Realtime dynamic customizable Firebase RTDB visual circular progress nodes grid */}
        {renderRtdbVisualNodeGrid()}

        {/* Filter and Control Bar */}
        <div className="bg-white dark:bg-[#0c0c0c] border border-black/5 dark:border-white/5 p-6 rounded-[2.5rem] flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30 dark:text-white/30" size={14} />
            <input 
              type="text"
              placeholder="Search user, ID or details..."
              value={logsSearchFilter}
              onChange={(e) => setLogsSearchFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl text-xs font-bold text-black dark:text-white placeholder-black/30 dark:placeholder-white/30 outline-none focus:border-purple-500/50 transition-all font-bold"
            />
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <select
              value={logsTypeFilter}
              onChange={(e) => setLogsTypeFilter(e.target.value)}
              className="w-full sm:w-48 px-4 py-3 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 rounded-2xl text-xs font-black uppercase tracking-widest text-black/60 dark:text-white/60 outline-none focus:border-purple-500/50 transition-all cursor-pointer font-bold"
            >
              <option value="all">📊 All Activities</option>
              <option value="send_challenge">🔵 Challenges Sent</option>
              <option value="accept_challenge">🟢 Challenges Accepted</option>
              <option value="reject_challenge">🔴 Challenges Rejected</option>
              <option value="cancel_challenge">🟡 Challenges Cancelled</option>
              <option value="cancel_match">🟠 Matches Cancelled</option>
              <option value="textbox_reply">🟣 Text Replies</option>
              <option value="play_now">🟢 Play Now clicks</option>
              <option value="claim_daily_rewards">🌸 Daily Rewards</option>
              <option value="watch_ad_reward">📺 Promo Rewards</option>
            </select>

            {totalLogs > 0 && (
              <button
                onClick={async () => {
                  const verified = await confirm({
                    title: "Clear Activity Logs",
                    description: "Are you sure you want to permanently clear all real-time logged student/player interactions from the database? This cannot be undone.",
                    type: "confirm"
                  });
                  if (verified) {
                    await remove(ref(db, 'adminConfig/activityLogs'));
                    await alert({ title: "Cleared!", description: "All database activity interaction logs deleted successfully.", type: "success" });
                  }
                }}
                className="px-5 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all font-bold"
              >
                Clear logs
              </button>
            )}
          </div>
        </div>

        {/* Activity Stream Feed */}
        <div className="bg-white dark:bg-[#0c0c0c] border border-black/5 dark:border-white/5 rounded-[2.5rem] overflow-hidden">
          <div className="p-6 border-b border-black/5 dark:border-white/5 flex items-center justify-between">
            <h4 className="font-black uppercase tracking-wider text-xs text-black dark:text-white flex items-center gap-2">
              <Clock size={16} className="text-primary animate-pulse" />
              Live activity feed ({filteredLogs.length} items)
            </h4>
            <span className="text-[9px] font-black bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/20 px-3 py-1 rounded-full uppercase tracking-wider font-bold">
              Real-time synchronization
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01]">
                  <th className="p-5 text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Timestamp</th>
                  <th className="p-5 text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Player Name</th>
                  <th className="p-5 text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Action</th>
                  <th className="p-5 text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Message Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors">
                    {/* Timestamp */}
                    <td className="p-5 align-middle">
                      <div className="font-mono text-[10px] font-bold text-black/50 dark:text-white/50">
                        {new Date(log.timestamp).toLocaleDateString()}
                      </div>
                      <div className="font-mono text-[9px] font-bold text-black/30 dark:text-white/30">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </td>

                    {/* Username */}
                    <td className="p-5 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center font-black uppercase text-[10px] border border-purple-500/5">
                          {(log.userName || 'P')[0]}
                        </div>
                        <div>
                          <div className="font-black text-xs text-black dark:text-white uppercase tracking-tight">
                            {log.userName || 'Anonymous Player'}
                          </div>
                          <div className="font-mono text-[8px] font-bold text-black/20 dark:text-white/20 uppercase">
                            ID: {log.userId}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Action pill */}
                    <td className="p-5 align-middle">
                      <span className={cn("px-3 py-1.5 rounded-full text-[8.5px] font-black uppercase tracking-wider", getActionBadgeClass(log.action))}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>

                    {/* Detailed interactions details */}
                    <td className="p-5 align-middle text-xs font-bold text-black/80 dark:text-white/80 leading-relaxed max-w-sm">
                      {log.details || 'No extended status description provided.'}
                    </td>
                  </tr>
                ))}

                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-black/30 dark:text-white/30 bg-black/[0.01] dark:bg-white/[0.01]">
                      <MessageSquare size={48} className="mx-auto mb-4 opacity-30" />
                      <p className="font-black uppercase tracking-widest">No activities matching your query</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };


  const renderDatabaseExplorer = () => {
    const isObject = (val: any) => typeof val === 'object' && val !== null && !Array.isArray(val);
    const isArray = (val: any) => Array.isArray(val);

    const analyzeNodePayload = (data: any): { 
      totalBytes: number; 
      totalKeys: number; 
      maxDepth: number; 
      childStats: { key: string; bytes: number; keysCount: number; maxDepth: number; hazardLevel: 'SAFE' | 'WARNING' | 'ALERT' }[]; 
    } => {
      if (data === null || data === undefined) {
        return { totalBytes: 0, totalKeys: 0, maxDepth: 0, childStats: [] };
      }

      const serializeBytes = (val: any): number => {
        try {
          return new Blob([JSON.stringify(val)]).size;
        } catch (e) {
          return typeof val === 'string' ? val.length : 8;
        }
      };

      const calculateStats = (val: any, currentDepth = 1): { bytes: number; keysCount: number; maxDepth: number } => {
        if (val === null || val === undefined) return { bytes: 0, keysCount: 0, maxDepth: currentDepth };
        if (typeof val !== 'object') {
          return { bytes: serializeBytes(val), keysCount: 1, maxDepth: currentDepth };
        }
        
        let bytes = 2; // For braces {}
        let keysCount = 0;
        let maxDepth = currentDepth;

        for (const [k, child] of Object.entries(val)) {
          keysCount++;
          bytes += k.length + 4; // Quotes & colon markup
          const childStats = calculateStats(child, currentDepth + 1);
          bytes += childStats.bytes;
          keysCount += childStats.keysCount;
          if (childStats.maxDepth > maxDepth) {
            maxDepth = childStats.maxDepth;
          }
        }
        return { bytes, keysCount, maxDepth };
      };

      const rootStats = calculateStats(data, 1);
      const childStatsList: { key: string; bytes: number; keysCount: number; maxDepth: number; hazardLevel: 'SAFE' | 'WARNING' | 'ALERT' }[] = [];

      if (typeof data === 'object' && data !== null) {
        for (const [key, val] of Object.entries(data)) {
          const stats = calculateStats(val, 1);
          
          let hazardLevel: 'SAFE' | 'WARNING' | 'ALERT' = 'SAFE';
          if (stats.bytes > 120000 || stats.keysCount > 800 || stats.maxDepth > 7) {
            hazardLevel = 'ALERT';
          } else if (stats.bytes > 40000 || stats.keysCount > 200 || stats.maxDepth > 4) {
            hazardLevel = 'WARNING';
          }

          childStatsList.push({
            key,
            bytes: stats.bytes,
            keysCount: stats.keysCount,
            maxDepth: stats.maxDepth,
            hazardLevel
          });
        }
      }

      // Sort heaviest first
      childStatsList.sort((a, b) => b.bytes - a.bytes);

      return {
        totalBytes: rootStats.bytes,
        totalKeys: rootStats.keysCount,
        maxDepth: rootStats.maxDepth,
        childStats: childStatsList
      };
    };

    // Recursive RTDB replica tree compiler
    const renderRtdbReplicaTree = (
      data: any, 
      currentPath: string[] = [], 
      nestingLevel = 0
    ): React.ReactNode => {
      if (data === null || data === undefined) return null;

      const pathKey = currentPath.join('/');
      
      // If it's a primitive value (leaf node)
      if (typeof data !== 'object') {
        const displayValue = () => {
          if (typeof data === 'string') {
            return <span className="text-green-500 break-words dark:text-green-400 font-mono">"{data}"</span>;
          }
          if (typeof data === 'number') {
            return <span className="text-amber-500 font-mono">{data}</span>;
          }
          if (typeof data === 'boolean') {
            return <span className="text-blue-500 dark:text-blue-400 font-black font-mono">{data ? 'true' : 'false'}</span>;
          }
          return <span className="text-zinc-500 font-mono">{String(data)}</span>;
        };

        const relativeKey = currentPath[currentPath.length - 1];

        return (
          <div 
            key={pathKey || relativeKey}
            className="group flex flex-wrap items-center py-1.5 px-3 hover:bg-primary/[0.04] dark:hover:bg-primary/[0.03] rounded-lg transition-colors font-mono text-xs gap-1 relative"
            style={{ paddingLeft: `${Math.max(16, nestingLevel * 18)}px` }}
          >
            {/* Connector node line */}
            {nestingLevel > 0 && (
              <div 
                className="absolute left-0 top-0 bottom-0 border-l border-black/10 dark:border-white/10 transition-colors pointer-events-none" 
                style={{ left: `${(nestingLevel - 1) * 18 + 12}px` }} 
              />
            )}

            <span className="text-rose-600 dark:text-rose-400 font-bold tracking-tight select-all">{relativeKey}</span>
            <span className="text-black/40 dark:text-white/40 select-none font-sans">: </span>
            {displayValue()}

            {/* Actions panel */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all ml-auto pl-4 shrink-0 bg-white dark:bg-[#121212] rounded-md py-0.5 px-1.5 shadow border border-black/5 dark:border-white/5">
              <button
                onClick={async () => {
                  const absoluteTarget = [...dbExplorerPath, ...currentPath].join('/');
                  const curVal = typeof data === 'string' ? data : JSON.stringify(data);
                  const newVal = prompt(`Update value for "${relativeKey}":`, curVal);
                  if (newVal === null) return;
                  let parsed: any = newVal;
                  try {
                    parsed = JSON.parse(newVal);
                  } catch (e) {}
                  await set(ref(db, absoluteTarget), parsed);
                }}
                className="p-1 text-primary hover:bg-primary/20 rounded-md transition-all scale-95 hover:scale-100"
                title="Edit value"
              >
                <Edit2 size={11} />
              </button>
              <button
                onClick={async () => {
                  const absoluteTarget = [...dbExplorerPath, ...currentPath].join('/');
                  const confirmed = await confirm({
                    title: `Delete Node?`,
                    description: `This will remove the value at key "${relativeKey}".`,
                    type: 'error'
                  });
                  if (confirmed) {
                    await remove(ref(db, absoluteTarget));
                  }
                }}
                className="p-1 text-red-500 hover:bg-red-500/20 rounded-md transition-all scale-95 hover:scale-100"
                title="Delete node"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        );
      }

      // If it is an Object or Array
      const isArr = Array.isArray(data);
      const keys = Object.keys(data);
      const isExpanded = rtdbExpandedPaths[pathKey] ?? (nestingLevel === 0);
      const relativeKey = currentPath[currentPath.length - 1] || 'root';

      return (
        <div key={pathKey || relativeKey} className="relative font-mono">
          {/* Connecting guides */}
          {nestingLevel > 0 && (
            <div 
              className="absolute left-0 top-0 bottom-0 border-l border-black/10 dark:border-white/10 transition-colors pointer-events-none" 
              style={{ left: `${(nestingLevel - 1) * 18 + 12}px` }} 
            />
          )}

          <div 
            className="group flex items-center py-1.5 px-3 hover:bg-primary/[0.04] dark:hover:bg-primary/[0.03] rounded-lg transition-colors text-xs gap-1 cursor-pointer select-none"
            style={{ paddingLeft: `${Math.max(16, nestingLevel * 18)}px` }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('.action-pills')) return;
              setRtdbExpandedPaths(prev => ({
                ...prev,
                [pathKey]: !isExpanded
              }));
            }}
          >
            {/* Collapse/Expand indicator arrow */}
            <span className="text-black/40 dark:text-white/40 font-bold w-4 h-4 flex items-center justify-center shrink-0">
              {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </span>

            <span className="text-purple-600 dark:text-purple-400 font-black tracking-tight">{relativeKey}</span>
            <span className="text-black/40 dark:text-white/40 select-none font-sans">: </span>
            <span className="text-black/30 dark:text-white/30 text-[9px] font-bold tracking-widest lowercase select-all font-sans">
              {isArr ? `array [${keys.length}]` : `object {${keys.length}}`}
            </span>

            {/* Action pill anchors */}
            <div className="action-pills flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all ml-auto pl-4 shrink-0 bg-white dark:bg-[#121212] rounded-md py-0.5 px-1.5 shadow border border-black/5 dark:border-white/5">
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const absoluteTarget = [...dbExplorerPath, ...currentPath].join('/');
                  const keyPrompt = prompt("Add child — Enter key name:");
                  if (!keyPrompt) return;
                  const valuePrompt = prompt("Add child — Enter value (JSON supported):");
                  if (valuePrompt === null) return;
                  let parsedVal: any = valuePrompt;
                  try {
                    parsedVal = JSON.parse(valuePrompt);
                  } catch (err) {}
                  await set(ref(db, `${absoluteTarget}/${keyPrompt}`), parsedVal);
                  setRtdbExpandedPaths(prev => ({ ...prev, [pathKey]: true })); // Expand newly written property
                }}
                className="p-1 text-primary hover:bg-primary/20 rounded-md transition-colors"
                title="Add new properties node"
              >
                <Plus size={11} />
              </button>
              {nestingLevel > 0 && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const absoluteTarget = [...dbExplorerPath, ...currentPath].join('/');
                    const confirmed = await confirm({
                      title: `Delete Node?`,
                      description: `This will instantly delete "${relativeKey}" and all its descendants!`,
                      type: 'error'
                    });
                    if (confirmed) {
                      await remove(ref(db, absoluteTarget));
                    }
                  }}
                  className="p-1 text-red-500 hover:bg-red-500/20 rounded-md transition-colors"
                  title="Force delete branch"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Child sub-items */}
          {isExpanded && (
            <div className="transition-all duration-150">
              {keys.map((key) => renderRtdbReplicaTree(
                data[key], 
                [...currentPath, key], 
                nestingLevel + 1
              ))}
            </div>
          )}
        </div>
      );
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          JSON.parse(content); // validation test
          setJsonImporterText(content);
        } catch (err) {
          alert({ title: 'Error Reading File', description: 'Selected file does not contain valid JSON content.', type: 'error' });
        }
      };
      reader.readAsText(file);
    };

    const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          JSON.parse(content); // validation test
          setJsonImporterText(content);
        } catch (err) {
          alert({ title: 'Error Reading File', description: 'Dropped file does not contain valid JSON content.', type: 'error' });
        }
      };
      reader.readAsText(file);
    };

    const handleJsonImport = async () => {
      if (!jsonImporterText.trim()) {
        await alert({ title: 'Validation Failed', description: 'Please paste JSON code or upload a JSON file first.', type: 'error' });
        return;
      }

      let parsedData: any;
      try {
        parsedData = JSON.parse(jsonImporterText);
      } catch (err: any) {
        await alert({ title: 'Invalid JSON Syntax', description: err.message || 'The provided text is not valid JSON.', type: 'error' });
        return;
      }

      // Check target path for invalid character patterns in RTDB
      const normalizedPath = jsonImporterPath.trim().replace(/^\/|\/$/g, '');
      const containsInvalidChars = /[\.\$\#\[\]]/.test(normalizedPath);
      if (containsInvalidChars) {
        await alert({ title: 'Invalid Path Name', description: 'Database paths cannot contain "." "$" "#" "[" or "]" characters.', type: 'error' });
        return;
      }

      const confirmed = await confirm({
        title: jsonImporterMode === 'set' ? '🚨 Overwrite Node?' : 'Confirm Import?',
        description: `Are you sure you want to ${
          jsonImporterMode === 'set' 
            ? 'OVERWRITE and REPLACE ALL contents' 
            : 'MERGE and update properties'
        } at node path "/${normalizedPath || 'ROOT'}"?`,
        type: jsonImporterMode === 'set' ? 'error' : 'confirm'
      });

      if (!confirmed) return;

      setIsImportingJson(true);
      try {
        const dbRef = ref(db, normalizedPath || '/');
        if (jsonImporterMode === 'set') {
          await set(dbRef, parsedData);
        } else {
          if (typeof parsedData !== 'object' || parsedData === null) {
            throw new Error('To use Merge (Update) mode, the root of your JSON must be a valid JSON object/dictionary (e.g. { ... }).');
          }
          await update(dbRef, parsedData);
        }
        await alert({
          title: 'Import Successful',
          description: `Successfully loaded and applied JSON data to "/${normalizedPath || 'ROOT'}" node in RTDB!`,
          type: 'success'
        });
        setJsonImporterText('');
      } catch (err: any) {
        console.error("JSON Import failed:", err);
        await alert({
          title: 'Database Write Error',
          description: err.message || 'Firebase RTDB rejected the write operation.',
          type: 'error'
        });
      } finally {
        setIsImportingJson(false);
      }
    };

    let isJsonValid = false;
    let jsonEvalError = '';
    if (jsonImporterText.trim()) {
      try {
        JSON.parse(jsonImporterText);
        isJsonValid = true;
      } catch (e: any) {
        jsonEvalError = e.message;
      }
    }
    
    return (
      <div className="space-y-6 pb-32">
        <div className="flex items-center justify-between px-2">
           <div>
              <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Database Explorer</h2>
              <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Live Realtime Database Management</p>
           </div>
           <div className="flex items-center gap-3">
              {/* Dual Layout Toggler */}
              <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-black/5 dark:border-white/5 text-[9px] font-black uppercase tracking-wider select-none shrink-0">
                 <button
                   onClick={() => setIsRtdbReplicaLayout(false)}
                   className={cn(
                     "px-3 py-1.5 rounded-lg transition-all flex items-center gap-1",
                     !isRtdbReplicaLayout 
                       ? "bg-primary text-black font-black" 
                       : "text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
                   )}
                 >
                   <Folder size={10} /> Standard
                 </button>
                 <button
                   onClick={() => setIsRtdbReplicaLayout(true)}
                   className={cn(
                     "px-3 py-1.5 rounded-lg transition-all flex items-center gap-1",
                     isRtdbReplicaLayout 
                       ? "bg-primary text-black font-black" 
                       : "text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
                   )}
                 >
                   <Database size={10} /> RTDB Replica
                 </button>
              </div>

              <button 
                onClick={() => setDbExplorerPath([])}
                className="bg-primary/10 text-primary p-2 rounded-xl border border-primary/20 hover:bg-primary hover:text-black transition-all"
                title="Reset Path to ROOT"
              >
                <RotateCcw size={16} />
              </button>
           </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Left Columns: Database tree explorer */}
          <div className="lg:col-span-2 space-y-6">
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
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        const jsonStr = JSON.stringify(dbExplorerData, null, 2);
                        const blob = new Blob([jsonStr], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        const pathName = dbExplorerPath.length === 0 ? 'root' : dbExplorerPath.join('_');
                        a.download = `database_${pathName}_${new Date().toISOString().split('T')[0]}.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      }}
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-lg shadow-green-500/20"
                    >
                      <Download size={14} /> Download Node JSON
                    </button>
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
               </div>

               {isRtdbReplicaLayout ? (
                 <div className="p-8 bg-zinc-50 dark:bg-[#070707] min-h-[400px] font-mono text-xs overflow-auto border-t border-black/5 dark:border-white/5">
                   {/* Firebase Web Console Mock Header line */}
                   <div className="flex items-center gap-1.5 pb-4 mb-6 border-b border-black/10 dark:border-white/10 select-none text-zinc-400 text-[10px] font-black uppercase tracking-widest leading-none font-sans">
                     <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
                     <span className="text-orange-500 font-extrabold">Firebase Realtime Database Replica</span>
                     <span className="mx-1">•</span>
                     <span className="text-zinc-500 cursor-help" title="Expand, edit or create new key paths dynamically matching standard firebase RTDB node schema.">Interactive Playfield</span>
                     <div className="ml-auto flex items-center gap-2">
                       <button 
                         onClick={() => setRtdbExpandedPaths({})}
                         className="px-2.5 py-1 rounded bg-black/5 dark:bg-white/5 hover:bg-black/10 hover:text-black dark:hover:text-white transition-all text-[9px] text-zinc-500 uppercase tracking-widest font-black"
                         title="Collapse all child branches"
                       >
                         Collapse All
                       </button>
                     </div>
                   </div>

                   {dbExplorerData === null || dbExplorerData === undefined ? (
                     <div className="p-20 text-center opacity-30">
                        <Database size={44} className="mx-auto mb-3 text-orange-500" />
                        <p className="font-bold uppercase tracking-widest text-[10px]">No data found at this path</p>
                     </div>
                   ) : (
                     <div className="space-y-1 pl-1">
                       {renderRtdbReplicaTree(dbExplorerData, [])}
                     </div>
                   )}
                 </div>
               ) : (
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
                                {(isObject(value) || isArray(value) || dbExplorerPath.length === 0 || key === '_FORCE_LOAD_ENTIRE_DATABASE') && (
                                   <button 
                                     onClick={() => {
                                        if (key === '_FORCE_LOAD_ENTIRE_DATABASE') {
                                          setForceLoadRoot(true);
                                        } else {
                                          setDbExplorerPath([...dbExplorerPath, key]);
                                        }
                                      }}
                                      className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors ml-2"
                                      title={key === '_FORCE_LOAD_ENTIRE_DATABASE' ? 'Force Load Tree' : 'Open Folder'}
                                   >
                                      <ChevronRight size={14} />
                                   </button>
                                )}
                             </div>
                          </div>
                       ))
                    )}
                 </div>
               )}
            </div>
          </div>

          {/* Right Column: JSON Importer dashboard */}
          <div className="space-y-6">
             {/* Dynamic Payload Size & Hazard Analyzer */}
             {(() => {
                const stats = analyzeNodePayload(dbExplorerData);
                
                // Determine hazard levels
                let globalHazard: 'SAFE' | 'WARNING' | 'ALERT' = 'SAFE';
                if (stats.totalBytes > 200000 || stats.totalKeys > 1500) {
                  globalHazard = 'ALERT';
                } else if (stats.totalBytes > 50000 || stats.totalKeys > 400) {
                  globalHazard = 'WARNING';
                }

                return (
                  <div className="bg-white dark:bg-[#0a0a0a] border border-black/5 dark:border-white/5 rounded-[2.5rem] p-6 shadow-2xl space-y-5">
                    <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-4">
                       <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center border",
                            globalHazard === 'SAFE' && "bg-green-500/15 text-green-500 border-green-500/25",
                            globalHazard === 'WARNING' && "bg-amber-500/15 text-amber-500 border-amber-500/25",
                            globalHazard === 'ALERT' && "bg-red-500/15 text-red-500 border-red-500/25"
                          )}>
                             <Activity size={20} />
                          </div>
                          <div>
                             <h3 className="font-black text-sm uppercase tracking-tight text-black dark:text-white">RTDB Size Analyzer</h3>
                             <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest font-mono">Payload diagnostic report</p>
                          </div>
                       </div>
                       <span className={cn(
                         "text-[8px] px-2.5 py-1 rounded-full font-black uppercase tracking-widest border",
                         globalHazard === 'SAFE' && "bg-green-500/10 text-green-500 border-green-500/25",
                         globalHazard === 'WARNING' && "bg-amber-500/10 text-amber-500 border-amber-500/25",
                         globalHazard === 'ALERT' && "bg-red-500/10 text-red-500 border-red-500/25"
                       )}>
                         {globalHazard === 'SAFE' && "● Real-time Stable"}
                         {globalHazard === 'WARNING' && "● Heavy Load Alert"}
                         {globalHazard === 'ALERT' && "● Non-Realtime Risk"}
                       </span>
                    </div>

                    {/* Diagnostics Metrics */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                       <div className="bg-black/5 dark:bg-white/5 p-3 rounded-2xl border border-black/5 dark:border-white/5">
                          <p className="text-[8px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-1">Bytes Size</p>
                          <p className="font-mono text-xs font-black text-black dark:text-white">
                            {stats.totalBytes < 1024 ? `${stats.totalBytes} B` : `${(stats.totalBytes/1024).toFixed(1)} KB`}
                          </p>
                       </div>
                       <div className="bg-black/5 dark:bg-white/5 p-3 rounded-2xl border border-black/5 dark:border-white/5">
                          <p className="text-[8px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-1">Total Keys</p>
                          <p className="font-mono text-xs font-black text-black dark:text-white">{stats.totalKeys}</p>
                       </div>
                       <div className="bg-black/5 dark:bg-white/5 p-3 rounded-2xl border border-black/5 dark:border-white/5">
                          <p className="text-[8px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 mb-1">Max Depth</p>
                          <p className="font-mono text-xs font-black text-black dark:text-white">{stats.maxDepth} levels</p>
                       </div>
                    </div>

                    {/* Hazard summary bar */}
                    <div className="space-y-1.5 bg-black/[0.02] dark:bg-white/[0.01] border border-black/5 dark:border-white/5 rounded-2xl p-4">
                       <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-wider">
                          <span className="text-black/40 dark:text-white/40">Active Stream Health</span>
                          <span className={cn(
                            globalHazard === 'SAFE' && "text-green-500",
                            globalHazard === 'WARNING' && "text-amber-500",
                            globalHazard === 'ALERT' && "text-red-500"
                          )}>
                            {globalHazard === 'SAFE' && "Perfect Stream State"}
                            {globalHazard === 'WARNING' && "Throttling Latency Risk"}
                            {globalHazard === 'ALERT' && "Danger: Close to Non-Realtime Mode"}
                          </span>
                       </div>
                       <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              globalHazard === 'SAFE' && "bg-green-500",
                              globalHazard === 'WARNING' && "bg-amber-500",
                              globalHazard === 'ALERT' && "bg-red-500"
                            )}
                            style={{ width: `${Math.min(100, Math.max(12, (stats.totalBytes / (globalHazard === 'ALERT' ? 1000000 : 250000) * 100)))}%` }}
                          />
                       </div>
                       <p className="text-[8px] text-black/45 dark:text-white/45 uppercase tracking-wide leading-relaxed font-semibold">
                         {globalHazard === 'SAFE' && "Under 40KB of memory. Your firebase RTDB real-time event loops will load with optimal sub-100ms latency."}
                         {globalHazard === 'WARNING' && "Exceeds 40KB under active nodes. Heavy nesting may limit real-time query bandwidth. Prune inactive fields."}
                         {globalHazard === 'ALERT' && "Extremely large payloads. Exceeds standard RTDB limits of 120KB. Firebase may strip sync handlers and activate non-realtime static snapshots."}
                       </p>
                    </div>

                    {/* Node weights breakdown */}
                    <div className="space-y-2">
                       <h4 className="text-[9px] font-black uppercase tracking-widest text-[#32befa] block px-1">Weight Distribution (Heavy First)</h4>
                       {stats.childStats.length === 0 ? (
                         <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest text-center py-4 bg-black/5 dark:bg-white/5 rounded-2xl">
                           No child nodes to track at this path level
                         </p>
                       ) : (
                         <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 pr-1">
                           {stats.childStats.map((item) => (
                             <div 
                               key={item.key}
                               className="flex items-center justify-between p-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 font-mono text-[10px] hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                             >
                                <div className="flex items-center gap-1.5 truncate">
                                   <span className={cn(
                                     "w-1.5 h-1.5 rounded-full shrink-0",
                                     item.hazardLevel === 'SAFE' && "bg-green-500",
                                     item.hazardLevel === 'WARNING' && "bg-amber-500",
                                     item.hazardLevel === 'ALERT' && "bg-red-500"
                                   )} />
                                   <span className="text-[#32befa] font-bold truncate">{item.key}</span>
                                   <span className="text-zinc-500 text-[8px] font-sans">({item.keysCount} elements)</span>
                                </div>
                                <span className="font-bold text-black dark:text-white shrink-0">
                                  {item.bytes < 1024 ? `${item.bytes} B` : `${(item.bytes/1024).toFixed(1)} KB`}
                                </span>
                             </div>
                           ))}
                         </div>
                       )}
                    </div>
                  </div>
                );
             })()}

            <div className="bg-white dark:bg-[#0a0a0a] border border-black/5 dark:border-white/5 rounded-[2.5rem] p-6 shadow-2xl space-y-6">
               <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
                     <Upload size={20} />
                  </div>
                  <div>
                     <h3 className="font-black text-sm uppercase tracking-tight text-black dark:text-white">JSON to RTDB Importer</h3>
                     <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest font-mono">Write structure to database</p>
                  </div>
               </div>

               {/* Target Path Configuration */}
               <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                     <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Target Node Path</label>
                     <button 
                       type="button"
                       onClick={() => setJsonImporterPath(dbExplorerPath.join('/'))}
                       className="text-[9px] font-black text-primary hover:underline uppercase tracking-wide font-mono"
                     >
                       Use Active Path
                     </button>
                  </div>
                  <div className="relative">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/40 dark:text-white/40 font-mono text-xs">/</span>
                     <input 
                       type="text"
                       value={jsonImporterPath}
                       onChange={e => setJsonImporterPath(e.target.value)}
                       placeholder="e.g. events, quizzes, or empty for ROOT"
                       className="w-full bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 p-3.5 pl-7 rounded-2xl font-bold font-mono outline-none focus:border-primary text-xs text-black dark:text-white transition-all"
                     />
                  </div>
               </div>

               {/* Drag and Drop Upload */}
               <div 
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={handleFileDrop}
                 className="group relative border border-dashed border-black/20 dark:border-white/20 hover:border-primary/50 rounded-2xl p-6 transition-all text-center cursor-pointer bg-black/5 dark:bg-white/5"
               >
                 <input 
                   type="file" 
                   accept=".json"
                   onChange={handleFileChange}
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                 />
                 <Upload className="mx-auto text-black/30 dark:text-white/30 group-hover:text-primary transition-colors mb-2" size={24} />
                 <p className="text-[10px] font-black uppercase tracking-widest text-[#32befa]">Upload .json File</p>
                 <p className="text-[8px] font-bold text-black/40 dark:text-white/40 mt-1">Drag file here or click to browse</p>
               </div>

               {/* Paste Raw JSON Code */}
               <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                     <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Raw JSON Code</label>
                     {jsonImporterText.trim() && (
                       <span className={cn(
                         "text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded flex items-center gap-1",
                         isJsonValid ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                       )}>
                         {isJsonValid ? <CheckCircle size={8} /> : <XCircle size={8} />}
                         {isJsonValid ? 'Valid Syntax' : 'Invalid Syntax'}
                       </span>
                     )}
                  </div>
                  <textarea 
                    value={jsonImporterText}
                    onChange={e => setJsonImporterText(e.target.value)}
                    placeholder={`{\n  "custom_node": {\n    "tag": "Rahee Quiz",\n    "active": true\n  }\n}`}
                    className="w-full h-44 bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-mono text-[11px] text-slate-800 dark:text-slate-200 outline-none focus:border-primary transition-all resize-none"
                  />
                  {!isJsonValid && jsonEvalError && (
                    <p className="text-[9px] font-bold text-red-500 mt-1 pl-1 line-clamp-2">
                      Error: {jsonEvalError}
                    </p>
                  )}
               </div>

               {/* Mode selection tabs */}
               <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block px-1">Import Method</label>
                  <div className="grid grid-cols-2 gap-2 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
                     <button
                       type="button"
                       onClick={() => setJsonImporterMode('update')}
                       className={cn(
                         "py-2 px-3 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all",
                         jsonImporterMode === 'update'
                           ? "bg-primary text-black shadow-md shadow-primary/10"
                           : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                       )}
                     >
                       Merge (Update)
                     </button>
                     <button
                       type="button"
                       onClick={() => setJsonImporterMode('set')}
                       className={cn(
                         "py-2 px-3 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all",
                         jsonImporterMode === 'set'
                           ? "bg-red-500 text-white shadow-md shadow-red-500/10"
                           : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                       )}
                     >
                       Overwrite (Set)
                     </button>
                  </div>
               </div>

               {/* Action trigger button */}
               <button
                 type="button"
                 disabled={isImportingJson}
                 onClick={handleJsonImport}
                 className={cn(
                   "w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg",
                   jsonImporterMode === 'set' 
                     ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/10 hover:shadow-red-500/20" 
                     : "bg-primary hover:bg-opacity-90 text-black shadow-primary/10 hover:shadow-primary/20",
                   "disabled:opacity-50 disabled:pointer-events-none"
                 )}
               >
                 <Database size={12} />
                 {isImportingJson ? 'Writing to database...' : 'Execute Import'}
                </button>
             </div>

             {/* JSON to CSV Maker Utility Panel */}
             <div className="bg-white dark:bg-[#0a0a0a] border border-black/5 dark:border-white/5 rounded-[2.5rem] p-8 shadow-2xl space-y-6">
                <div>
                   <h3 className="font-black text-sm uppercase tracking-tight text-black dark:text-white flex items-center gap-2">
                     <FileText className="text-[#32befa]" size={18} />
                     JSON to CSV Maker
                   </h3>
                   <p className="text-[9px] text-black/40 dark:text-white/40 uppercase tracking-wider font-bold mt-1">Convert JSON arrays or dictionary nodes into dynamic CSV sheets</p>
                </div>

                <div className="space-y-4">
                   <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-black/45 dark:text-white/45 block">Input JSON Code</label>
                      <button 
                        type="button"
                        onClick={() => {
                          if (dbExplorerData) {
                            setCsvMakerText(JSON.stringify(dbExplorerData, null, 2));
                            setCsvMakerError('');
                          } else {
                            setCsvMakerError('Current explorer path has no active data.');
                          }
                        }}
                        className="text-[8px] bg-primary/15 text-primary hover:bg-primary hover:text-black font-black uppercase tracking-widest px-2 py-1 rounded transition-all"
                      >
                        ⚡ Feed Active Node Data ({dbExplorerPath.length === 0 ? 'ROOT' : dbExplorerPath[dbExplorerPath.length - 1]})
                      </button>
                   </div>
                   <textarea 
                     value={csvMakerText}
                     onChange={e => {
                       setCsvMakerText(e.target.value);
                       setCsvMakerError('');
                     }}
                     placeholder={`[\n  { "name": "Player 1", "score": 25 },\n  { "name": "Player 2", "score": 40 }\n]\nOR\n{\n  "id1": { "name": "Player A", "xp": 10 },\n  "id2": { "name": "Player B", "xp": 20 }\n}`}
                     className="w-full h-44 bg-black/5 dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-mono text-[10px] text-slate-800 dark:text-slate-200 outline-none focus:border-[#32befa] transition-all resize-none animate-none"
                   />
                   {csvMakerError && (
                     <p className="text-[9px] font-bold text-red-500 pl-1 line-clamp-2">
                       Error: {csvMakerError}
                     </p>
                   )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!csvMakerText.trim()) {
                      setCsvMakerError('Please provide JSON code first.');
                      return;
                    }
                    try {
                      // Custom flattener for dictionary and lists
                      const jsonToCsv = (jsonInput: string): string => {
                        const parsed = JSON.parse(jsonInput);
                        let rows: any[] = [];
                        if (Array.isArray(parsed)) {
                          rows = parsed;
                        } else if (typeof parsed === 'object' && parsed !== null) {
                          const values = Object.values(parsed);
                          if (values.every(v => typeof v === 'object' && v !== null)) {
                            rows = Object.entries(parsed).map(([key, value]: [string, any]) => ({
                              id: key,
                              ...value
                            }));
                          } else {
                            rows = [parsed];
                          }
                        } else {
                          throw new Error("JSON must be an array of objects or an object dictionary.");
                        }

                        if (rows.length === 0) return "";

                        const allKeys = new Set<string>();
                        rows.forEach(row => {
                          if (typeof row === 'object' && row !== null) {
                            Object.keys(row).forEach(k => allKeys.add(k));
                          }
                        });

                        const headers = Array.from(allKeys);
                        const csvRows = [headers.join(',')];

                        rows.forEach(row => {
                          const values = headers.map(header => {
                            let val = row[header];
                            if (val === undefined || val === null) {
                              val = "";
                            } else if (typeof val === 'object') {
                              val = JSON.stringify(val);
                            } else {
                              val = String(val);
                            }
                            const escaped = val.replace(/"/g, '""');
                            return `"${escaped}"`;
                          });
                          csvRows.push(values.join(','));
                        });

                        return csvRows.join('\n');
                      };

                      const csvContent = jsonToCsv(csvMakerText);
                      if (!csvContent) {
                        setCsvMakerError('Empty CSV generated.');
                        return;
                      }
                      
                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.setAttribute("href", url);
                      link.setAttribute("download", `converted_data_${new Date().toISOString().split('T')[0]}.csv`);
                      link.style.visibility = 'hidden';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      setCsvMakerError('');
                    } catch (err: any) {
                      setCsvMakerError(err.message);
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 py-4 bg-[#32befa] hover:bg-opacity-90 text-black rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-[#32befa]/20"
                >
                  <Download size={12} />
                  Convert & Download CSV
                </button>
             </div>

             <div className="hidden">
                <button>
                  {isImportingJson ? 'Writing to database...' : 'Execute Import'}
               </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderReportsSection = () => {
    const filteredReports = reports.filter(r => {
      if (reportFilter === 'all') return true;
      if (reportFilter === 'pending') return r.status === 'pending' || !r.status;
      return r.status === reportFilter;
    });

    const handleDismissReport = async (report: any) => {
      const verified = await confirm({
        title: "Dismiss Report",
        description: `Mark this report from ${report.userName} as dismissed (mistake)? No coins will be awarded.`,
        type: 'confirm'
      });
      if (verified) {
        await update(ref(db, `reports/${report.id}`), { status: 'dismissed' });
        await alert({
          title: "Dismissed",
          description: "Report flagged as dismissed/mistake.",
          type: "success"
        });
      }
    };

    const handleRemoveQuizAndApprove = async (report: any) => {
      const verified = await confirm({
        title: "Remove Quiz & Reward Player",
        description: `This will DELETE this quiz from the game and award 500 Rahee Coins to ${report.userName}. Continue?`,
        type: 'confirm'
      });
      if (!verified) return;

      try {
        // 1. Delete quiz
        await remove(ref(db, `quizzes/${report.quizId}`));
        
        // 2. Award 500 coins to reporter
        const userRef = ref(db, `users/${report.userId}`);
        const userSnap = await get(userRef);
        if (userSnap.exists()) {
          const uData = userSnap.val();
          const currentCoins = uData.raheeCoins || 0;
          await update(userRef, { raheeCoins: currentCoins + 500 });
        }

        // 3. Update report status
        await update(ref(db, `reports/${report.id}`), { status: 'resolved' });

        await alert({
          title: "Approved!",
          description: "Quiz removed successfully, and 500 Rahee Coins awarded to the reporter!",
          type: 'success'
        });
      } catch (err: any) {
        await alert({
          title: "Error",
          description: err.message || "Failed to remove and reward player.",
          type: 'error'
        });
      }
    };

    const handleSaveFixAndApprove = async (report: any) => {
      if (!editReportForm) return;
      const verified = await confirm({
        title: "Save Fix & Reward Player",
        description: `This will update the quiz text/options and award 500 Rahee Coins to ${report.userName}. Continue?`,
        type: 'confirm'
      });
      if (!verified) return;

      try {
        const liveQuiz = quizzes.find(q => q.id === report.quizId);
        if (!liveQuiz) {
          throw new Error("Quiz not found in live data; cannot edit.");
        }

        const updatedQuiz = {
          ...liveQuiz,
          question: {
            en: editReportForm.questionEn,
            hi: editReportForm.questionHi || editReportForm.questionEn
          },
          options: {
            en: [editReportForm.opt1En, editReportForm.opt2En, editReportForm.opt3En, editReportForm.opt4En].filter(Boolean),
            hi: [editReportForm.opt1Hi || editReportForm.opt1En, editReportForm.opt2Hi || editReportForm.opt2En, editReportForm.opt3Hi || editReportForm.opt3En, editReportForm.opt4Hi || editReportForm.opt4En].filter(Boolean)
          }
        };

        // 1. Update quiz in database
        await set(ref(db, `quizzes/${report.quizId}`), updatedQuiz);

        // 2. Award 500 coins to reporter
        const userRef = ref(db, `users/${report.userId}`);
        const userSnap = await get(userRef);
        if (userSnap.exists()) {
          const uData = userSnap.val();
          const currentCoins = uData.raheeCoins || 0;
          await update(userRef, { raheeCoins: currentCoins + 500 });
        }

        // 3. Mark report as resolved
        await update(ref(db, `reports/${report.id}`), { status: 'resolved' });

        setEditingReportId(null);
        setEditReportForm(null);

        await alert({
          title: "Approved & Saved!",
          description: "Quiz fixed successfully, and 500 Rahee Coins awarded to the reporter!",
          type: 'success'
        });
      } catch (err: any) {
        await alert({
          title: "Error",
          description: err.message || "Failed to update quiz and reward player.",
          type: 'error'
        });
      }
    };

    return (
      <div className="space-y-6 pb-32">
         <div className="flex items-center justify-between px-2">
            <div>
               <h2 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white">Inappropriate Quiz Reports</h2>
               <p className="text-[10px] font-bold text-black/30 dark:text-white/30 uppercase tracking-[0.2em]">Settle quiz reports and reward players</p>
            </div>
            <div className="flex items-center gap-2">
              {['pending', 'resolved', 'dismissed', 'all'].map(t => (
                <button
                  key={t}
                  onClick={() => setReportFilter(t as any)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-wider border transition-all cursor-pointer",
                    reportFilter === t
                      ? "bg-primary text-black border-primary shadow-sm"
                      : "bg-black/5 dark:bg-white/5 border-transparent text-black/40 dark:text-white/40"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
         </div>

         <div className="grid grid-cols-1 gap-6">
            {filteredReports.map((r, rIdx) => {
              const liveQuiz = quizzes.find(q => q.id === r.quizId);
              const isEditing = editingReportId === r.id;

              return (
                <div key={`report-${r.id || rIdx}`} className="bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5 p-6 rounded-[2rem] gap-4 transition-all">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                     <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center font-black uppercase border border-red-500/15">
                           <AlertTriangle size={18} />
                        </div>
                        <div>
                           <h4 className="font-bold text-sm text-black dark:text-white">Reported by {r.userName || 'Anonymous'}</h4>
                           <p className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest font-mono">
                             User ID: {r.userId} • Reported: {new Date(r.timestamp).toLocaleDateString()} {new Date(r.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                           </p>
                        </div>
                     </div>

                     <div className="flex items-center gap-2">
                        {(!r.status || r.status === 'pending') && (
                          <span className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                            Pending
                          </span>
                        )}
                        {r.status === 'resolved' && (
                          <span className="bg-green-500/10 border border-green-500/20 text-green-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                            Approved & Resolved
                          </span>
                        )}
                        {r.status === 'dismissed' && (
                          <span className="bg-gray-500/10 border border-gray-500/20 text-gray-500 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                            Dismissed (Mistake)
                          </span>
                        )}
                     </div>
                  </div>

                  <div className="mt-4 bg-white/5 dark:bg-black/20 p-4 rounded-2xl border border-black/10 dark:border-white/5 space-y-2">
                     <p className="text-[9px] font-black text-primary uppercase tracking-widest">Reported Question Details</p>
                     <p className="text-xs text-black dark:text-white leading-relaxed font-bold">
                       {r.quizText ? (typeof r.quizText === 'object' ? ((r.quizText as any).en || (r.quizText as any).hi || '') : r.quizText) : 'No text supplied'}
                     </p>
                     <p className="text-[8px] font-bold text-black/30 dark:text-white/30 uppercase tracking-widest font-mono">
                       Global Quiz ID Reference: {r.quizId}
                     </p>
                     {!liveQuiz && (
                       <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider">
                         * NOTE: This quiz is no longer present in the game records (already deleted or recompiled).
                       </p>
                     )}
                  </div>

                  {liveQuiz && (!r.status || r.status === 'pending') && (
                     <div className="mt-6 space-y-4">
                        {!isEditing ? (
                          <div className="flex flex-wrap items-center gap-2">
                             <button
                               onClick={() => {
                                 setEditingReportId(r.id);
                                 setEditReportForm({
                                   questionEn: liveQuiz.question?.en || '',
                                   questionHi: liveQuiz.question?.hi || '',
                                   opt1En: liveQuiz.options?.en?.[0] || '',
                                   opt1Hi: liveQuiz.options?.hi?.[0] || '',
                                   opt2En: liveQuiz.options?.en?.[1] || '',
                                   opt2Hi: liveQuiz.options?.hi?.[1] || '',
                                   opt3En: liveQuiz.options?.en?.[2] || '',
                                   opt3Hi: liveQuiz.options?.hi?.[2] || '',
                                   opt4En: liveQuiz.options?.en?.[3] || '',
                                   opt4Hi: liveQuiz.options?.hi?.[3] || '',
                                 });
                               }}
                               className="px-4 py-2 bg-primary/20 hover:bg-primary border border-primary/20 text-primary hover:text-black font-black text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                             >
                               Fix & Approve (+500 Coins)
                             </button>
                             <button
                               onClick={() => handleRemoveQuizAndApprove(r)}
                               className="px-4 py-2 bg-red-500/20 hover:bg-red-500 border border-red-500/20 hover:border-red-500 text-red-500 hover:text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                             >
                               Remove Quiz (+500 Coins)
                             </button>
                             <button
                               onClick={() => handleDismissReport(r)}
                               className="px-4 py-2 bg-black/20 dark:bg-white/5 hover:bg-black/40 hover:dark:bg-white/10 text-black/50 dark:text-white/50 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                             >
                               Dismiss (Mistake)
                             </button>
                          </div>
                        ) : (
                          <div className="bg-black/10 dark:bg-black/30 p-6 rounded-2xl border border-black/10 dark:border-white/5 space-y-4">
                             <div className="flex items-center justify-between">
                                <h5 className="text-xs font-black uppercase text-primary tracking-wider">Fix Quiz Editor</h5>
                                <button 
                                  onClick={() => { setEditingReportId(null); setEditReportForm(null); }}
                                  className="text-[10px] font-bold text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white uppercase tracking-wider"
                                >
                                  Cancel
                                </button>
                             </div>

                             <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Question (English)</label>
                                      <textarea 
                                        value={editReportForm.questionEn}
                                        onChange={e => setEditReportForm({ ...editReportForm, questionEn: e.target.value })}
                                        className="w-full bg-white dark:bg-black p-3 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold font-sans outline-none focus:border-primary text-black dark:text-white"
                                        rows={2}
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Question (Hindi)</label>
                                      <textarea 
                                        value={editReportForm.questionHi}
                                        onChange={e => setEditReportForm({ ...editReportForm, questionHi: e.target.value })}
                                        className="w-full bg-white dark:bg-black p-3 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold font-sans outline-none focus:border-primary text-black dark:text-white"
                                        rows={2}
                                      />
                                   </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Option A (English)</label>
                                      <input 
                                        type="text"
                                        value={editReportForm.opt1En}
                                        onChange={e => setEditReportForm({ ...editReportForm, opt1En: e.target.value })}
                                        className="w-full bg-white dark:bg-black px-3 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold outline-none focus:border-primary text-black dark:text-white"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Option A (Hindi)</label>
                                      <input 
                                        type="text"
                                        value={editReportForm.opt1Hi}
                                        onChange={e => setEditReportForm({ ...editReportForm, opt1Hi: e.target.value })}
                                        className="w-full bg-white dark:bg-black px-3 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold outline-none focus:border-primary text-black dark:text-white"
                                      />
                                   </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Option B (English)</label>
                                      <input 
                                        type="text"
                                        value={editReportForm.opt2En}
                                        onChange={e => setEditReportForm({ ...editReportForm, opt2En: e.target.value })}
                                        className="w-full bg-white dark:bg-black px-3 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold outline-none focus:border-primary text-black dark:text-white"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Option B (Hindi)</label>
                                      <input 
                                        type="text"
                                        value={editReportForm.opt2Hi}
                                        onChange={e => setEditReportForm({ ...editReportForm, opt2Hi: e.target.value })}
                                        className="w-full bg-white dark:bg-black px-3 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold outline-none focus:border-primary text-black dark:text-white"
                                      />
                                   </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Option C (English)</label>
                                      <input 
                                        type="text"
                                        value={editReportForm.opt3En}
                                        onChange={e => setEditReportForm({ ...editReportForm, opt3En: e.target.value })}
                                        className="w-full bg-white dark:bg-black px-3 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold outline-none focus:border-primary text-black dark:text-white"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Option C (Hindi)</label>
                                      <input 
                                        type="text"
                                        value={editReportForm.opt3Hi}
                                        onChange={e => setEditReportForm({ ...editReportForm, opt3Hi: e.target.value })}
                                        className="w-full bg-white dark:bg-black px-3 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold outline-none focus:border-primary text-black dark:text-white"
                                      />
                                   </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Option D (English)</label>
                                      <input 
                                        type="text"
                                        value={editReportForm.opt4En}
                                        onChange={e => setEditReportForm({ ...editReportForm, opt4En: e.target.value })}
                                        className="w-full bg-white dark:bg-black px-3 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold outline-none focus:border-primary text-black dark:text-white"
                                      />
                                   </div>
                                   <div className="space-y-1">
                                      <label className="text-[8px] font-black uppercase opacity-40">Option D (Hindi)</label>
                                      <input 
                                        type="text"
                                        value={editReportForm.opt4Hi}
                                        onChange={e => setEditReportForm({ ...editReportForm, opt4Hi: e.target.value })}
                                        className="w-full bg-white dark:bg-black px-3 py-2 border border-black/10 dark:border-white/10 rounded-xl text-xs font-bold outline-none focus:border-primary text-black dark:text-white"
                                      />
                                   </div>
                                </div>

                                <button
                                  onClick={() => handleSaveFixAndApprove(r)}
                                  className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-green-500/10 cursor-pointer"
                                >
                                  Save & Approve (+ 500 Coins & Flag Fixed)
                                </button>
                             </div>
                          </div>
                        )}
                     </div>
                  )}
                </div>
              );
            })}

            {filteredReports.length === 0 && (
               <div className="col-span-full py-20 text-center opacity-15">
                  <AlertTriangle size={64} className="mx-auto mb-4" />
                  <p className="font-black uppercase tracking-widest text-xs">No reports found under filtered state</p>
               </div>
            )}
         </div>
      </div>
    );
  };

  const renderRtdbVisualNodeGrid = () => {
    // Sub-component to sync specific Firebase RTDB node value and display smooth circular progress ring
    const RtdbGridCircularNode = ({ config, onEdit, onDelete }: { config: any, onEdit: (c: any) => void, onDelete: (id: string) => any, key?: string }) => {
      const [liveValue, setLiveValue] = useState<any>(null);
      const [loading, setLoading] = useState(true);

      useEffect(() => {
        try {
          const nodeRef = ref(db, config.path);
          const unsubscribe = onValue(nodeRef, (snapshot) => {
            const newVal = snapshot.exists() ? snapshot.val() : null;
            setLiveValue((oldVal: any) => {
              if (JSON.stringify(oldVal) === JSON.stringify(newVal)) {
                return oldVal;
              }
              return newVal;
            });
            setLoading(false);
          }, (err) => {
            console.error("Error reading RTDB node:", config.path, err);
            setLoading(false);
          });
          return () => unsubscribe();
        } catch (e) {
          console.error("Invalid path subscription error:", e);
          setLoading(false);
        }
      }, [config.path]);

      // Process numeric configurations for circle progress calculations
      const maxExpected = config.maxExpectedVal ? Number(config.maxExpectedVal) : 100;
      const isNumeric = typeof liveValue === 'number' || (typeof liveValue === 'string' && !isNaN(Number(liveValue)) && liveValue.trim() !== '');
      const numericVal = isNumeric ? Number(liveValue) : 0;
      
      let stringRep = 'N/A';
      if (liveValue !== null && liveValue !== undefined) {
        if (typeof liveValue === 'object') {
          stringRep = 'Object 📦';
        } else if (typeof liveValue === 'boolean') {
          stringRep = liveValue ? 'True' : 'False';
        } else {
          stringRep = String(liveValue);
        }
      }

      const radius = 38;
      const strokeCircumference = 2 * Math.PI * radius; // Approx 238.76
      const percentage = Math.min(Math.max((numericVal / maxExpected) * 100, 0), 100);
      const strokeDashoffset = isNumeric 
        ? strokeCircumference - (strokeCircumference * percentage) / 100 
        : (liveValue === true || liveValue === 'true') 
          ? 0 
          : strokeCircumference;

      const hexColor = config.color || '#32befa';

      return (
        <motion.div
          whileHover={{ y: -6, scale: 1.02 }}
          className="bg-white dark:bg-[#0c0c11] border border-black/5 dark:border-white/5 p-6 rounded-[2.5rem] shadow-sm flex flex-col items-center justify-between min-h-[220px] transition-all relative group"
        >
          {/* Action options floating top-right on hover card */}
          <div className="absolute top-4 right-4 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-305 z-10">
            <button
              onClick={() => onEdit(config)}
              className="p-1.5 bg-black/5 dark:bg-white/10 text-neutral-500 hover:text-[#32befa] rounded-xl transition-all"
              title="Edit Node Config"
            >
              <Edit2 size={11} />
            </button>
            <button
              onClick={() => onDelete(config.id)}
              className="p-1.5 bg-black/5 dark:bg-white/10 text-neutral-500 hover:text-red-500 rounded-xl transition-all"
              title="Delete Visual Node"
            >
              <Trash2 size={11} />
            </button>
          </div>

          {/* SVG ring centering value */}
          <div className="relative w-28 h-28 flex items-center justify-center mt-2">
            <svg className="absolute inset-0 w-full h-full -rotate-90 select-none pointer-events-none" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r={radius}
                stroke="currentColor"
                strokeWidth="5"
                className="text-black/5 dark:text-white/5"
                fill="transparent"
              />
              <motion.circle
                cx="50"
                cy="50"
                r={radius}
                stroke={hexColor}
                strokeWidth="5"
                fill="transparent"
                strokeDasharray={strokeCircumference}
                animate={{ strokeDashoffset }}
                transition={{ type: "spring", stiffness: 60, damping: 15 }}
                strokeLinecap="round"
              />
            </svg>

            {/* Pulse flash background glow effect on update */}
            <motion.div 
              key={stringRep}
              initial={{ scale: 0.9, opacity: 0.35 }}
              animate={{ scale: 1, opacity: 0 }}
              transition={{ duration: 0.8 }}
              style={{ borderColor: hexColor }}
              className="absolute inset-2 border border-dashed rounded-full pointer-events-none"
            />

            {/* Value Centered Precisely inside circle */}
            <div className="flex flex-col items-center justify-center px-3 text-center z-10 max-w-[85px] overflow-hidden">
              <span className="text-[7px] font-mono uppercase text-black/30 dark:text-white/30 tracking-widest font-bold">
                RTDB VAL
              </span>
              <span 
                className="text-xs sm:text-sm font-black tracking-tight text-neutral-900 dark:text-neutral-50 truncate max-w-full font-mono mt-0.5"
                title={stringRep}
              >
                {loading ? '...' : stringRep}
              </span>
              {isNumeric && (
                <span className="text-[7px] font-mono text-black/35 dark:text-white/35 font-bold mt-0.5">
                  {Math.round(percentage)}%
                </span>
              )}
            </div>
          </div>

          {/* Label and Path below circle */}
          <div className="text-center w-full mt-4 space-y-1">
            <h4 className="text-[10px] sm:text-[11px] font-black uppercase text-neutral-800 dark:text-neutral-200 tracking-wider truncate px-1 font-sans">
              {config.label || 'Unnamed Node'}
            </h4>
            <p className="text-[8px] font-mono text-neutral-400 dark:text-neutral-500 font-bold truncate px-2.5 bg-neutral-100 dark:bg-neutral-900 py-1 rounded-lg mx-auto max-w-[130px] uppercase tracking-tight select-all">
              /{config.path}
            </p>
          </div>
        </motion.div>
      );
    };

    // CRUD saving flow
    const handleSaveGridConfig = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!formPath.trim() || !formLabel.trim()) {
        await alert({
          title: 'Validation Error',
          description: 'Please specify both a target database path and custom visual label text.',
          type: 'error'
        });
        return;
      }

      try {
        const id = activeEditingConfigId || `config_${Date.now()}`;
        const cleanPath = formPath.trim().replace(/^\/+|\/+$/g, '');
        const targetRef = ref(db, `adminCustomGridConfigs/${id}`);
        
        const payload = {
          path: cleanPath,
          label: formLabel.trim(),
          color: formColor,
          maxExpectedVal: isNaN(Number(formMaxVal)) ? 100 : Number(formMaxVal)
        };

        await set(targetRef, payload);
        
        setIsGridConfigModalOpen(false);
        setActiveEditingConfigId(null);
        setFormPath('');
        setFormLabel('');
        setFormColor('#32befa');
        setFormMaxVal('100');

        await alert({
          title: 'Config Saved',
          description: `Custom circular node visualizer stored dynamically under path /${cleanPath}.`,
          type: 'success'
        });
      } catch (err: any) {
        await alert({
          title: 'Error Saving Config',
          description: err.message,
          type: 'error'
        });
      }
    };

    const handleDeleteGridConfig = async (id: string) => {
      const confirmed = await confirm({
        title: 'Delete Visualizer?',
        description: 'Are you sure you want to remove this customized circular visualization? This will not delete actual data within the database nodes.',
        type: 'error'
      });
      if (!confirmed) return;

      try {
        await remove(ref(db, `adminCustomGridConfigs/${id}`));
        await alert({
          title: 'Visualizer Removed',
          description: 'Successful deletion of dynamic schema visualization configuration.',
          type: 'success'
        });
      } catch (err: any) {
        await alert({
          title: 'Deletion Failed',
          description: err.message,
          type: 'error'
        });
      }
    };

    const handleStartEdit = (config: any) => {
      setGridFormMode('edit');
      setActiveEditingConfigId(config.id);
      setFormPath(config.path);
      setFormLabel(config.label);
      setFormColor(config.color || '#32befa');
      setFormMaxVal(String(config.maxExpectedVal || 100));
      setIsGridConfigModalOpen(true);
    };

    const handleStartAdd = () => {
      setGridFormMode('add');
      setActiveEditingConfigId(null);
      setFormPath('');
      setFormLabel('');
      setFormColor('#32befa');
      setFormMaxVal('100');
      setIsGridConfigModalOpen(true);
    };

    return (
      <div className="bg-white dark:bg-[#0c0c0c] border border-black/5 dark:border-white/5 p-8 rounded-[2.5rem] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-4">
          <div className="text-left font-sans">
            <span className="text-[9px] font-black uppercase text-primary tracking-widest block font-sans">
              Firebase Realtime Database Visualizer
            </span>
            <h3 className="text-xl font-black uppercase tracking-tight text-black dark:text-white font-sans mt-0.5">
              Circular Progress Nodes Grid
            </h3>
          </div>
          <button
            onClick={handleStartAdd}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary hover:bg-opacity-90 text-black rounded-xl font-black text-[10px] uppercase tracking-widest transition-transform hover:scale-[1.03] active:scale-95 shadow-md shadow-primary/20 animate-pulse"
          >
            <Plus size={14} />
            Add Custom Visualizer
          </button>
        </div>

        {/* Responsive CSS Grid structure for nodes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {gridCustomConfigs.map((config) => (
            <RtdbGridCircularNode 
              key={`visual-rtdb-circle-${config.id}`} 
              config={config} 
              onEdit={handleStartEdit} 
              onDelete={handleDeleteGridConfig} 
            />
          ))}

          {gridCustomConfigs.length === 0 && (
            <div className="col-span-full py-16 text-center text-black/30 dark:text-white/30">
              <Database size={36} className="mx-auto mb-3 opacity-20 animate-pulse" />
              <p className="text-xs font-black uppercase tracking-widest">
                No database visual configurations available. Create one now.
              </p>
            </div>
          )}
        </div>

        {/* Custom Configuration Modal dialog */}
        <AnimatePresence>
          {isGridConfigModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsGridConfigModalOpen(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm shadow-xl"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-white dark:bg-[#0c0c11] border border-black/10 dark:border-white/10 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative z-10 text-left space-y-5 text-black dark:text-white"
              >
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3.5">
                  <div>
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest block font-sans">
                      Configuration properties
                    </span>
                    <h3 className="text-lg font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-50 mt-0.5 font-sans">
                      {gridFormMode === 'add' ? 'Add Visualizer' : 'Edit Properties'}
                    </h3>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setIsGridConfigModalOpen(false)}
                    className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-400 hover:text-red-500 rounded-full transition-all"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>

                <form onSubmit={handleSaveGridConfig} className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[#a855f7] block ml-1 font-sans">
                      Target Database Node Path
                    </label>
                    <div className="flex items-center gap-1.5 bg-neutral-100 dark:bg-black p-3.5 rounded-2xl border border-black/5 dark:border-white/5 font-mono">
                      <span className="text-[10px] text-neutral-400 font-bold select-none">/</span>
                      <input 
                        type="text"
                        value={formPath}
                        onChange={(e) => setFormPath(e.target.value)}
                        placeholder="settings/gameSessionTimeLimit"
                        className="bg-transparent outline-none flex-1 font-mono text-neutral-850 dark:text-neutral-50 border-0 p-0 focus:ring-0 text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block ml-1 font-sans">
                      Text Label Name
                    </label>
                    <input 
                      type="text"
                      value={formLabel}
                      onChange={(e) => setFormLabel(e.target.value)}
                      placeholder="e.g. Session duration"
                      className="w-full text-xs p-3.5 bg-neutral-100 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl font-bold text-neutral-850 dark:text-neutral-50 placeholder-neutral-400 outline-none focus:border-primary/50 transition-all font-sans"
                      required
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[#10b981] block ml-1 font-sans">
                      Circle Outline Color
                    </label>
                    <div className="flex flex-wrap items-center gap-2 p-3 bg-neutral-50 dark:bg-black rounded-2xl border border-black/5 dark:border-white/5">
                      {[
                        '#a855f7', // Purple
                        '#32befa', // Cyan
                        '#10b981', // Emerald
                        '#ec4899', // Pink
                        '#f59e0b', // Amber
                        '#3b82f6', // Blue
                        '#ef4444'  // Red
                      ].map((presetColor) => (
                        <button
                          key={presetColor}
                          type="button"
                          onClick={() => setFormColor(presetColor)}
                          style={{ backgroundColor: presetColor }}
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-transform cursor-pointer hover:scale-110",
                            formColor === presetColor ? "border-neutral-950 dark:border-white" : "border-transparent"
                          )}
                          title={presetColor}
                        />
                      ))}
                      <div className="border-l border-black/10 dark:border-white/10 h-5 mx-1" />
                      <div className="flex items-center bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/5 rounded-lg p-0.5 px-1.5 ml-auto">
                        <input
                          type="color"
                          value={formColor}
                          onChange={(e) => setFormColor(e.target.value)}
                          className="w-4 h-4 rounded cursor-pointer border-0 p-0 mr-1 bg-transparent"
                        />
                        <input
                          type="text"
                          value={formColor}
                          onChange={(e) => setFormColor(e.target.value)}
                          placeholder="#ffffff"
                          className="w-12 text-[10.5px] font-mono font-black bg-transparent outline-none p-0 border-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-[#32befa] block ml-1 font-sans">
                      Max expected scale value
                    </label>
                    <input 
                      type="number"
                      value={formMaxVal}
                      onChange={(e) => setFormMaxVal(e.target.value)}
                      placeholder="denominator e.g., 100"
                      className="w-full text-xs p-3.5 bg-neutral-100 dark:bg-black border border-black/5 dark:border-white/5 rounded-2xl font-bold text-neutral-850 dark:text-neutral-50 placeholder-neutral-400 outline-none focus:border-primary/50 transition-all font-mono"
                      min={1}
                      max={100000000}
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setIsGridConfigModalOpen(false)}
                      className="flex-1 py-3 bg-neutral-150 dark:bg-white/4 font-sans text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-[9px] transition-all border border-black/5"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-primary text-black hover:opacity-95 rounded-2xl font-black uppercase tracking-widest text-[9px] transition-all shadow-lg shadow-primary/20"
                    >
                      {gridFormMode === 'add' ? 'Create' : 'Save'}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderCircularGridDBNodes = () => {
    return renderRtdbVisualNodeGrid();
  };

  const renderLivePOVStream = () => {
    return null;
  };

// Removed obsolete POV Stream function

  const renderLiveMonitorSection = () => {
    return null;
  };

  const unusedLiveMonitorBodyPlaceholder = () => {
    // Declare dummy variables to make TS compiler happy for this unused function
    const [selectedMonitorPlayerId, setSelectedMonitorPlayerId] = useState<any>(null);
    const [selectedPlayerCustomPath, setSelectedPlayerCustomPath] = useState<any>('');
    const [orbitPathNodes, setOrbitPathNodes] = useState<any>(null);
    const [newOrbitNodeName, setNewOrbitNodeName] = useState<any>('');
    const [newOrbitNodeVal, setNewOrbitNodeVal] = useState<any>('');
    const [orbitActivePath, setOrbitActivePath] = useState<any>('');
    const [editingNodePath, setEditingNodePath] = useState<any>(null);
    const [editingNodeVal, setEditingNodeVal] = useState<any>('');

    // Determine active player being monitored
    const activePlayers = users.filter(u => !u.isBot);
    const resolvedPlayerId = selectedMonitorPlayerId || activePlayers[0]?.id || adminUser?.id || '';
    const targetPlayer = users.find(u => u.id === resolvedPlayerId);

    // Default activeState fallback
    const activeState = targetPlayer?.activeState || {
      activeTab: 'home',
      showQuiz: false,
      activeExamId: '',
      showSettings: false,
      showTopicSelect: false,
      showFeedback: false,
      showMultiplayerHub: false,
      multiRoomId: '',
      showScoreCard: false,
      showHistory: false,
      showProfile: false,
      showLivesModal: false,
      showStreakModal: false,
      showRaheePass: false,
      lastUpdated: Date.now()
    };

    // Calculate database elements for orbital ring layout
    const nodesList = orbitPathNodes && typeof orbitPathNodes === 'object'
      ? Object.entries(orbitPathNodes).map(([key, val]) => ({ key, val }))
      : typeof orbitPathNodes !== 'undefined' && orbitPathNodes !== null
        ? [{ key: '_value', val: orbitPathNodes }]
        : [];

    // Simple CRUD action handlers for orbit path nodes
    const handleAddOrbitNode = async () => {
      if (!newOrbitNodeName.trim()) {
        await alert({ title: 'Invalid Name', description: 'Please enter a valid node key/name.', type: 'error' });
        return;
      }
      try {
        const rootPath = !orbitActivePath || orbitActivePath.trim() === '' ? '' : orbitActivePath.replace(/^\/+|\/+$/g, '');
        const targetPath = rootPath ? `${rootPath}/${newOrbitNodeName.trim()}` : newOrbitNodeName.trim();
        
        let parsedVal: any = newOrbitNodeVal;
        try {
          if ((newOrbitNodeVal.startsWith('{') && newOrbitNodeVal.endsWith('}')) || (newOrbitNodeVal.startsWith('[') && newOrbitNodeVal.endsWith(']'))) {
            parsedVal = JSON.parse(newOrbitNodeVal);
          } else if (newOrbitNodeVal === 'true') {
            parsedVal = true;
          } else if (newOrbitNodeVal === 'false') {
            parsedVal = false;
          } else if (!isNaN(Number(newOrbitNodeVal)) && newOrbitNodeVal.trim() !== '') {
            parsedVal = Number(newOrbitNodeVal);
          }
        } catch (_) {}

        await set(ref(db, targetPath), parsedVal);
        setNewOrbitNodeName('');
        setNewOrbitNodeVal('');
        await alert({ title: 'Success', description: `Successfully created node at path: ${targetPath}`, type: 'success' });
      } catch (err: any) {
        await alert({ title: 'Operation Failed', description: err.message, type: 'error' });
      }
    };

    const handleDeleteOrbitNode = async (key: string) => {
      const v = await confirm({
        title: 'Delete Node?',
        description: `This will permanently delete key: "${key}" and all its sub-nodes. Proceed?`,
        type: 'error'
      });
      if (!v) return;
      try {
        const rootPath = !orbitActivePath || orbitActivePath.trim() === '' ? '' : orbitActivePath.replace(/^\/+|\/+$/g, '');
        const targetPath = rootPath ? `${rootPath}/${key}` : key;
        await remove(ref(db, targetPath));
      } catch (err: any) {
        await alert({ title: 'Error deleting', description: err.message, type: 'error' });
      }
    };

    const handleUpdateOrbitNode = async () => {
      if (!editingNodePath) return;
      try {
        let parsedVal: any = editingNodeVal;
        try {
          if ((editingNodeVal.startsWith('{') && editingNodeVal.endsWith('}')) || (editingNodeVal.startsWith('[') && editingNodeVal.endsWith(']'))) {
            parsedVal = JSON.parse(editingNodeVal);
          } else if (editingNodeVal === 'true') {
            parsedVal = true;
          } else if (editingNodeVal === 'false') {
            parsedVal = false;
          } else if (!isNaN(Number(editingNodeVal)) && editingNodeVal.trim() !== '') {
            parsedVal = Number(editingNodeVal);
          }
        } catch (_) {}

        await set(ref(db, editingNodePath), parsedVal);
        setEditingNodePath(null);
        setEditingNodeVal('');
        await alert({ title: 'Success', description: 'Updated node successfully', type: 'success' });
      } catch (err: any) {
        await alert({ title: 'Update Failed', description: err.message, type: 'error' });
      }
    };

    const handleAssignPlayerPath = async () => {
      if (!targetPlayer?.id) return;
      try {
        await update(ref(db, `users/${targetPlayer.id}`), {
          customDatabasePath: selectedPlayerCustomPath
        });
        await alert({ title: 'Path Assigned', description: `Successfully custom synced database context path for ${targetPlayer.name}`, type: 'success' });
      } catch (err: any) {
        await alert({ title: 'Failed to assign', description: err.message, type: 'error' });
      }
    };

    // FCM notification log stream simulation or real tracer
    const simulatedNotificationLogs = [
      { id: 'n1', type: 'approval_success', title: 'Arena Access Approved', body: 'Registration request successfully verified and accepted.', player: targetPlayer?.name || 'All Players', time: 'Just now', status: 'delivered' },
      { id: 'n2', type: 'exam_registration', title: 'Test Exam Assigned', body: `Active exam assigned contextual and waiting in Events list.`, player: targetPlayer?.name || 'All Players', time: '2 mins ago', status: 'received' },
      { id: 'n3', type: 'coins_refill', title: 'Coins Awarded', body: `Refilled +500 Rahee Coins via Admin command panel.`, player: targetPlayer?.name || 'All Players', time: '10 mins ago', status: 'handled' },
      { id: 'n4', type: 'testing_mode', title: 'Testing Mode Alert', body: 'Invoking testing credentials token on matched dev device.', player: targetPlayer?.name || 'All Players', time: '1 hour ago', status: 'transmitted' }
    ];

    return (
      <div className="space-y-12 pb-32">
        {/* Header summary */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-black/5 dark:bg-[#111] p-8 rounded-[2.5rem] border border-black/5 dark:border-white/5 relative overflow-hidden">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-black uppercase text-primary tracking-widest block">Live Platform Operations</span>
            <h2 className="text-3xl font-black uppercase tracking-tight text-black dark:text-white">Active Monitor & Orbit Ring</h2>
            <p className="text-xs text-black/40 dark:text-white/40 font-bold uppercase tracking-widest leading-none mt-2">Dual POV Device Simulator with Circular Animated DB Nodes Manager</p>
          </div>
          <div className="z-10 bg-white/5 p-4 rounded-3xl border border-black/5 dark:border-white/5 flex flex-col md:flex-row gap-4 items-center">
            <label className="text-[10px] font-black uppercase tracking-widest text-[#32befa]">Target Player</label>
            <select
              value={resolvedPlayerId}
              onChange={(e) => {
                setSelectedMonitorPlayerId(e.target.value);
                const p = users.find(u => u.id === e.target.value);
                setSelectedPlayerCustomPath(p?.customDatabasePath || '');
              }}
              className="px-4 py-2 rounded-2xl bg-white dark:bg-black border border-black/10 dark:border-white/10 text-xs font-bold text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-[#32befa]"
            >
              <option value="">-- Choose active player --</option>
              {activePlayers.map(p => (
                <option key={`p-sel-${p.id}`} value={p.id}>{p.name} (@{p.username || p.id})</option>
              ))}
            </select>
          </div>
        </div>

        {/* SECTION 1: Dual POV Simulators in Desktop view */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-stretch">
          
          {/* FRAME 1: Real Admin View */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4">
              <span className="text-xs font-black uppercase text-black/40 dark:text-white/40 tracking-widest flex items-center gap-1.5">
                <Shield size={14} className="text-red-500" /> Frame 1: Real Admin View
              </span>
              <span className="bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-widest">Live Control</span>
            </div>

            {/* Custom Styled Mobile Simulator Frame */}
            <div className="relative mx-auto max-w-[340px] h-[640px] bg-[#111] dark:bg-[#050505] rounded-[3.5rem] border-[12px] border-[#222] shadow-2xl overflow-hidden flex flex-col group transition-all duration-300 hover:border-[#1c1c1c]">
              {/* Notch Bar / Camera Gloss */}
              <div className="absolute top-0 inset-x-0 h-6 bg-black z-50 flex items-center justify-between px-6 text-[8px] font-black text-white/40 font-mono">
                <span>9:41 AM</span>
                <div className="w-16 h-4 bg-black rounded-b-xl mx-auto border-x border-b border-white/5 relative flex items-center justify-center">
                  <span className="w-2.5 h-2.5 bg-[#0a0a0a] rounded-full border border-white/10 shrink-0" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Activity size={8} className="text-primary animate-pulse" />
                  <span>5G</span>
                </div>
              </div>

              {/* Screen Content Scrollable */}
              <div className="flex-1 overflow-y-auto bg-[#17171d] pt-8 px-4 pb-12 text-white font-sans space-y-4">
                {/* Simulated Screen Title */}
                <div className="pt-2 border-b border-white/5 pb-3">
                  <div className="flex items-center gap-1">
                    <Shield size={10} className="text-[#32befa]" />
                    <span className="text-[9px] font-black uppercase text-[#32befa] tracking-widest">Active System Controller</span>
                  </div>
                  <h4 className="text-sm font-black uppercase tracking-tight mt-0.5">Admin Control Hub</h4>
                </div>

                {/* Target Information Card */}
                {targetPlayer ? (
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center gap-3">
                      <img src={targetPlayer.avatarUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed= Felix"} className="w-9 h-9 border border-white/20 rounded-xl" referrerPolicy="no-referrer" />
                      <div>
                        <h5 className="text-xs font-black uppercase leading-none">{targetPlayer.name}</h5>
                        <p className="text-[7px] text-[#32befa] font-mono mt-1 uppercase">ID: {targetPlayer.id}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-2">
                      <div className="text-center bg-white/5 rounded-xl p-1.5 border border-white/5">
                        <span className="text-[7px] text-white/40 block">COINS</span>
                        <span className="text-[10px] font-extrabold text-[#32befa]">{targetPlayer.raheeCoins || 0}</span>
                      </div>
                      <div className="text-center bg-white/5 rounded-xl p-1.5 border border-white/5">
                        <span className="text-[7px] text-white/40 block">XP</span>
                        <span className="text-[10px] font-extrabold text-primary">{targetPlayer.xp || 0}</span>
                      </div>
                      <div className="text-center bg-white/5 rounded-xl p-1.5 border border-white/5">
                        <span className="text-[7px] text-white/40 block">LIVES</span>
                        <span className="text-[10px] font-extrabold text-red-400">{targetPlayer.lives?.count || 0}/16</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] opacity-40 text-center">No player selected under monitor.</p>
                )}

                {/* DB Context Quick Injector Form */}
                {targetPlayer && (
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3">
                    <span className="text-[8px] font-black uppercase text-white/40 tracking-widest block">Personalize DB Context Contextually</span>
                    
                    <div className="space-y-1.5">
                      <label className="text-[7px] font-bold text-white/40 uppercase">Assigned Path Context</label>
                      <input 
                        type="text" 
                        value={selectedPlayerCustomPath}
                        onChange={e => setSelectedPlayerCustomPath(e.target.value)}
                        placeholder="e.g. users/user_id/niche"
                        className="w-full text-[9px] px-2.5 py-1.5 rounded-xl bg-black border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-[#32befa] font-mono"
                      />
                    </div>

                    <button 
                      onClick={handleAssignPlayerPath}
                      className="w-full py-2 bg-[#32befa] hover:bg-[#32befa]/90 text-black text-[8px] font-black uppercase tracking-widest rounded-xl transition-all"
                    >
                      Apply Context Path
                    </button>
                  </div>
                )}

                {/* Notifications Live Audit Tracing Ledger */}
                <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase text-white/40 tracking-widest block">FCM Tracing Logs</span>
                    <span className="animate-ping w-1.5 h-1.5 bg-green-500 rounded-full" />
                  </div>

                  <div className="space-y-2 max-h-[180px] overflow-y-auto">
                    {simulatedNotificationLogs.map(log => (
                      <div key={`notif-trace-${log.id}`} className="p-2.5 bg-black/40 rounded-xl border border-white/5 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className={`text-[6px] font-extrabold uppercase px-1 py-0.5 rounded ${
                            log.type === 'approval_success' ? 'bg-green-500/20 text-green-400 border border-green-500/10' :
                            log.type === 'testing_mode' ? 'bg-[#32befa]/20 text-[#32befa] border border-[#32befa]/10' :
                            'bg-primary/20 text-primary border border-primary/10'
                          }`}>{log.type}</span>
                          <span className="text-[6px] text-white/20 font-mono">{log.time}</span>
                        </div>
                        <h6 className="text-[9px] font-bold text-white/95">{log.title}</h6>
                        <p className="text-[7px] text-white/40 leading-tight">{log.body}</p>
                        <div className="flex items-center justify-between text-[6px] text-white/30 border-t border-white/5 pt-1 mt-1 font-mono">
                          <span>Rcvr: {log.player}</span>
                          <span className="uppercase text-green-500">✔ {log.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
              
              {/* Home bar glass simulator */}
              <div className="absolute bottom-1 inset-x-0 h-4 bg-transparent flex items-center justify-center pointer-events-none">
                <div className="w-24 h-1 bg-white/20 rounded-full" />
              </div>
            </div>
          </div>

          {/* FRAME 2: Player POV of Game */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-4">
              <span className="text-xs font-black uppercase text-black/40 dark:text-white/40 tracking-widest flex items-center gap-1.5">
                <Tv size={14} className="text-[#32befa]" /> Frame 2: Player Live POV Simulation
              </span>
              <span className="bg-[#32befa]/10 text-[#32befa] border border-[#32befa]/20 px-2 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-widest animate-pulse">Live Feed</span>
            </div>

            {/* Custom Styled Mobile Simulator Frame */}
            <div className={`relative mx-auto max-w-[340px] h-[640px] rounded-[3.5rem] border-[12px] border-[#222] shadow-2xl overflow-hidden flex flex-col group transition-all duration-300 hover:border-[#1c1c1c] ${isDark ? 'bg-black border-[#222]' : 'bg-white border-[#ddd]'}`}>
              {/* Notch Bar / Camera Gloss */}
              <div className="absolute top-0 inset-x-0 h-6 bg-black z-50 flex items-center justify-between px-6 text-[8px] font-black text-white/40 font-mono">
                <span>9:41 AM</span>
                <div className="w-16 h-4 bg-black rounded-b-xl mx-auto border-x border-b border-white/5 relative flex items-center justify-center">
                  <span className="w-2.5 h-2.5 bg-[#0a0a0a] rounded-full border border-white/10 shrink-0" />
                </div>
                <div className="flex items-center gap-1.5 flex-row-reverse">
                  <span>100%</span>
                  <Activity size={8} className="text-[#32befa]" />
                </div>
              </div>

              {/* Live Render Area based on player's activeState */}
              <div className="flex-1 overflow-y-auto pt-8 px-4 pb-12 flex flex-col text-black dark:text-white bg-white dark:bg-[#050505]">
                {targetPlayer ? (
                  <div className="flex-1 flex flex-col space-y-4 pt-2">
                    
                    {/* Simulator Header */}
                    <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
                      <div className="flex items-center gap-2">
                        <img src={targetPlayer.avatarUrl || "https://api.dicebear.com/7.x/avataaars/svg?seed=Buddy"} className="w-7 h-7 rounded-lg border border-black/5 dark:border-white/10" referrerPolicy="no-referrer" />
                        <div>
                          <p className="text-[10px] font-black leading-none uppercase">{targetPlayer.name}</p>
                          <p className="text-[6px] text-black/40 dark:text-white/40 leading-none mt-1">Tier: {targetPlayer.tier || 'Starter'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 bg-black/5 dark:bg-white/5 px-2 py-1 rounded-xl">
                        <Coins size={10} className="text-yellow-500" />
                        <span className="text-[9px] font-black">{targetPlayer.raheeCoins || 0}</span>
                      </div>
                    </div>

                    {/* DYNAMIC SCREEN PREVIEW BODY BASED ON REALTIME ACTIVE VIEW STATE */}
                    {activeState.showSettings ? (
                      /* SIMULATED SETTINGS OVERLAY */
                      <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-3 flex-1">
                        <div className="flex items-center justify-between border-b border-current/10 pb-1">
                          <h5 className="text-[10px] font-black uppercase text-[#32befa]">Settings Menu</h5>
                          <span className="text-[6px] px-1 bg-red-500/10 text-red-500 font-bold uppercase rounded">OPENED</span>
                        </div>
                        <div className="space-y-2">
                          <div className="p-2 bg-white/45 dark:bg-black/40 rounded-xl flex items-center justify-between text-[8px] font-bold">
                            <span>BGM Soundtracks</span>
                            <span className="text-green-500 uppercase">ACTIVE</span>
                          </div>
                          <div className="p-2 bg-white/45 dark:bg-black/40 rounded-xl flex items-center justify-between text-[8px] font-bold">
                            <span>Dark Mode skin</span>
                            <span>{isDark ? 'ON' : 'OFF'}</span>
                          </div>
                          <div className="p-2 bg-white/45 dark:bg-black/40 rounded-xl flex items-center justify-between text-[8px] font-bold">
                            <span>Ambient Light Detector</span>
                            <span className="text-white/40">DISABLED</span>
                          </div>
                        </div>
                      </div>
                    ) : activeState.showQuiz || activeState.activeExamId ? (
                      /* SIMULATED ACTIVE QUIZ MODE */
                      <div className="bg-[#32befa]/5 p-4 rounded-2xl border border-[#32befa]/20 space-y-3 flex-1 flex flex-col justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[6px] font-black uppercase text-[#32befa]">
                            <span>ACTIVE QUIZ ARENA</span>
                            <span>ROUND {targetPlayer.currentRound || 1}</span>
                          </div>
                          <h5 className="text-xs font-black uppercase tracking-tight mt-1 leading-snug">
                            {activeState.activeExamId ? "Official Exam Event" : "Standard Multi-Topic Niche Arena"}
                          </h5>
                          <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-full mt-2 overflow-hidden">
                            <div className="w-[45%] h-full bg-[#32befa]" />
                          </div>
                        </div>

                        <div className="space-y-1.5 p-2 bg-black/5 rounded-xl border border-black/5 text-[8px] font-bold leading-normal text-black/70 dark:text-white/70">
                          <p className="text-[9px] font-black text-black dark:text-white mb-1">Q: Select the correct answer?</p>
                          <div className="p-1 px-2.5 rounded bg-[#32befa] text-black font-extrabold flex justify-between">
                            <span>Option A</span>
                            <span>45% Selected</span>
                          </div>
                          <div className="p-1 px-2.5 rounded bg-black/5 dark:bg-white/5 flex justify-between">
                            <span>Option B</span>
                            <span>20%</span>
                          </div>
                        </div>

                        <p className="text-[6px] text-white/40 uppercase tracking-widest text-center font-bold">Timer: 29:32 Remaining</p>
                      </div>
                    ) : activeState.activeTab === 'shop' || activeState.showRaheePass ? (
                      /* SIMULATED COINS ARENA SHOP */
                      <div className="bg-yellow-500/5 p-4 rounded-2xl border border-yellow-500/20 space-y-3 flex-1">
                        <div className="flex items-center justify-between border-b border-yellow-500/10 pb-1">
                          <h5 className="text-[10px] font-black uppercase text-yellow-500">Shop Store</h5>
                          <span className="text-[6px] text-yellow-500 font-extrabold uppercase">50% DISCOUNT</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-white/5 border border-black/5 dark:border-white/5 rounded-xl p-2 text-center text-[8px] font-black space-y-1">
                            <span className="block text-[6px] text-yellow-500">FULL REFILL</span>
                            <span>Health Refill</span>
                            <span className="block mt-1 font-mono text-[#32befa]">500 Cc</span>
                          </div>
                          <div className="bg-white/5 border border-black/5 dark:border-white/5 rounded-xl p-2 text-center text-[8px] font-black space-y-1">
                            <span className="block text-[6px] text-purple-400">RAHEE PASS</span>
                            <span>Premium Season</span>
                            <span className="block mt-1 font-mono text-[#32befa]">1200 Cc</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* SIMULATED REGULAR HOME SCREEN VIEW */
                      <div className="space-y-3 flex-1 flex flex-col justify-between">
                        <div className="bg-black/5 dark:bg-[#111] p-4 rounded-2xl border border-black/5 dark:border-white/5 space-y-2 text-center">
                          <div className="w-10 h-10 rounded-full mx-auto bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                            <Activity size={18} className="animate-spin" />
                          </div>
                          <h5 className="text-xs font-black uppercase text-black dark:text-white leading-none tracking-tight">RAHEE ARENA QUIZ</h5>
                          <span className="text-[6px] font-black uppercase text-[#32befa] tracking-widest block">Level {Math.ceil((targetPlayer.xp || 0) / 1000) || 1} Challenger</span>
                        </div>

                        <div className="p-3.5 bg-[#32befa]/5 rounded-xl border border-[#32befa]/10 flex items-center justify-between">
                          <div className="text-left">
                            <span className="text-[6px] font-black uppercase text-white/40 tracking-widest block">SELECTED TOPIC</span>
                            <span className="text-[10px] font-black leading-tight block truncate mt-0.5">
                              {topics.find(t => t.id === targetPlayer.selectedTopicId)?.name || 'General Knowledge'}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-[#32befa] text-black text-[6px] font-black uppercase">PLAY NOW</span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center text-[6px] text-black/40 dark:text-white/40 font-bold uppercase">
                            <span>EXP Progression</span>
                            <span>{(targetPlayer.xp || 0) % 1000}/1000 XP</span>
                          </div>
                          <div className="w-full h-1 bg-black/15 dark:bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${((targetPlayer.xp || 0) % 1000) / 10}%` }} />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Sim Bottom Navigation Representation */}
                    <div className="grid grid-cols-5 gap-0.5 text-center border-t border-black/5 dark:border-white/5 pt-2 text-[6px] font-black uppercase tracking-wider text-black/40 dark:text-white/40 select-none">
                      <span className={activeState.activeTab === 'home' ? 'text-[#32befa]' : ''}>HOME</span>
                      <span className={activeState.activeTab === 'friends' ? 'text-[#32befa]' : ''}>FRIENDS</span>
                      <span className={activeState.activeTab === 'leaderboard' ? 'text-[#32befa]' : ''}>TROPHY</span>
                      <span className={activeState.activeTab === 'events' ? 'text-[#32befa]' : ''}>EVENTS</span>
                      <span className={activeState.activeTab === 'shop' || activeState.showRaheePass ? 'text-[#32befa]' : ''}>SHOP</span>
                    </div>

                  </div>
                ) : (
                  <p className="text-[10px] opacity-40 text-center m-auto">Please wait while device synchronizes...</p>
                )}
              </div>

              {/* Home bar glass simulator */}
              <div className="absolute bottom-1 inset-x-0 h-4 bg-transparent flex items-center justify-center pointer-events-none">
                <div className="w-24 h-1 bg-white/20 rounded-full" />
              </div>
            </div>
          </div>

        </div>

        {/* SECTION 2: Circular Animated DB Orbit View */}
        <div className="bg-black/5 dark:bg-[#111] p-8 md:p-12 rounded-[2.5rem] border border-black/5 dark:border-white/5 space-y-10">
          <div className="space-y-1 text-center max-w-xl mx-auto">
            <span className="text-[10px] font-black uppercase text-primary tracking-widest block">Circular Node Ring Visualizer</span>
            <h3 className="text-2xl font-black uppercase tracking-tight text-black dark:text-white">RTDB Orbit Dashboard</h3>
            <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mb-4">Click node spheres to crawl, add, edit & destroy nested schema values in real-time.</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-10 items-center">
            
            {/* LEFT / CENTER: The Orbit SVG & interactive floating spheres */}
            <div className="xl:col-span-2 flex flex-col items-center justify-center p-6 bg-black/10 dark:bg-black/40 rounded-[2rem] border border-black/5 dark:border-white/5 min-h-[440px] relative overflow-hidden select-none">
              
              {/* Radial Orbit Lines Backdrop SVG */}
              <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                <svg className="w-[380px] h-[380px] text-primary/30 dark:text-primary/10" viewBox="0 0 400 400">
                  <circle cx="200" cy="200" r="150" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 6" className="animate-[spin_120s_linear_infinite]" />
                  <circle cx="200" cy="200" r="100" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 4" className="animate-[spin_60s_linear_infinite_reverse]" />
                  <circle cx="200" cy="200" r="60" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
                  <line x1="200" y1="50" x2="200" y2="350" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 8" />
                  <line x1="50" y1="200" x2="350" y2="200" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 8" />
                </svg>
              </div>

              {/* Rotating glowing central ring node */}
              <motion.button 
                whileHover={{ scale: 1.1 }}
                onClick={() => setOrbitActivePath('')}
                className="w-24 h-24 rounded-full bg-gradient-to-tr from-primary to-[#32befa] text-black border-4 border-black/10 dark:border-white/10 shadow-[0_0_40px_rgba(var(--primary-color),0.4)] flex flex-col items-center justify-center z-20 cursor-pointer relative"
              >
                <div className="absolute inset-0 rounded-full animate-ping bg-primary/20" />
                <Database size={24} />
                <span className="text-[8px] font-black uppercase mt-1 tracking-widest">RTDB CORE</span>
                <span className="text-[6px] font-mono opacity-80 mt-0.5">/{orbitActivePath.split('/').filter(Boolean).slice(-1)[0] || 'root'}</span>
              </motion.button>

              {/* Circular floating nodes list placement */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {nodesList.map((node, index) => {
                  const angle = (index / Math.max(1, nodesList.length)) * 360;
                  const radius = nodesList.length > 8 ? 140 : 120;
                  const rad = (angle * Math.PI) / 180;
                  const x = Math.cos(rad) * radius;
                  const y = Math.sin(rad) * radius;

                  const isPrimitive = typeof node.val !== 'object' || node.val === null;

                  return (
                    <motion.div
                      key={`orbit-node-${node.key}-${index}`}
                      initial={{ scale: 0, x: 0, y: 0 }}
                      animate={{ scale: 1, x, y }}
                      transition={{ type: 'spring', damping: 15, delay: index * 0.05 }}
                      className="absolute pointer-events-auto"
                    >
                      <motion.button
                        whileHover={{ scale: 1.15, zIndex: 50 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={async () => {
                          if (isPrimitive) {
                            // If primitive, open inline value editor
                            const currentFullPath = orbitActivePath ? `${orbitActivePath.replace(/^\/+|\/+$/g, '')}/${node.key}` : node.key;
                            setEditingNodePath(currentFullPath);
                            setEditingNodeVal(String(node.val));
                          } else {
                            // Deep-dive inside this nested schema node
                            const nextPath = orbitActivePath ? `${orbitActivePath.replace(/^\/+|\/+$/g, '')}/${node.key}` : node.key;
                            setOrbitActivePath(nextPath);
                          }
                        }}
                        className={`w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center p-1 cursor-pointer transition-all duration-300 relative ${
                          isPrimitive 
                            ? 'bg-[#111] dark:bg-black border-[#32befa]/50 text-[#32befa] hover:border-[#32befa] shadow-[0_0_15px_rgba(50,190,250,0.1)]' 
                            : 'bg-primary/10 border-primary/40 text-primary hover:border-primary shadow-[0_0_20px_rgba(var(--primary-color),0.15)]'
                        }`}
                        title={`Key: ${node.key}\nValue: ${isPrimitive ? String(node.val) : 'Object'}`}
                      >
                        <span className="text-[8px] font-black uppercase truncate w-full text-center px-0.5 leading-none">{node.key}</span>
                        <span className="text-[6px] opacity-60 font-mono mt-1 block truncate w-full text-center max-w-[50px]">
                          {isPrimitive ? String(node.val) : 'Object {}'}
                        </span>

                        {/* Quick Delete Node Hover Option */}
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteOrbitNode(node.key);
                          }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[8px] border border-black/20 hover:scale-110 active:scale-90 shadow cursor-pointer"
                          title="Delete this node key"
                        >
                          ✕
                        </div>
                      </motion.button>
                    </motion.div>
                  );
                })}

                {nodesList.length === 0 && (
                  <div className="absolute text-center text-white/40">
                    <p className="text-[10px] font-black uppercase tracking-wider">Empty Node Schema</p>
                  </div>
                )}
              </div>

              {/* Breadcrumbs for navigation navigation path */}
              <div className="absolute bottom-4 inset-x-4 flex items-center justify-center gap-1.5 text-[8px] font-bold text-white/40 uppercase tracking-widest font-mono flex-wrap">
                <button onClick={() => setOrbitActivePath('')} className="hover:text-primary transition-all">root</button>
                {orbitActivePath.split('/').filter(Boolean).map((chunk, cIdx, arr) => (
                  <React.Fragment key={`crumb-${cIdx}`}>
                    <span>/</span>
                    <button 
                      onClick={() => {
                        const nextSlice = arr.slice(0, cIdx + 1).join('/');
                        setOrbitActivePath(nextSlice);
                      }}
                      className="hover:text-primary transition-all text-white/70"
                    >
                      {chunk}
                    </button>
                  </React.Fragment>
                ))}
              </div>

            </div>

            {/* RIGHT: Node Controls Panel */}
            <div className="space-y-6 bg-black/10 dark:bg-black/30 p-6 rounded-[2rem] border border-black/5 dark:border-white/5">
              <div className="border-b border-black/10 dark:border-white/10 pb-4">
                <span className="text-[9px] font-black uppercase text-primary tracking-widest block">Configure Path Context</span>
                <h4 className="text-lg font-black uppercase text-black dark:text-white leading-none mt-1">Orbit Path Controller</h4>
                
                {/* Active Path Context Bar */}
                <div className="flex items-center gap-2 bg-white dark:bg-black px-4 py-2.5 rounded-2xl border border-black/5 dark:border-white/5 mt-3">
                  <span className="text-[10px] text-black/50 dark:text-white/50 font-mono select-all">/{orbitActivePath || 'root'}</span>
                  {orbitActivePath && (
                    <button
                      onClick={() => {
                        const arr = orbitActivePath.split('/').filter(Boolean);
                        arr.pop();
                        setOrbitActivePath(arr.join('/'));
                      }}
                      className="ml-auto px-2.5 py-1 bg-white/10 hover:bg-white/15 dark:bg-black dark:hover:bg-white/5 text-[8px] font-black uppercase tracking-widest text-[#32befa] rounded-xl border border-white/5"
                    >
                      Up Level
                    </button>
                  )}
                </div>
              </div>

              {/* Inline editor overlay when targeting a variable key */}
              {editingNodePath ? (
                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black uppercase text-primary">Editing Node Value</span>
                    <button onClick={() => setEditingNodePath(null)} className="text-black/40 dark:text-white/40 hover:text-white">✕</button>
                  </div>
                  <p className="text-[8px] font-mono text-black/40 dark:text-white/40">Path: {editingNodePath}</p>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-black/50 dark:text-white/40 uppercase ml-2 block">Value</label>
                    <textarea 
                      value={editingNodeVal}
                      onChange={e => setEditingNodeVal(e.target.value)}
                      placeholder="Enter value or JSON structure"
                      rows={3}
                      className="w-full text-xs px-3 py-2 rounded-xl bg-white dark:bg-black border border-black/10 dark:border-white/10 text-black dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <button 
                    onClick={handleUpdateOrbitNode}
                    className="w-full py-2.5 bg-primary text-black font-black uppercase tracking-widest text-[9px] rounded-xl active:scale-95 transition-all"
                  >
                    Commit Updated Value
                  </button>
                </div>
              ) : (
                /* Add a sub-node under the focused directory path context */
                <div className="space-y-4">
                  <span className="text-[9px] font-black uppercase text-[#32befa] tracking-widest block">Create Sub-Node Here</span>
                  
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-black/40 dark:text-white/40 uppercase ml-2 block">Key / Node Name</label>
                      <input 
                        type="text" 
                        value={newOrbitNodeName}
                        onChange={e => setNewOrbitNodeName(e.target.value)}
                        placeholder="e.g. nicheCategory"
                        className="w-full text-xs px-3.5 py-2.5 rounded-2xl bg-white dark:bg-black border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-[#32befa]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-extrabold text-black/40 dark:text-white/40 uppercase ml-2 block">Value (String, Number, Bool, or JSON)</label>
                      <input 
                        type="text" 
                        value={newOrbitNodeVal}
                        onChange={e => setNewOrbitNodeVal(e.target.value)}
                        placeholder="e.g. General or true or 15"
                        className="w-full text-xs px-3.5 py-2.5 rounded-2xl bg-white dark:bg-black border border-black/10 dark:border-white/10 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-[#32befa] font-mono"
                      />
                    </div>

                    <button 
                      onClick={handleAddOrbitNode}
                      className="w-full py-3.5 bg-[#32befa] hover:bg-[#32befa]/90 text-black text-xs font-black uppercase tracking-widest rounded-2xl transition-all border border-[#32befa]/20 shadow-lg active:scale-95"
                    >
                      Assign Node
                    </button>
                  </div>
                </div>
              )}

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
                      realPlayers.map((u, uIdx) => (
                        <motion.div 
                          key={`real-player-${u.id || uIdx}-${uIdx}`} 
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => setSelectedUser(u)}
                          className="w-full bg-white dark:bg-[#111] p-4 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between hover:border-primary/20 transition-all group cursor-pointer shadow-sm"
                        >
                          <div className="text-left flex-1">
                            <div className="flex items-center justify-between">
                              <p className="font-bold flex items-center gap-1.5 text-black dark:text-white text-sm truncate">
                                <span className="truncate">{u.name}</span>
                                {u.isOnline ? (
                                  <span className="flex items-center gap-1 bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-emerald-500/10 shrink-0">
                                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                                    ONLINE
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-black/5 dark:border-white/5 shrink-0">
                                    <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
                                    OFFLINE
                                  </span>
                                )}
                                {u.status === 'pending' && <span className="text-[8px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest shrink-0">PENDING</span>}
                                {u.extraTriesRequested && <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest shrink-0">RESET REQ</span>}
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
                       botsList.map((b, bIdx) => (
                          <motion.div 
                            key={`bot-${b.id || bIdx}-${bIdx}`} 
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
                    <div className="space-y-1 col-span-2">
                      <label className="flex items-center gap-2 text-xs font-bold text-black/70 dark:text-white/70 cursor-pointer ml-1 select-none">
                        <input 
                          type="checkbox"
                          checked={newTopic.disableMultiSelect || false}
                          onChange={e => setNewTopic({...newTopic, disableMultiSelect: e.target.checked})}
                          className="rounded border-black/10 dark:border-white/10 text-primary focus:ring-primary"
                        />
                        Disable Multi-Select (Players cannot select this topic in multi-selection mode)
                      </label>
                    </div>
                    <button onClick={addTopic} className="bg-primary text-black font-black uppercase tracking-widest py-4 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all md:col-span-2">
                      CREATE TOPIC
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/5 p-6 rounded-3xl border border-black/10 dark:border-white/10">
                     {topicPath.length === 0 && (
                        <div className="col-span-full bg-primary/5 p-4 rounded-2xl border border-primary/20 mb-2 space-y-4">
                           <p className="text-xs font-black text-primary uppercase tracking-wider">Edit Root Topic Settings</p>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="space-y-1">
                                 <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 ml-1">Topic Name</label>
                                 <input 
                                   value={currentTopic?.name || ''}
                                   onChange={async e => {
                                      if (currentTopic) {
                                         await update(ref(db, `topics/${currentTopic.id}`), { name: e.target.value });
                                      }
                                   }}
                                   className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-black dark:text-white"
                                 />
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 ml-1">Sequence Order</label>
                                 <input 
                                   type="number"
                                   value={currentTopic?.order ?? 0}
                                   onChange={async e => {
                                      if (currentTopic) {
                                         await update(ref(db, `topics/${currentTopic.id}`), { order: parseInt(e.target.value) || 0 });
                                      }
                                   }}
                                   className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-black dark:text-white"
                                 />
                              </div>
                              <div className="col-span-full">
                                 <label className="flex items-center gap-2 text-xs font-bold text-black/70 dark:text-white/70 cursor-pointer ml-1 select-none">
                                   <input 
                                     type="checkbox"
                                     checked={currentTopic?.disableMultiSelect || false}
                                     onChange={async e => {
                                        if (currentTopic) {
                                           await update(ref(db, `topics/${currentTopic.id}`), { disableMultiSelect: e.target.checked });
                                        }
                                     }}
                                     className="rounded border-black/10 dark:border-white/10 text-primary focus:ring-primary"
                                   />
                                   Disable Multi-Select for this root topic
                                 </label>
                              </div>
                           </div>
                        </div>
                     )}
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
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 text-xs font-bold text-black/70 dark:text-white/70 cursor-pointer ml-1 select-none py-1">
                            <input 
                              type="checkbox"
                              checked={newNode.disableMultiSelect || false}
                              onChange={e => setNewNode({...newNode, disableMultiSelect: e.target.checked})}
                              className="rounded border-black/10 dark:border-white/10 text-primary focus:ring-primary"
                            />
                            Disable Multi-Select
                          </label>
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
                                      setNewNode({ id: child.id, name: child.name, description: child.description || '', order: child.order || 0, disableMultiSelect: child.disableMultiSelect || false });
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
          const durationHours = parseInt(newEvent.durationHours) || 0;
          const durationMinutes = parseInt(newEvent.durationMinutes) || 0;
          const isImmediate = !newEvent.startTime && !newEvent.endTime && (durationHours > 0 || durationMinutes > 0);

          if (!newEvent.title || !newEvent.topicId || (!newEvent.startTime && !isImmediate)) {
            await alert({
              title: "Incomplete Fields",
              description: 'Fill all fields. (To start immediately, leave Start and End times blank and configure Duration).',
              type: 'error'
            });
            return;
          }
          const eventId = `event-${Date.now()}`;
          const startTime = newEvent.startTime ? new Date(newEvent.startTime).getTime() : Date.now();
          const totalDurationMs = (durationHours * 60 * 60 * 1000) + (durationMinutes * 60 * 1000);
          let endTime = newEvent.endTime ? new Date(newEvent.endTime).getTime() : (startTime + totalDurationMs);
          
          const event = {
            id: eventId,
            title: newEvent.title,
            description: newEvent.description,
            topicId: newEvent.topicId,
            topicIds: newEvent.topicIds || [],
            questionStartRange: newEvent.questionStartRange || '',
            questionEndRange: newEvent.questionEndRange || '',
            difficultyFilter: newEvent.difficultyFilter || 'all',
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
            createdAt: Date.now(),
            isImmediate: isImmediate,
            isTesting: newEvent.isTesting,
            selectedPlayers: newEvent.selectedPlayers
          };
          
          await set(ref(db, `events/${eventId}`), event);

          // Send FCM notifications instantly for immediate events or testing events
          if ((isImmediate || newEvent.isTesting) && serviceAccount) {
            try {
              const regTitle = newEvent.isTesting 
                ? `[TESTING MODE] New Exam: ${event.title}` 
                : `New Exam: ${event.title}`;
              const regBody = newEvent.isTesting 
                ? `Testing Event is active. Tap to view and test.` 
                : `Exam is starting immediately! Tap REGISTER NOW to join.`;
              const regPushData = {
                action_type: "exam_registration",
                examId: eventId,
                title: regTitle,
                body: regBody
              };

              const tokensSnap = await get(ref(db, 'fcmTokens'));
              let targetTokens: string[] = [];

              if (tokensSnap.exists()) {
                const allTokensVal = tokensSnap.val();
                
                if (newEvent.isTesting) {
                  // Determine allowed notification recipients
                  const allowedUserIds = new Set<string>();
                  if (newEvent.selectedPlayers && newEvent.selectedPlayers.length > 0) {
                    newEvent.selectedPlayers.forEach(id => allowedUserIds.add(id));
                  } else {
                    // Default solely to the Admin creating/testing this event if none selected
                    allowedUserIds.add(adminUser?.id || '');
                  }

                  Object.entries(allTokensVal).forEach(([userId, userMap]: [string, any]) => {
                    if (allowedUserIds.has(userId)) {
                      const tokens = NotificationService.getTokensFromValue(userMap);
                      tokens.forEach(t => targetTokens.push(t));
                    }
                  });
                } else {
                  // Standard immediate broadcast: collect all users' tokens
                  const uniqueTokens = new Set<string>();
                  Object.values(allTokensVal).forEach((userMap: any) => {
                    const tokens = NotificationService.getTokensFromValue(userMap);
                    tokens.forEach(t => uniqueTokens.add(t));
                  });
                  targetTokens = Array.from(uniqueTokens);
                }
              }

              // Only broadcast globally to all users if NOT under testing mode!
              if (!newEvent.isTesting) {
                await NotificationService.sendToAll(serviceAccount, regTitle, regBody, undefined, regPushData);
              }

              // Send to resolved individual target devices
              for (const token of targetTokens) {
                try {
                  await NotificationService.sendToToken(serviceAccount, token, regTitle, regBody, undefined, regPushData);
                } catch (err) {
                  // silent error
                }
              }
            } catch (notifErr) {
              console.error("Failed sending immediate event notifications:", notifErr);
            }
          }

          setNewEvent({ 
            title: '', description: '', topicId: '', topicIds: [], questionStartRange: '', questionEndRange: '', difficultyFilter: 'all', startTime: '', endTime: '', durationHours: '1', durationMinutes: '0', 
            isTesting: false, selectedPlayers: [], type: 'test',
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

                            {quizTopicPath.length > 0 && (
                               <div className="pt-2 border-t border-black/5 dark:border-white/5 flex gap-2">
                                 <button
                                   type="button"
                                   onClick={() => {
                                     const currentTopic = quizTopicPath[quizTopicPath.length - 1];
                                     if (currentTopic && currentTopic.id) {
                                       const currentIds = newEvent.topicIds || [];
                                       if (currentIds.includes(currentTopic.id)) {
                                         setNewEvent({ ...newEvent, topicIds: currentIds.filter(id => id !== currentTopic.id) });
                                       } else {
                                         setNewEvent({ ...newEvent, topicIds: [...currentIds, currentTopic.id] });
                                       }
                                     }
                                   }}
                                   className="w-full py-2 px-3 bg-primary/20 border border-primary/20 hover:bg-primary hover:text-black hover:border-transparent text-[10px] font-black uppercase text-primary tracking-wider rounded-xl transition-all"
                                 >
                                   {newEvent.topicIds?.includes(quizTopicPath[quizTopicPath.length - 1]?.id) 
                                     ? "✓ Topic Pool (Click to Remove)" 
                                     : `+ Add "${quizTopicPath[quizTopicPath.length - 1]?.name}" to Topic Pool`}
                                 </button>
                               </div>
                            )}

                            {/* Live Selected Pool Topics */}
                            <div className="space-y-1 pt-2 border-t border-black/5 dark:border-white/5">
                               <label className="text-[9px] font-black uppercase text-black/40 dark:text-white/40 block">Event Quiz Pool Topics</label>
                               <div className="flex flex-wrap gap-1 bg-black/5 dark:bg-white/5 p-2 rounded-xl min-h-[36px] items-center">
                                 {(!newEvent.topicIds || newEvent.topicIds.length === 0) ? (
                                   <span className="text-[9px] font-bold text-black/30 dark:text-white/30 italic px-1">
                                     {quizTopicPath.length > 0 
                                       ? `Single Topic Mode: ${quizTopicPath[quizTopicPath.length - 1].name}` 
                                       : "No topics added. Please select topics."}
                                   </span>
                                 ) : (
                                   newEvent.topicIds.map(tid => {
                                     const name = getTopicName(tid);
                                     return (
                                       <div key={tid} className="flex items-center gap-1 bg-primary/20 border border-primary/20 text-primary px-2 py-0.5 rounded-full text-[9px] font-bold">
                                         <span>{name}</span>
                                         <button
                                           type="button"
                                           onClick={() => {
                                             const updated = (newEvent.topicIds || []).filter(id => id !== tid);
                                             setNewEvent({ ...newEvent, topicIds: updated });
                                           }}
                                           className="ml-1 text-[11px] leading-none text-primary hover:text-red-500 font-bold"
                                         >
                                           &times;
                                         </button>
                                       </div>
                                     );
                                   })
                                 )}
                               </div>
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
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                           <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Duration (Minutes)</label>
                           <input 
                             type="number"
                             value={newEvent.durationMinutes || '0'}
                             onChange={e => setNewEvent({...newEvent, durationMinutes: e.target.value})}
                             className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                             min="0"
                             max="59"
                             placeholder="Minutes"
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

                      <div className="grid grid-cols-2 gap-4 border-t border-black/5 dark:border-white/5 pt-4">
                         <div className="space-y-1 col-span-2">
                            <span className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 block font-black">Question Range Filter (Optional)</span>
                            <span className="text-[8px] text-black/40 dark:text-white/40 block">Select a custom subset range from the quiz pool. Leave empty to include all questions.</span>
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">Start Question No.</label>
                            <input 
                              type="number"
                              value={newEvent.questionStartRange || ''}
                              onChange={e => setNewEvent({...newEvent, questionStartRange: e.target.value})}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                              placeholder="e.g. 1"
                              min="1"
                            />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2">End Question No.</label>
                            <input 
                              type="number"
                              value={newEvent.questionEndRange || ''}
                              onChange={e => setNewEvent({...newEvent, questionEndRange: e.target.value})}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary"
                              placeholder="e.g. 10"
                              min="1"
                            />
                         </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 border-t border-black/5 dark:border-white/5 pt-4">
                         <div className="space-y-1">
                            <span className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 block font-black">Challenge Difficulty Filter</span>
                            <span className="text-[8px] text-black/40 dark:text-white/40 block">Select a specific item difficulty to allow in this event. Other difficulties will be automatically filtered out.</span>
                         </div>
                         <div className="space-y-1">
                            <select 
                              value={newEvent.difficultyFilter || 'all'}
                              onChange={e => setNewEvent({...newEvent, difficultyFilter: e.target.value})}
                              className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-black dark:text-white font-bold outline-none focus:border-primary text-xs"
                            >
                              <option value="all">Include All Difficulties (1-5)</option>
                              <option value="1">Difficulty 1 (Easy Only)</option>
                              <option value="2">Difficulty 2 (Medium-Easy Only)</option>
                              <option value="3">Difficulty 3 (Normal Only)</option>
                              <option value="4">Difficulty 4 (Hard Only)</option>
                              <option value="5">Difficulty 5 (Extremely Hard Only)</option>
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

                        {/* Testing Mode controls */}
                        <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-4">
                           <div className="flex items-center justify-between px-2">
                              <div>
                                 <span className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 block">Testing Exam / Event</span>
                                 <span className="text-[8px] text-black/40 dark:text-white/40 block mt-0.5">If active, only selected players see this event on their screen. If no players are selected, ONLY you (Admin) can see and test it.</span>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                 <input type="checkbox" checked={newEvent.isTesting} onChange={e => setNewEvent({...newEvent, isTesting: e.target.checked})} className="sr-only peer" />
                                 <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#32befa]"></div>
                              </label>
                           </div>
                           {true && (
                             <div className="space-y-2 bg-black/5 p-4 rounded-2xl border border-black/5 dark:border-white/5">
                                <label className="text-[10px] font-black uppercase text-black/30 dark:text-white/30 ml-2 block font-black">Targeted Event Visibility (Optional)</label>
                                <div className="max-h-40 overflow-y-auto space-y-1 border border-black/10 dark:border-white/10 rounded-xl p-2 bg-white dark:bg-black">
                                   {users.filter(u => !u.isBot).map(user => {
                                      const isSelected = newEvent.selectedPlayers?.includes(user.id) || false;
                                      return (
                                        <label key={`test-p-${user.id}`} className="flex items-center gap-2 px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg cursor-pointer text-xs font-bold text-black dark:text-white">
                                           <input 
                                             type="checkbox"
                                             checked={isSelected}
                                             onChange={() => {
                                               const currentSelected = newEvent.selectedPlayers || [];
                                               const updated = isSelected 
                                                 ? currentSelected.filter(id => id !== user.id)
                                                 : [...currentSelected, user.id];
                                               setNewEvent({...newEvent, selectedPlayers: updated});
                                             }}
                                             className="rounded border-black/10 text-[#32befa] focus:ring-[#32befa]"
                                           />
                                           <span>{user.name} (@{user.username})</span>
                                        </label>
                                      );
                                   })}
                                </div>
                                <p className="text-[8px] text-[#32befa] uppercase tracking-wider font-extrabold px-2">
                                  {(!newEvent.selectedPlayers || newEvent.selectedPlayers.length === 0) 
                                    ? "✓ Public Mode: All registered players can see and join this event" 
                                    : `Visibility Restricted: Visible only to Admin and ${newEvent.selectedPlayers.length} chosen user(s)`}
                                </p>
                             </div>
                           )}
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
                   {events.map((event, eIdx) => (
                      <div key={`event-card-${event.id || eIdx}-${eIdx}`} className="bg-black/5 dark:bg-[#111] p-6 rounded-3xl border border-black/5 dark:border-white/5 flex flex-col justify-between">
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
                    <div className="grid grid-cols-2 gap-3">
                      <select value={newQuiz.correct} onChange={e => setNewQuiz({...newQuiz, correct: parseInt(e.target.value)})} className="flex-1 bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl text-xs font-bold text-black/60 dark:text-white/60">
                        <option value={1}>Correct: Opt 1</option>
                        <option value={2}>Correct: Opt 2</option>
                        <option value={3}>Correct: Opt 3</option>
                        <option value={4}>Correct: Opt 4</option>
                      </select>
                      
                      <select value={newQuiz.difficulty || 3} onChange={e => setNewQuiz({...newQuiz, difficulty: parseInt(e.target.value)})} className="flex-1 bg-white dark:bg-black border border-black/5 dark:border-white/5 p-3 rounded-xl text-xs font-bold text-black/60 dark:text-white/60">
                        <option value={1}>Difficulty: 1 (Easy)</option>
                        <option value={2}>Difficulty: 2 (Medium-Easy)</option>
                        <option value={3}>Difficulty: 3 (Normal)</option>
                        <option value={4}>Difficulty: 4 (Hard)</option>
                        <option value={5}>Difficulty: 5 (Extremely Hard)</option>
                      </select>
                    </div>
                    
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
                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button onClick={addBulkQuizzes} className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white font-black p-4 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all">BATCH PROCESS</button>
                  {recentlyAddedQuizzes.length > 0 && (
                    <button 
                      onClick={deleteRecentlyAddedQuizzes} 
                      className="bg-red-500/10 hover:bg-red-500 border border-red-500/20 text-red-100 hover:text-white font-black p-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs uppercase"
                    >
                      <Trash2 size={16} /> Delete Last Batch ({recentlyAddedQuizzes.length})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* List Section */}
            <div className="space-y-4">
               {recentlyAddedQuizzes.length > 0 && (
                 <div className="p-6 bg-[#32befa]/5 rounded-[2rem] border border-[#32befa]/20 space-y-4">
                   <div className="flex items-center justify-between gap-4 flex-wrap">
                     <div>
                       <h4 className="font-black text-sm uppercase tracking-wider text-[#32befa] flex items-center gap-2">
                         <span className="w-2.5 h-2.5 bg-[#32befa] rounded-full animate-ping" />
                         Recently Added Quizzes ({recentlyAddedQuizzes.length})
                       </h4>
                       <p className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase">Quickly delete individual imported quizzes or undo the entire batch in one click</p>
                     </div>
                     <button
                       onClick={deleteRecentlyAddedQuizzes}
                       className="bg-red-500 hover:bg-red-600 text-white font-black px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition-all shadow-md flex items-center gap-2 cursor-pointer"
                     >
                       <Trash2 size={12} /> Delete Entire Batch
                     </button>
                   </div>
                   <div className="flex flex-wrap gap-2">
                     {recentlyAddedQuizzes.map((item) => (
                       <div key={`recent-badge-${item.topicId}-${item.id}`} className="flex items-center gap-1 bg-black/10 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3 py-1.5 rounded-full text-[10.5px] font-black text-black/80 dark:text-white/80">
                         <span>#{item.id} in "{item.topicId}"</span>
                         <button
                           onClick={() => deleteSingleRecentQuiz(item.topicId, item.id)}
                           className="text-red-400 hover:text-red-600 ml-1.5 cursor-pointer bg-red-500/10 hover:bg-red-500/20 p-1 rounded-full transition-all flex items-center justify-center"
                           title="Delete this quiz in one click"
                         >
                           <CloseIcon size={12} />
                         </button>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
               {/* Topic and Difficulty filter panel */}
               <div className="p-5 bg-black/5 dark:bg-[#111] rounded-[2rem] border border-black/5 dark:border-white/5 space-y-4">
                 <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                   <div>
                     <h4 className="font-black text-sm uppercase tracking-widest text-[#32befa]">Topic &amp; Challenge Difficulty Filters</h4>
                     <p className="text-[10px] text-black/40 dark:text-white/40 font-bold uppercase">Show quizzes only from selected topics or specific difficulty levels</p>
                   </div>
                   <div className="flex items-center gap-2 flex-wrap">
                      <select 
                        value={selectedFilterTopicId} 
                        onChange={e => setSelectedFilterTopicId(e.target.value)}
                        className="text-[10px] bg-white dark:bg-black border border-black/5 dark:border-white/5 p-2 rounded-xl text-xs font-black text-black/60 dark:text-white/60 outline-none focus:border-[#32befa] max-w-[200px] truncate"
                      >
                        <option value="all">View All Topics</option>
                        {allFlattenedTopics.map((t, idx) => (
                           <option key={`filter-t-${t.id || idx}-${idx}`} value={t.id}>{t.label}</option>
                        ))}
                      </select>

                      <select 
                        value={selectedFilterDifficulty} 
                        onChange={e => setSelectedFilterDifficulty(e.target.value)}
                        className="text-[10px] bg-white dark:bg-black border border-black/5 dark:border-white/5 p-2 rounded-xl text-xs font-black text-black/60 dark:text-white/60 outline-none focus:border-[#32befa]"
                      >
                        <option value="all">All Difficulties (1-5)</option>
                        <option value="1">Difficulty 1 (Easy)</option>
                        <option value="2">Difficulty 2 (Medium-Easy)</option>
                        <option value="3">Difficulty 3 (Normal)</option>
                        <option value="4">Difficulty 4 (Hard)</option>
                        <option value="5">Difficulty 5 (Extremely Hard)</option>
                      </select>
                   </div>
                 </div>
               </div>

               <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                 <h3 className="font-black text-sm uppercase tracking-widest text-black/40 dark:text-white/40">Registered Quizzes ({displayedQuizzes.length === quizzes.length ? quizzes.length : `${displayedQuizzes.length} matches / ${quizzes.length}`})</h3>
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
                      {allFlattenedTopics.map((t, idx) => (
                        <option key={`sel-${t.id || idx}-${idx}`} value={t.id} className="text-black bg-white dark:bg-zinc-900 dark:text-zinc-300">
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
                      {allFlattenedTopics.map((t, idx) => (
                        <option key={`desel-${t.id || idx}-${idx}`} value={t.id} className="text-black bg-white dark:bg-zinc-900 dark:text-zinc-300">
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
                         {allFlattenedTopics.map((t, idx) => (
                           <option key={`move-${t.id || idx}-${idx}`} value={t.id} className="text-black bg-white">
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
                              try {
                                await Promise.all(promises);
                              } catch (err: any) {
                                await alert({
                                  title: "Relocate Failed",
                                  description: err.message || "Failed to relocate one or more quizzes.",
                                  type: 'error'
                                });
                                return;
                              }
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
                 {displayedQuizzes.slice().reverse().map((q, qIdx) => { const isRecentlyAdded = recentlyAddedQuizzes.some(item => item.id == q.id && item.topicId == q.topicId);
                   const compoundKey = `${q.topicId}_${q.id}`;
                   const isChecked = selectedQuizKeys.includes(compoundKey);
                   return (
                     <div key={`quiz-card-${compoundKey}_${qIdx}`} className={cn(
                       "border p-5 rounded-[2rem] group relative overflow-hidden transition-all duration-200",
                       isChecked 
                         ? "bg-red-500/5 border-red-500/30" 
                         : isRecentlyAdded
                           ? "bg-[#32befa]/5 border-[#32befa]/30 border-dashed"
                           : "bg-black/5 dark:bg-black/60 border-black/5 dark:border-white/5"
                     )}>
                        <div className={cn(
                          "absolute top-0 left-0 w-1 h-full bg-[#32befa] opacity-0 group-hover:opacity-100 transition-all",
                          isChecked && "bg-red-500 opacity-100"
                        )} />
                        <div className="flex items-center justify-between gap-4 mb-4 overflow-x-auto scrollbar-hide py-1.5 -mx-2 px-2 border-b border-black/5 dark:border-white/5 pb-2">
                          <div className="flex items-center gap-3 shrink-0">
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
                             <span className="text-[8px] bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 px-2 py-0.5 rounded font-black uppercase tracking-widest">{q.topicId}</span><span className="text-[8px] bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded font-black uppercase tracking-widest ml-1">DIFF: {q.difficulty || 4}</span>{isRecentlyAdded && <span className="text-[8px] bg-[#32befa]/20 text-[#32befa] border border-[#32befa]/20 px-2 py-0.5 rounded font-black uppercase tracking-widest ml-1 animate-pulse">RECENTLY IMPORTED</span>}
                          </div>
                          <div className="flex gap-2">

                             {isRecentlyAdded && (
                                <button
                                  onClick={() => deleteSingleRecentQuiz(q.topicId, q.id)}
                                  className="flex items-center gap-1 bg-red-500 hover:bg-red-650 text-white font-bold px-2.5 py-1 rounded-sm text-[8px] uppercase tracking-wider transition-all shadow-md cursor-pointer mr-2"
                                  title="Delete imported quiz in one click"
                                >
                                  <Trash2 size={10} /> Delete Recent
                                </button>
                             )}
                             <button onClick={() => editQuizInForm(q)} className="text-zinc-500 dark:text-zinc-400 hover:text-[#32befa] transition-all shrink-0" id={`edit-quiz-${q.id}`} style={{ opacity: 1 }}><Edit2 size={16} /></button>
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
                             }} className="text-zinc-500 dark:text-zinc-400 hover:text-red-500 transition-all shrink-0" style={{ opacity: 1 }}><Trash2 size={16} /></button>
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
        const botFriendRequests: Array<{ bot: User; sender: User }> = [];
        users.forEach(u => {
          if (u.isBot && u.pendingRequests) {
            Object.entries(u.pendingRequests).forEach(([senderId, status]) => {
              if (status === 'incoming') {
                const sender = users.find(realUser => realUser.id === senderId);
                if (sender && !sender.isBot) {
                  botFriendRequests.push({ bot: u, sender });
                }
              }
            });
          }
        });
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

             {/* Custom Bot Names Configuration Card */}
             <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5 space-y-4 mb-6">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-[#32befa]/10 rounded-xl flex items-center justify-center text-[#32befa]">
                      <SettingsIcon size={20} />
                   </div>
                   <div>
                      <h3 className="text-sm font-black uppercase tracking-tighter text-black dark:text-white leading-none">Custom Bot Names (Multiplayer Matchmaking)</h3>
                      <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mt-1">Configure user-friendly player names for automated matchmaking bots.</p>
                   </div>
                </div>
                
                <div className="space-y-3">
                   <textarea 
                     value={adminCustomBotNames}
                     onChange={(e) => setAdminCustomBotNames(e.target.value)}
                     placeholder="E.g. Aarav Sharma, Priya Patel, Rohan Verma, Sneha Rao"
                     className="w-full h-28 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-4 text-xs font-mono text-black dark:text-white outline-none focus:border-[#32befa] resize-y"
                   />
                   <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <span className="text-[9px] font-bold text-black/30 dark:text-white/30 uppercase tracking-widest font-mono">
                         Separate with commas. Empty values will fallback to default database names.
                      </span>
                      <button 
                        onClick={async () => {
                           try {
                              await update(ref(db, 'settings'), { customBotNames: adminCustomBotNames });
                              alert({ title: 'Names Saved', description: 'Custom bot names updated successfully!', type: 'success' });
                           } catch(err) {
                              alert({ title: 'Error', description: 'Failed to save bot names configuration.', type: 'error' });
                           }
                        }}
                        className="px-6 py-2.5 bg-[#32befa] text-black text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#32befa]/25 self-end"
                      >
                         Save Bot Names Settings
                      </button>
                   </div>
                </div>
             </div>

              {/* Bot Friend Requests Panel */}
              <div className="bg-black/5 dark:bg-[#111] p-6 rounded-[2rem] border border-black/5 dark:border-white/5 space-y-4 mb-6">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-[#32befa]/10 rounded-xl flex items-center justify-center text-[#32befa]">
                      <Users size={20} />
                   </div>
                   <div>
                      <h3 className="text-sm font-black uppercase tracking-tighter text-black dark:text-white leading-none">Simulator Friend Requests</h3>
                      <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mt-1">Accept or reject pending requests sent by real players on behalf of bots.</p>
                   </div>
                </div>

                {botFriendRequests.length === 0 ? (
                  <div className="p-8 border border-dashed border-black/10 dark:border-white/10 rounded-2xl text-center">
                    <p className="text-xs text-black/40 dark:text-white/40 font-bold uppercase tracking-widest">No pending bot friend requests</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {botFriendRequests.map(({ bot, sender }, idx) => (
                      <div key={`bot-req-${bot.id}-${sender.id}-${idx}`} className="bg-white dark:bg-black/40 p-4 rounded-2xl border border-black/5 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-md uppercase tracking-widest font-mono">Real Player</span>
                            <p className="font-black text-sm text-black dark:text-white">{sender.name} (@{sender.username || sender.id})</p>
                          </div>
                          <p className="text-[10px] text-zinc-400 mt-1">
                            is requesting to be friends with bot: <span className="text-[#32befa] font-bold">@{bot.username || bot.name}</span> ({bot.name})
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2 self-end sm:self-auto font-sans">
                          <button
                            onClick={async () => {
                              const confirmAction = await confirm({
                                title: "Accept Request",
                                description: `Accept friend request from "${sender.name}" on behalf of "${bot.name}"?`,
                                type: 'success'
                              });
                              if (!confirmAction) return;
                              
                              try {
                                // Update friends lists
                                await update(ref(db, `users/${sender.id}/friends`), { [bot.id]: true });
                                await update(ref(db, `bots/${bot.id}/friends`), { [sender.id]: true });
                                
                                // Clear pending requests
                                await set(ref(db, `users/${sender.id}/pendingRequests/${bot.id}`), null);
                                await set(ref(db, `bots/${bot.id}/pendingRequests/${sender.id}`), null);
                                
                                // Send push notification to target device if enabled
                                const svcAccountSnap = await get(ref(db, 'adminConfig/serviceAccount'));
                                const settingsSnap = await get(ref(db, 'settings'));
                                const sysNotifsEnabled = settingsSnap.exists() ? settingsSnap.val().pushNotificationsEnabled !== false : true;
                                
                                if (sysNotifsEnabled && svcAccountSnap.exists()) {
                                  const serviceAccount = svcAccountSnap.val();
                                  const tokensSnap = await get(ref(db, `fcmTokens/${sender.id}`));
                                  if (tokensSnap.exists()) {
                                    const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
                                    const title = 'Friend Request Accepted';
                                    const body = `${bot.name} accepted your friend request!`;
                                    for (const token of tokens) {
                                      await NotificationService.sendToToken(serviceAccount, token, title, body);
                                    }
                                  }
                                }
                                
                                alert({ title: "Accepted", description: `Successfully linked ${sender.name} and ${bot.name} as friends!`, type: "success" });
                              } catch (e: any) {
                                console.error("Failed to accept bot request:", e);
                                alert({ title: "Error", description: e.message || "Failed to complete transaction", type: "error" });
                              }
                            }}
                            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                          >
                            Accept
                          </button>
                          <button
                            onClick={async () => {
                              const confirmAction = await confirm({
                                title: "Reject Request",
                                description: `Reject friend request from "${sender.name}" on behalf of "${bot.name}"?`,
                                type: 'error'
                              });
                              if (!confirmAction) return;
                              
                              try {
                                // Clear pending requests
                                await set(ref(db, `users/${sender.id}/pendingRequests/${bot.id}`), null);
                                await set(ref(db, `bots/${bot.id}/pendingRequests/${sender.id}`), null);
                                
                                alert({ title: "Rejected", description: "Successfully dismissed the pending request.", type: "success" });
                              } catch (e: any) {
                                console.error("Failed to reject bot request:", e);
                                alert({ title: "Error", description: e.message || "Failed to dismiss request", type: "error" });
                              }
                            }}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                    {botPlayers.map((b, bIdx) => (
                       <div key={`bot-player-${b.id || bIdx}-${bIdx}`} className="bg-black/5 dark:bg-[#111] p-5 rounded-2xl border border-black/5 dark:border-white/5 flex items-center justify-between text-black dark:text-white hover:border-[#32befa]/30 transition-all group">
                          <div className="flex items-center gap-3">
                             <div className="w-10 h-10 bg-[#32befa]/10 rounded-xl flex items-center justify-center text-[#32befa] group-hover:bg-[#32befa] group-hover:text-black transition-all">
                                <Bot size={20} />
                             </div>
                             <div>
                                <p className="font-black text-sm tracking-tight leading-none mb-1">{b.name}</p>
                                <p className="text-[9px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">{b.xp} XP • LVL {b.rank}</p>
                             </div>
                          </div>
                          <div className="flex items-center gap-2">
                             <button 
                                onClick={async () => {
                                   const currentPrivacy = b.privacyEnabled === true;
                                   await update(ref(db, `bots/${b.id}`), { privacyEnabled: !currentPrivacy });
                                }} 
                                className={cn(
                                  "px-2 py-1 text-[8px] font-black uppercase rounded-lg border tracking-widest transition-all",
                                  b.privacyEnabled 
                                    ? "bg-red-500/15 border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white"
                                    : "bg-green-500/15 border-green-500/30 text-green-500 hover:bg-green-500 hover:text-white"
                                )}
                             >
                                {b.privacyEnabled ? "Privacy: ON" : "Privacy: OFF"}
                             </button>
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
              {/* Customizable Player Appreciation / One-Time Game Note Modal Controller */}
              <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-pink-500/10 dark:border-pink-500/5 space-y-6">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-pink-500/10 flex items-center justify-center text-pink-500">
                      <Heart size={24} fill="currentColor" />
                    </div>
                    <div>
                      <h4 className="font-black uppercase tracking-tight">One-Time Guest Note</h4>
                      <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest font-mono">Appreciation Pop Screen</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setUserNoteActive(!userNoteActive)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl font-black uppercase tracking-widest text-[9px] border transition-all shadow-md cursor-pointer",
                      userNoteActive
                        ? "bg-emerald-500 text-white border-emerald-400"
                        : "bg-red-500 text-white border-red-400"
                    )}
                  >
                    {userNoteActive ? 'ACTIVE' : 'MUTED'}
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-xs font-bold text-black/60 dark:text-gray-400 leading-relaxed">
                    Set a dynamic feedback/appreciation note popup. Use <span className="font-mono text-primary font-black">{"{"}name{"}"}</span> or <span className="font-mono text-primary font-black">{"{"}username{"}"}</span> for personalized name greeting injection.
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-black/40 dark:text-white/40 ml-1">Note Title</label>
                    <input
                      type="text"
                      value={userNoteTitle}
                      onChange={(e) => setUserNoteTitle(e.target.value)}
                      placeholder="e.g. Special Thanks, {name}!"
                      className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-xs transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-black/40 dark:text-white/40 ml-1">Note Body Content</label>
                    <textarea
                      value={userNoteBody}
                      onChange={(e) => setUserNoteBody(e.target.value)}
                      placeholder="e.g. We appreciate your valuable play, {name}!"
                      rows={3}
                      className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-xs transition-all resize-none"
                    />
                  </div>

                  <div className="space-y-3">
                    <label className="text-[9px] font-black uppercase text-black/40 dark:text-white/40 ml-1">Target Players Range</label>
                    <div className="grid grid-cols-2 gap-2 p-1.5 bg-black/10 dark:bg-black/40 rounded-2xl border border-black/5 dark:border-white/5">
                      <button
                        type="button"
                        onClick={() => setUserNoteTarget('all')}
                        className={cn(
                          "py-3 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all cursor-pointer",
                          userNoteTarget === 'all' 
                            ? "bg-[#32befa] text-white shadow-md border border-[#32befa]/20" 
                            : "bg-transparent text-black/50 dark:text-white/40 hover:text-black/80 hover:dark:text-white/80"
                        )}
                      >
                        All Players
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (userNoteTarget === 'all') {
                            setUserNoteTarget('');
                          }
                        }}
                        className={cn(
                          "py-3 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all cursor-pointer",
                          userNoteTarget !== 'all' 
                            ? "bg-[#32befa] text-white shadow-md border border-[#32befa]/20" 
                            : "bg-transparent text-black/50 dark:text-white/40 hover:text-black/80 hover:dark:text-white/80"
                        )}
                      >
                        Specific Player(s)
                      </button>
                    </div>

                    {userNoteTarget !== 'all' && (
                      <div className="space-y-1.5 animate-fadeIn">
                        <label className="text-[9px] font-black uppercase text-black/40 dark:text-white/40 ml-1">Enter Target Usernames/IDs (Comma Separated)</label>
                        <input
                          type="text"
                          value={userNoteTarget}
                          onChange={(e) => setUserNoteTarget(e.target.value)}
                          className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-[#32befa] text-xs transition-all font-mono"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={saveGameNote}
                    className="w-full py-4 bg-[#32befa] hover:bg-[#32befa]/90 text-white font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    Save &amp; Inject note
                  </button>
                </div>
              </div>

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
                       "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border shadow-lg",
                       settings?.livesEnabledForAll 
                         ? "bg-green-500 text-white border-green-400 shadow-green-500/20" 
                         : "bg-red-500 text-white border-red-400 shadow-red-500/20"
                     )}
                   >
                     {settings?.livesEnabledForAll ? 'SYSTEM LIVES ENABLED' : 'SYSTEM LIVES DISABLED'}
                   </button>

                   <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-2">
                     <p className="text-xs font-bold text-black/60 dark:text-white/60 leading-relaxed">
                       Allow players to buy extra lives from the Shop using coins.
                     </p>
                     <button 
                       onClick={async () => {
                         const newState = !settings?.shopLivesEnabled;
                         await update(ref(db, 'settings'), { shopLivesEnabled: newState });
                       }}
                       className={cn(
                         "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border shadow-lg",
                         settings?.shopLivesEnabled 
                           ? "bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/20" 
                           : "bg-red-500 text-white border-red-400 shadow-red-500/20"
                       )}
                     >
                       {settings?.shopLivesEnabled ? 'SHOP LIVES ENABLED' : 'SHOP LIVES DISABLED'}
                     </button>
                   </div>
                </div>
              </div>

              <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                    <Palette size={24} />
                  </div>
                  <div>
                    <h4 className="font-black uppercase tracking-tight">Theme Customization</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Global Toggle</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                   <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed font-sans">
                     Control whether the theme customization section is shown in settings. When disabled, the theme settings section is hidden for all players.
                   </p>
                   <button 
                     onClick={async () => {
                       const newState = !settings?.themesDisabled;
                       await update(ref(db, 'settings'), { themesDisabled: newState });
                     }}
                     className={cn(
                       "w-full py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all border shadow-lg cursor-pointer",
                       !settings?.themesDisabled 
                         ? "bg-green-500 text-white border-green-400 shadow-green-500/20" 
                         : "bg-red-500 text-white border-red-400 shadow-red-500/20"
                     )}
                   >
                     {!settings?.themesDisabled ? 'THEMES ARE ENABLED GLOBALLY' : 'THEMES ARE DISABLED GLOBALLY'}
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

              {/* Quiz Coins Config */}
              <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-12 h-12 rounded-2xl bg-yellow-500/10 flex items-center justify-center text-yellow-500">
                    <Coins size={24} className="animate-pulse" strokeWidth={2.5} />
                  </div>
                  <div>
                    <h4 className="font-black uppercase tracking-tight">Quiz Coins Reward</h4>
                    <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest font-mono">Correct Answer Coin Value</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                   <p className="text-xs font-bold text-black/60 dark:text-gray-400 leading-relaxed">
                     Set how many Quiz Coins are earned for every correct answer. 100 Quiz Coins auto-converts into 1 Rahee Coin.
                   </p>
                   <div className="bg-white/5 dark:bg-black/20 p-6 rounded-3xl border border-black/5 dark:border-white/5">
                     <div className="flex items-center justify-between mb-4">
                        <span className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Quiz Coin Reward Value</span>
                        <span className="text-xl font-black text-yellow-500">{settings?.correctQuizCoinValue !== undefined ? settings.correctQuizCoinValue : 10} Quiz Coins</span>
                     </div>
                     <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            const current = settings?.correctQuizCoinValue !== undefined ? settings.correctQuizCoinValue : 10;
                            if (current <= 1) return;
                            await update(ref(db, 'settings'), { correctQuizCoinValue: current - 1 });
                          }}
                          className="flex-1 py-4 bg-black/5 dark:bg-white/10 rounded-2xl flex items-center justify-center text-black dark:text-white hover:bg-yellow-500 hover:text-black transition-all"
                        >
                           <ChevronDown size={20} />
                        </button>
                        <button 
                          onClick={async () => {
                            await update(ref(db, 'settings'), { correctQuizCoinValue: 10 });
                          }}
                          className="px-6 py-4 bg-black/5 dark:bg-white/10 rounded-2xl flex items-center justify-center text-black/40 dark:text-white/40 hover:text-primary transition-all"
                        >
                           <RotateCcw size={16} />
                        </button>
                        <button 
                          onClick={async () => {
                            const current = settings?.correctQuizCoinValue !== undefined ? settings.correctQuizCoinValue : 10;
                            if (current >= 100) return;
                            await update(ref(db, 'settings'), { correctQuizCoinValue: current + 1 });
                          }}
                          className="flex-1 py-4 bg-black/5 dark:bg-white/10 rounded-2xl flex items-center justify-center text-black dark:text-white hover:bg-yellow-500 hover:text-black transition-all"
                        >
                           <ChevronUp size={20} />
                        </button>
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

               {/* Admin Activity Alert Toggle */}
               <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                 <div className="flex items-center gap-4 mb-2">
                   <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                     <Bell size={24} />
                   </div>
                   <div>
                     <h4 className="font-black uppercase tracking-tight">Admin Player Activity Alerts</h4>
                     <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest font-mono">Login & Play Notify</p>
                   </div>
                 </div>
                 
                 <div className="space-y-4">
                    <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                      Send a safety alert to the admin dashboard whenever users/players log in or start/complete interactive quiz sessions. This can be configured and toggled on/off.
                    </p>
                    <button 
                      onClick={async () => {
                        const current = settings?.adminNotifyOnPlay !== false;
                        await update(ref(db, 'settings'), { adminNotifyOnPlay: !current });
                      }}
                      className={cn(
                        "w-full py-6 rounded-3xl font-black uppercase tracking-widest text-xs transition-all border shadow-lg",
                        (settings?.adminNotifyOnPlay !== false)
                          ? "bg-orange-500 text-white border-orange-400 shadow-orange-500/20" 
                          : "bg-red-500 text-white border-red-400 shadow-red-500/20"
                      )}
                    >
                      {(settings?.adminNotifyOnPlay !== false) ? 'PLAYER TRACKING IS ACTIVE' : 'PLAYER TRACKING IS SILENCED'}
                    </button>
                 </div>
               </div>

                {/* Admin Master FCM Token Configuration */}
               <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-2xl bg-[#32befa]/10 flex items-center justify-center text-[#32befa]">
                       <Bell size={24} />
                     </div>
                     <div>
                       <h4 className="font-black uppercase tracking-tight">Admin Master FCM Token</h4>
                       <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest font-mono">FCM Target Token</p>
                     </div>
                   </div>

                   <button
                     onClick={async () => {
                       const currentVal = settings?.adminMasterFcmEnabled !== false;
                       await update(ref(db, 'settings'), { adminMasterFcmEnabled: !currentVal });
                     }}
                     className={cn(
                       "px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[9px] border transition-all shadow-md cursor-pointer",
                       settings?.adminMasterFcmEnabled !== false
                         ? "bg-green-500 text-white border-green-400 shadow-green-500/10"
                         : "bg-red-500 text-white border-red-400 shadow-red-500/10"
                     )}
                   >
                     {settings?.adminMasterFcmEnabled !== false ? 'ACTIVE' : 'MUTED'}
                   </button>
                 </div>
                 
                 <div className="space-y-4">
                    <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                      Configure a direct FCM registry token to receive immediate system push notifications (including game starts, player logins, new signups, and simulator bot friend requests).
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <input 
                          type="text"
                          value={adminFcmInput !== null ? adminFcmInput : (settings?.adminConfigFcmToken || '')}
                          onChange={(e) => {
                            setAdminFcmInput(e.target.value);
                          }}
                          placeholder="Paste Admin FCM Token Here"
                          className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 pr-12 rounded-2xl font-bold outline-none focus:border-primary text-xs transition-all font-mono"
                        />
                        <Bell className="absolute right-4 top-1/2 -translate-y-1/2 text-black/20 dark:text-white/20" size={20} />
                      </div>
                      <button
                        onClick={async () => {
                          const savedVal = (adminFcmInput !== null ? adminFcmInput : (settings?.adminConfigFcmToken || '')).trim();
                          await update(ref(db, 'settings'), { adminConfigFcmToken: savedVal });
                          setFcmSavedFeedback(true);
                          setTimeout(() => {
                            setFcmSavedFeedback(false);
                          }, 2500);
                        }}
                        className={cn(
                          "font-black uppercase tracking-wider text-[11px] px-6 py-4 rounded-2xl transition-all cursor-pointer shadow-md active:scale-95",
                          fcmSavedFeedback 
                            ? "bg-green-500 text-white shadow-green-500/20"
                            : "bg-[#32befa] hover:bg-[#32befa]/90 text-white shadow-primary/25"
                        )}
                      >
                        {fcmSavedFeedback ? 'Saved ✓' : 'Save Token'}
                      </button>
                    </div>
                 </div>
               </div>

               {/* Share Image Ratio Configuration Settings */}
               <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                 <div className="flex items-center gap-4 mb-2">
                   <div className="w-12 h-12 rounded-2xl bg-[#32befa]/10 flex items-center justify-center text-[#32befa]">
                     <ImageIcon size={24} />
                   </div>
                   <div>
                     <h4 className="font-black uppercase tracking-tight">Progress Share Image Ratio</h4>
                     <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest font-mono">Aspect Ratio Settings</p>
                   </div>
                 </div>
                 
                 <div className="space-y-4">
                    <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                      Configure the default canvas aspect ratio when players generate and share their visual scorecards and quiz progress certificates to socials.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                       {['16:9', '9:16', '1:1', '4:3'].map((ratio) => (
                          <button
                            key={ratio}
                            onClick={async () => {
                               await update(ref(db, 'settings'), { shareImageRatio: ratio });
                            }}
                            className={cn(
                               "py-3.5 px-4 rounded-xl text-xs font-black transition-all border",
                               (settings?.shareImageRatio || '1:1') === ratio
                                 ? "bg-[#32befa] text-black border-[#32befa] shadow-md shadow-[#32befa]/10"
                                 : "bg-black/5 dark:bg-white/5 border-transparent text-black/60 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10"
                            )}
                          >
                             {ratio === '16:9' ? '16:9 Landscape' : 
                              ratio === '9:16' ? '9:16 Vertical' : 
                              ratio === '1:1' ? '1:1 Square' : '4:3 Standard'}
                          </button>
                       ))}
                    </div>
                 </div>
               </div>

               {/* Background Music Global Switch */}
               <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                 <div className="flex items-center gap-4 mb-2">
                   <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                     <Volume2 size={24} />
                   </div>
                   <div>
                     <h4 className="font-black uppercase tracking-tight">Background Music (BGM)</h4>
                     <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Global Master Toggle</p>
                   </div>
                 </div>
                 
                 <div className="space-y-4">
                    <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                      Enable or disable soothing background game music globally for all users under development.
                    </p>
                    <button 
                      onClick={async () => {
                        const newState = !settings?.bgmEnabled;
                        await update(ref(db, 'settings'), { bgmEnabled: newState });
                      }}
                      className={cn(
                        "w-full py-6 rounded-3xl font-black uppercase tracking-widest text-xs transition-all border shadow-lg",
                        settings?.bgmEnabled 
                          ? "bg-green-500 text-white border-green-400 shadow-green-500/20" 
                          : "bg-red-500 text-white border-red-400 shadow-red-500/20"
                      )}
                    >
                      {settings?.bgmEnabled ? 'BGM IS ENABLED' : 'BGM IS DISABLED'}
                    </button>

                     <div className="space-y-2 pt-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-black/50 dark:text-white/50">Global Default BGM Acoustic Package / MIDI Mode</label>
                        <select 
                          value={settings?.bgmPreset || 'synth'}
                          onChange={async (e) => {
                            const val = e.target.value;
                            await update(ref(db, 'settings'), { bgmPreset: val });
                            await alert({
                              title: 'Global Default BGM Updated',
                              description: `Successfully configured global style package to "${val}".`,
                              type: 'success'
                            });
                          }}
                          className="w-full bg-white dark:bg-[#111] border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-black dark:text-white outline-none focus:border-primary cursor-pointer uppercase tracking-widest"
                        >
                          <option value="synth" className="bg-white dark:bg-black">✨ Soothing Synthesizer (Generative)</option>
                          <option value="flute" className="bg-white dark:bg-black">🌾 Indian Flute (Generative)</option>
                          <option value="piano" className="bg-white dark:bg-black">🎹 Peaceful Piano (Generative)</option>
                          <option value="guitar" className="bg-white dark:bg-black">🎸 Classical Guitar (Generative)</option>
                          <option value="ensemble" className="bg-white dark:bg-black">🎻 Ambient Acoustic Ensemble</option>
                          <option value="violin" className="bg-white dark:bg-black">🎻 Sustained Bowed Strings</option>
                          <option value="harp" className="bg-white dark:bg-black">👼 Ethereal Harp Solo</option>
                          <option value="custom_midi" className="bg-white dark:bg-black">🎼 SYNCHRONIZED MULTI-MIDI PARSER BOARD</option>
                        </select>
                        <p className="text-[9px] font-medium text-black/40 dark:text-white/40 leading-relaxed">
                          Set the preset sound used unless overridden. Use "Multi-MIDI Parser Board" to play parsed binary MIDI tracks.
                        </p>
                     </div>

                     {/* MIDI Composition Selector for Custom MIDI Mode */}
                     {(settings?.bgmPreset === 'custom_midi') && (
                       <div className="space-y-2 pt-2 p-4 bg-primary/5 rounded-2xl border border-primary/20">
                          <label className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                            <span>🎼 Master MIDI Preset Composition</span>
                          </label>
                          <select 
                            value={settings?.midiPresetName || 'satie'}
                            onChange={async (e) => {
                              const val = e.target.value;
                              await update(ref(db, 'settings'), { midiPresetName: val });
                              await alert({
                                title: 'Master MIDI Sequence Updated',
                                description: `The active synchronized score is now set to classical preset "${val}".`,
                                type: 'success'
                              });
                            }}
                            className="w-full bg-white dark:bg-black border border-primary/20 rounded-xl px-4 py-2.5 text-xs font-bold text-black dark:text-white outline-none focus:border-primary cursor-pointer uppercase tracking-wide"
                          >
                            <option value="satie">🌸 Erik Satie - Gymnopédie No. 1</option>
                            <option value="bach">🎹 J.S. Bach - Prelude in C Major</option>
                            <option value="beethoven">🌙 L. Beethoven - Moonlight Sonata (Adagio)</option>
                            <option value="raga">🌾 Meditative Morning Lotus Raga</option>
                          </select>
                          <p className="text-[9px] font-medium text-black/40 dark:text-white/40 leading-normal">
                            Select a beautiful, mathematically-generated MIDI score that parses offline in the browser instantly.
                          </p>
                       </div>
                     )}

                     <div className="space-y-4 pt-4 border-t border-black/5 dark:border-white/5">
                        <h5 className="text-[11px] font-black uppercase text-primary tracking-widest flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
                          Studio Multi-Instrument Mix Board
                        </h5>
                        <p className="text-[10px] font-bold text-black/50 dark:text-white/50 uppercase leading-normal">
                          Adjust the live acoustic mixing levels and tempo. All tracks play together simultaneously under full synchronization.
                        </p>

                        {/* Synthesizer Track */}
                        <div className="space-y-1.5 p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                             <span className="text-black/60 dark:text-white/70">✨ Ambient Pad Synth</span>
                             <span className="text-primary font-mono">{Math.round((settings?.bgmVolumeSynth !== undefined ? settings.bgmVolumeSynth : 0.7) * 100)}%</span>
                           </div>
                           <input 
                             type="range"
                             min="0"
                             max="1"
                             step="0.05"
                             value={settings?.bgmVolumeSynth !== undefined ? settings.bgmVolumeSynth : 0.7}
                             onChange={async (e) => {
                               const val = parseFloat(e.target.value);
                               await update(ref(db, 'settings'), { bgmVolumeSynth: val });
                             }}
                             className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                           />
                        </div>

                        {/* Flute Track */}
                        <div className="space-y-1.5 p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                             <span className="text-black/60 dark:text-white/70">🌾 Sadhana Indian Flute</span>
                             <span className="text-primary font-mono">{Math.round((settings?.bgmVolumeFlute !== undefined ? settings.bgmVolumeFlute : 0.4) * 100)}%</span>
                           </div>
                           <input 
                             type="range"
                             min="0"
                             max="1"
                             step="0.05"
                             value={settings?.bgmVolumeFlute !== undefined ? settings.bgmVolumeFlute : 0.4}
                             onChange={async (e) => {
                               const val = parseFloat(e.target.value);
                               await update(ref(db, 'settings'), { bgmVolumeFlute: val });
                             }}
                             className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                           />
                        </div>

                        {/* Grand Piano Track */}
                        <div className="space-y-1.5 p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                             <span className="text-black/60 dark:text-white/70">🎹 Peaceful Grand Piano</span>
                             <span className="text-primary font-mono">{Math.round((settings?.bgmVolumePiano !== undefined ? settings.bgmVolumePiano : 0.5) * 100)}%</span>
                           </div>
                           <input 
                             type="range"
                             min="0"
                             max="1"
                             step="0.05"
                             value={settings?.bgmVolumePiano !== undefined ? settings.bgmVolumePiano : 0.5}
                             onChange={async (e) => {
                               const val = parseFloat(e.target.value);
                               await update(ref(db, 'settings'), { bgmVolumePiano: val });
                             }}
                             className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                           />
                        </div>

                        {/* Classical Guitar Track */}
                        <div className="space-y-1.5 p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                             <span className="text-black/60 dark:text-white/70">🎸 Classical Nylon Guitar</span>
                             <span className="text-primary font-mono">{Math.round((settings?.bgmVolumeGuitar !== undefined ? settings.bgmVolumeGuitar : 0.5) * 100)}%</span>
                           </div>
                           <input 
                             type="range"
                             min="0"
                             max="1"
                             step="0.05"
                             value={settings?.bgmVolumeGuitar !== undefined ? settings.bgmVolumeGuitar : 0.5}
                             onChange={async (e) => {
                               const val = parseFloat(e.target.value);
                               await update(ref(db, 'settings'), { bgmVolumeGuitar: val });
                             }}
                             className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                           />
                        </div>

                        {/* Violin Strings Track */}
                        <div className="space-y-1.5 p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                             <span className="text-black/60 dark:text-white/70">🎻 Orchestral Bowed Strings</span>
                             <span className="text-primary font-mono">{Math.round((settings?.bgmVolumeViolin !== undefined ? settings.bgmVolumeViolin : 0.4) * 100)}%</span>
                           </div>
                           <input 
                             type="range"
                             min="0"
                             max="1"
                             step="0.05"
                             value={settings?.bgmVolumeViolin !== undefined ? settings.bgmVolumeViolin : 0.4}
                             onChange={async (e) => {
                               const val = parseFloat(e.target.value);
                               await update(ref(db, 'settings'), { bgmVolumeViolin: val });
                             }}
                             className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                           />
                        </div>

                        {/* Harp Track */}
                        <div className="space-y-1.5 p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                             <span className="text-black/60 dark:text-white/70">👼 Ethereal Concert Harp</span>
                             <span className="text-primary font-mono">{Math.round((settings?.bgmVolumeHarp !== undefined ? settings.bgmVolumeHarp : 0.4) * 100)}%</span>
                           </div>
                           <input 
                             type="range"
                             min="0"
                             max="1"
                             step="0.05"
                             value={settings?.bgmVolumeHarp !== undefined ? settings.bgmVolumeHarp : 0.4}
                             onChange={async (e) => {
                               const val = parseFloat(e.target.value);
                               await update(ref(db, 'settings'), { bgmVolumeHarp: val });
                             }}
                             className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                           />
                        </div>

                        {/* Lofi Beats Track */}
                        <div className="space-y-1.5 p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                             <span className="text-black/60 dark:text-white/70">🥁 Calm Lofi Beats (Kick & Shaker)</span>
                             <span className="text-primary font-mono">{Math.round((settings?.bgmVolumeBeats !== undefined ? settings.bgmVolumeBeats : 0.25) * 100)}%</span>
                           </div>
                           <input 
                             type="range"
                             min="0"
                             max="1"
                             step="0.05"
                             value={settings?.bgmVolumeBeats !== undefined ? settings.bgmVolumeBeats : 0.25}
                             onChange={async (e) => {
                               const val = parseFloat(e.target.value);
                               await update(ref(db, 'settings'), { bgmVolumeBeats: val });
                             }}
                             className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                           />
                        </div>

                        {/* Tempo control */}
                        <div className="space-y-1.5 p-3.5 bg-black/5 dark:bg-white/5 rounded-2xl">
                           <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider">
                             <span className="text-black/60 dark:text-white/70">⏱️ Music Tempo (BPM speed)</span>
                             <span className="text-primary font-mono">{settings?.bgmBpm !== undefined ? settings.bgmBpm : 95} BPM</span>
                           </div>
                           <input 
                             type="range"
                             min="40"
                             max="160"
                             step="4"
                             value={settings?.bgmBpm !== undefined ? settings.bgmBpm : 95}
                             onChange={async (e) => {
                               const val = parseInt(e.target.value, 10);
                               await update(ref(db, 'settings'), { bgmBpm: val });
                             }}
                             className="w-full accent-primary h-1 bg-black/10 dark:bg-white/10 rounded-lg cursor-pointer"
                           />
                        </div>
                     </div>

                     {/* Custom MIDI Track URLs - Play different midis simultaneously on different channels! */}
                     {(settings?.bgmPreset === 'custom_midi') && (
                       <div className="space-y-4 pt-4 border-t border-black/5 dark:border-white/5 bg-black/10 dark:bg-white/5 p-4 rounded-[1.5rem] text-left">
                         <h6 className="text-[10px] font-black uppercase tracking-widest text-[#999] dark:text-[#888]">Track-Specific Binary MIDI URLs (.mid)</h6>
                         <p className="text-[9px] font-medium leading-normal text-black/50 dark:text-white/40">
                           Paste direct URLs to standard web access `.mid` files. Leave empty to auto-clone the master MIDI preset choice. Keep different tracks playing different files!
                         </p>

                         {/* Track 1: Synth */}
                         <div className="space-y-1">
                           <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40">Ambient Pad Synth .mid URL</label>
                           <input 
                             type="text"
                             key={`midi-synth-${settings?.midiUrlSynth || ''}`}
                             defaultValue={settings?.midiUrlSynth || ''}
                             placeholder="e.g. https://domain.com/synth.mid"
                             onBlur={async (e) => {
                               await update(ref(db, 'settings'), { midiUrlSynth: e.target.value.trim() });
                             }}
                             className="w-full bg-white dark:bg-black border border-black/15 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-black dark:text-white focus:border-primary outline-none"
                           />
                         </div>

                         {/* Track 2: Flute */}
                         <div className="space-y-1">
                           <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40">Indian Woodwind Flute .mid URL</label>
                           <input 
                             type="text"
                             key={`midi-flute-${settings?.midiUrlFlute || ''}`}
                             defaultValue={settings?.midiUrlFlute || ''}
                             placeholder="e.g. https://domain.com/flute.mid"
                             onBlur={async (e) => {
                               await update(ref(db, 'settings'), { midiUrlFlute: e.target.value.trim() });
                             }}
                             className="w-full bg-white dark:bg-black border border-black/15 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-black dark:text-white focus:border-primary outline-none"
                           />
                         </div>

                         {/* Track 3: Piano */}
                         <div className="space-y-1">
                           <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40">Peaceful Grand Piano .mid URL</label>
                           <input 
                             type="text"
                             key={`midi-piano-${settings?.midiUrlPiano || ''}`}
                             defaultValue={settings?.midiUrlPiano || ''}
                             placeholder="e.g. https://domain.com/piano.mid"
                             onBlur={async (e) => {
                               await update(ref(db, 'settings'), { midiUrlPiano: e.target.value.trim() });
                             }}
                             className="w-full bg-white dark:bg-black border border-black/15 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-black dark:text-white focus:border-primary outline-none"
                           />
                         </div>

                         {/* Track 4: Guitar */}
                         <div className="space-y-1">
                           <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40">Nylon Classical Guitar .mid URL</label>
                           <input 
                             type="text"
                             key={`midi-guitar-${settings?.midiUrlGuitar || ''}`}
                             defaultValue={settings?.midiUrlGuitar || ''}
                             placeholder="e.g. https://domain.com/guitar.mid"
                             onBlur={async (e) => {
                               await update(ref(db, 'settings'), { midiUrlGuitar: e.target.value.trim() });
                             }}
                             className="w-full bg-white dark:bg-black border border-black/15 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-black dark:text-white focus:border-primary outline-none"
                           />
                         </div>

                         {/* Track 5: Violin */}
                         <div className="space-y-1">
                           <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40">Bowed Violin Strings .mid URL</label>
                           <input 
                             type="text"
                             key={`midi-violin-${settings?.midiUrlViolin || ''}`}
                             defaultValue={settings?.midiUrlViolin || ''}
                             placeholder="e.g. https://domain.com/violin.mid"
                             onBlur={async (e) => {
                               await update(ref(db, 'settings'), { midiUrlViolin: e.target.value.trim() });
                             }}
                             className="w-full bg-white dark:bg-black border border-black/15 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-black dark:text-white focus:border-primary outline-none"
                           />
                         </div>

                         {/* Track 6: Harp */}
                         <div className="space-y-1">
                           <label className="text-[9px] font-bold uppercase tracking-wider text-black/40 dark:text-white/40">Concert Ethereal Harp .mid URL</label>
                           <input 
                             type="text"
                             key={`midi-harp-${settings?.midiUrlHarp || ''}`}
                             defaultValue={settings?.midiUrlHarp || ''}
                             placeholder="e.g. https://domain.com/harp.mid"
                             onBlur={async (e) => {
                               await update(ref(db, 'settings'), { midiUrlHarp: e.target.value.trim() });
                             }}
                             className="w-full bg-white dark:bg-black border border-black/15 dark:border-white/10 rounded-xl px-3.5 py-2 text-xs text-black dark:text-white focus:border-primary outline-none"
                           />
                         </div>
                       </div>
                     )}

                    <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-black/50 dark:text-white/50">BGM Audio Playback Strategy</label>
                        <select 
                          value={settings?.bgmMode || 'all'}
                          onChange={async (e) => {
                            const val = e.target.value;
                            await update(ref(db, 'settings'), { bgmMode: val });
                          }}
                          className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-black dark:text-white outline-none focus:border-primary cursor-pointer uppercase tracking-widest"
                        >
                          <option value="all">🌐 ALL SENSORS (Link sound if set, otherwise Synthesizer)</option>
                          <option value="uploaded_only">💾 Local Root Audio (Rahee Quiz Final.mp3)</option>
                          <option value="link_only">🔗 Link Sound Only (MP3 sound, silence if empty)</option>
                          <option value="synth_only">🎹 Synthesizer Only (Offline sound, disable link sound)</option>
                        </select>
                        <p className="text-[8px] font-bold uppercase tracking-wide text-black/40 dark:text-white/40 leading-relaxed">
                          Choose whether to force-enable the high fidelity MIDI Synthesizer system, restrict to stream audio links, or play the local custom 'Rahee Quiz Final.mp3' file stored directly in the game's root directory continuously offline.
                        </p>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-black/5 dark:border-white/5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-black/50 dark:text-white/50 block">Local Audio Status & Clean Up</label>
                        <div className="flex flex-col gap-2 p-4 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl">
                          <span className="text-[11px] font-bold text-black dark:text-white uppercase leading-normal">
                            📂 Loading Source: <span className="font-mono text-primary font-black">/Music/Rahee Quiz Final.mp3</span>
                          </span>
                          <p className="text-[9px] font-bold text-black/50 dark:text-[#a0a0a0] uppercase leading-relaxed">
                            Place your file named <span className="font-mono font-black text-black dark:text-white">"Rahee Quiz Final.mp3"</span> into the game's root <span className="font-mono text-black dark:text-white">/Music</span> directory to play it in loop during local custom play. Supports any size.
                          </p>

                          {(settings?.bgmBase64 || settings?.bgmFileName) && (
                            <div className="mt-2 pt-2 border-t border-black/5 dark:border-white/5 flex flex-col gap-2">
                              <span className="text-[9px] font-black text-red-500 uppercase">
                                ⚠️ Deprecated base64 audio detected in Database
                              </span>
                              <button 
                                type="button"
                                onClick={async () => {
                                  await update(ref(db, 'settings'), { bgmFileName: null, bgmBase64: null });
                                  await alert({ 
                                    title: 'Storage Cleared', 
                                    description: 'Large Base64 audio cleared from Realtime Database. Your database is now lightweight and fast!', 
                                    type: 'success' 
                                  });
                                }}
                                className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all"
                              >
                                Reclaim RTDB Space (Delete Old Base64 Audio)
                              </button>
                            </div>
                          )}
                        </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/5">
                        <label className="text-[10px] font-black uppercase tracking-widest text-black/50 dark:text-white/50">Custom Audio BGM URL</label>
                        <input 
                          type="text"
                          key={`bgm-url-${settings?.bgmUrl || ''}`}
                          defaultValue={settings?.bgmUrl || ''}
                          placeholder="e.g. https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
                          onBlur={async (e) => {
                            const val = e.target.value.trim();
                            await update(ref(db, 'settings'), { bgmUrl: val });
                            await alert({ 
                              title: 'BGM URL Updated', 
                              description: val ? 'Custom background music URL updated successfully.' : 'Custom BGM URL cleared. Reverted to synthesizer.', 
                              type: 'success' 
                            });
                          }}
                          className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-black dark:text-white outline-none focus:border-primary"
                        />
                        <p className="text-[9px] font-medium text-black/40 dark:text-white/40 leading-relaxed">
                          Provide a direct streamable MP3/audio link. Setting this replaces generative synthesis for all users.
                        </p>
                    </div>
                 </div>
              </div>

              {/* Ambient Mode Global Settings */}
              <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
                 <div className="flex items-center gap-4 mb-2">
                   <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                     <Sun size={24} />
                   </div>
                   <div>
                     <h4 className="font-black uppercase tracking-tight">Ambient Mode Settings</h4>
                     <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Global lx Threshold</p>
                   </div>
                 </div>
                 
                 <div className="space-y-4">
                    <p className="text-sm font-bold text-black/60 dark:text-white/60 leading-relaxed">
                      Configure the default light sensor lux value threshold. If live lux &lt; threshold, dark mode is applied. Current global threshold: <span className="font-black text-primary">{settings?.ambientThreshold !== undefined ? `${settings.ambientThreshold} lx` : "0 lx (Must be set by admin)"}</span>.
                    </p>
                    <div className="flex gap-2">
                       <input 
                         type="number"
                         key={`ambient-threshold-${settings?.ambientThreshold}`}
                         defaultValue={settings?.ambientThreshold !== undefined ? settings.ambientThreshold : 0}
                         onBlur={async (e) => {
                           const parsed = parseInt(e.target.value);
                           const val = isNaN(parsed) ? 0 : parsed;
                           await update(ref(db, 'settings'), { ambientThreshold: val });
                           await alert({ title: 'Success', description: `Global threshold set to ${val} lx`, type: "success" });
                         }}
                         placeholder="e.g. 75"
                         className="flex-1 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl px-4 py-3 text-xs font-bold text-black dark:text-white outline-none focus:border-primary"
                       />
                    </div>
                 </div>
              </div>
            </div>

            {/* Game Update Code Settings */}
            <div className="bg-black/5 dark:bg-[#111] p-8 rounded-[3rem] border border-black/5 dark:border-white/5 space-y-6">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <Database size={24} />
                </div>
                <div>
                  <h4 className="font-black uppercase tracking-tight text-black dark:text-white">Global "Update/Code" Settings</h4>
                  <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">Real-time binding check system at path "Update/Code"</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Global Update Code</label>
                    <span className="text-[9px] font-mono font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.2 rounded">Update/Code</span>
                  </div>
                  <input
                    type="text"
                    value={globalUpdateCode}
                    onChange={(e) => setGlobalUpdateCode(e.target.value)}
                    placeholder="e.g. 786"
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold font-mono outline-none focus:border-primary text-sm transition-all text-emerald-500"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Global Update URL</label>
                    <span className="text-[9px] font-mono font-bold text-orange-500 bg-orange-500/10 px-1.5 py-0.2 rounded">Update/Url</span>
                  </div>
                  <input
                    type="text"
                    value={globalUpdateUrl}
                    onChange={(e) => setGlobalUpdateUrl(e.target.value)}
                    placeholder="e.g. https://play.google.com/store"
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm transition-all"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Global Update Message</label>
                    <span className="text-[9px] font-mono font-bold text-indigo-500 bg-indigo-500/10 px-1.5 py-0.2 rounded">Update/Message</span>
                  </div>
                  <textarea
                    value={globalUpdateMessage}
                    onChange={(e) => setGlobalUpdateMessage(e.target.value)}
                    placeholder="Enter message to display on the update required popup..."
                    rows={2}
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm transition-all resize-none text-black dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Global Contact Help Message</label>
                    <span className="text-[9px] font-mono font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.2 rounded">Update/HelpMessage</span>
                  </div>
                  <input
                    type="text"
                    value={globalUpdateHelpMessage}
                    onChange={(e) => setGlobalUpdateHelpMessage(e.target.value)}
                    placeholder="e.g. Please Contact Developer Or Admin For More Info"
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold outline-none focus:border-primary text-sm transition-all text-black dark:text-white"
                  />
                </div>

                <div className="space-y-2 border-t border-black/5 dark:border-white/5 pt-4">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40 block">Database Verification Path Pattern</label>
                    <span className="text-[9px] font-mono font-bold text-blue-500 bg-blue-500/10 px-1.5 py-0.2 rounded">Update/CheckedPathPattern</span>
                  </div>
                  <input
                    type="text"
                    value={globalCheckedPathPattern}
                    onChange={(e) => setGlobalCheckedPathPattern(e.target.value)}
                    placeholder="e.g. users/{userId}/AppCode"
                    className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 p-4 rounded-2xl font-bold font-mono outline-none focus:border-blue-500 text-sm transition-all text-blue-550 dark:text-blue-400"
                  />
                  <p className="text-[10px] text-black/50 dark:text-white/40 leading-relaxed">
                    Specify the dynamic check node inside your Realtime Database. Use <code className="text-blue-500 bg-blue-500/5 px-1 py-0.5 rounded font-mono font-black">{`{userId}`}</code> which replaces dynamically with the active user's ID at runtime.
                  </p>

                  <div className="pt-1.5 flex flex-wrap gap-1.5">
                    <span className="text-[9px] font-black uppercase text-black/30 dark:text-white/30 mr-1 self-center">Presets:</span>
                    {[
                      { name: 'OneLink Device UserCode', val: 'UserDevices/{deviceUid}/User/UserCode' },
                      { name: 'Users AppCode (Legacy)', val: 'users/{userId}/AppCode' },
                      { name: 'Device-Users Plural Path', val: 'UserDevices/{deviceUid}/Users/UserCode' },
                      { name: 'Custom Node Check', val: 'appCodes/{userId}' },
                      { name: 'Direct Root Node', val: '{userId}/AppCode' }
                    ].map((ps) => (
                      <button
                        key={ps.val}
                        type="button"
                        onClick={() => setGlobalCheckedPathPattern(ps.val)}
                        className={`text-[9px] font-bold px-2 py-1 rounded-md transition-all ${globalCheckedPathPattern === ps.val ? 'bg-blue-500 text-white' : 'bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-black/60 dark:text-white/60'}`}
                      >
                        {ps.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  onClick={async () => {
                    if (!globalUpdateCode.trim()) {
                      await alert({ title: 'Validation Error', description: 'Please enter a valid update code.', type: 'error' });
                      return;
                    }
                    if (!globalCheckedPathPattern.trim()) {
                      await alert({ title: 'Validation Error', description: 'Please enter a path pattern expression template.', type: 'error' });
                      return;
                    }
                    await update(ref(db, 'Update'), {
                      Code: globalUpdateCode.trim(),
                      Url: globalUpdateUrl.trim(),
                      Message: globalUpdateMessage.trim(),
                      CheckedPathPattern: globalCheckedPathPattern.trim(),
                      HelpMessage: globalUpdateHelpMessage.trim()
                    });
                    
                    // Also mirror into our legacy settings object if needed
                    await update(ref(db, 'settings'), {
                      code: globalUpdateCode.trim(),
                      updateCodeSettings: {
                        code: globalUpdateCode.trim(),
                        updateUrl: globalUpdateUrl.trim(),
                        message: globalUpdateMessage.trim()
                      }
                    });

                    await alert({ title: 'Update Node Saved', description: 'Real-time "Update" node and dynamically monitored check path saved successfully!', type: 'success' });
                  }}
                  className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all border border-emerald-500/20 shadow-lg shadow-emerald-500/10 hover:scale-[1.01] active:scale-95"
                >
                  Save Global "Update" Node (Code & Path Pattern)
                </button>

                {/* DB Transference & Cloning utility card */}
                <div className="mt-4 p-5 bg-black/10 dark:bg-black/50 rounded-[2rem] border border-black/5 dark:border-white/5 space-y-4">
                  <div>
                    <h5 className="text-xs font-black uppercase text-black/80 dark:text-white/80 flex items-center gap-2">
                      <Share2 size={14} className="text-blue-500 animate-pulse" />
                      Database AppCode Path Transference Tool
                    </h5>
                    <p className="text-[10px] text-black/50 dark:text-white/40 mt-1 leading-normal">
                      Transfer all users' registration AppCodes dynamically from one node/subbranch in your database to another!
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Source Path Pattern</label>
                      <input
                        type="text"
                        placeholder="users/{userId}/AppCode"
                        value={transferenceSourcePath}
                        onChange={(e) => setTransferenceSourcePath(e.target.value)}
                        className="w-full bg-white dark:bg-black font-mono text-[11px] p-2.5 rounded-xl border border-black/10 dark:border-white/10"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Target Destination Path</label>
                      <input
                        type="text"
                        placeholder="UserDevices/{userId}/appCode"
                        value={transferenceTargetPath}
                        onChange={(e) => setTransferenceTargetPath(e.target.value)}
                        className="w-full bg-white dark:bg-black font-mono text-[11px] p-2.5 rounded-xl border border-black/10 dark:border-white/10 text-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      if (!transferenceSourcePath.trim() || !transferenceTargetPath.trim()) {
                        await alert({ title: 'Validation Error', description: 'Both source and target path patterns must be provided.', type: 'error' });
                        return;
                      }

                      const confirmed = await confirm({
                        title: 'Confirm Database Migration?',
                        description: `This tool will fetch all current users. For each user, it will copy the value stored at "${transferenceSourcePath}" to their new target sub-node "${transferenceTargetPath}". Do you want to proceed?`,
                        type: 'confirm'
                      });
                      if (!confirmed) return;

                      setIsTransferring(true);
                      try {
                        const usersSnapshot = await get(ref(db, 'users'));
                        if (!usersSnapshot.exists()) {
                          await alert({ title: 'Error', description: 'No users branch found in database.', type: 'error' });
                          setIsTransferring(false);
                          return;
                        }

                        const usersData = usersSnapshot.val();
                        const userIds = Object.keys(usersData);
                        const updates: any = {};
                        let successCount = 0;

                        for (const uid of userIds) {
                          const solvedSrc = transferenceSourcePath.replace(/{userId}/g, uid);
                          const solvedTgt = transferenceTargetPath.replace(/{userId}/g, uid);

                          const srcValSnapshot = await get(ref(db, solvedSrc));
                          if (srcValSnapshot.exists()) {
                            updates[solvedTgt] = srcValSnapshot.val();
                            successCount++;
                          } else if (usersData[uid]?.AppCode !== undefined) {
                            // Fallback check: Look up user item object properties directly if path was local user child
                            updates[solvedTgt] = String(usersData[uid].AppCode).trim();
                            successCount++;
                          }
                        }

                        if (successCount > 0) {
                          await update(ref(db), updates);
                          await alert({
                            title: 'Transference Complete',
                            description: `Successfully migrated & paired AppCodes of ${successCount} users into target branch: "${transferenceTargetPath}" safely with full data integrity!`,
                            type: 'success'
                          });
                        } else {
                          await alert({
                            title: 'Validation Failed',
                            description: 'No AppCode data found at the specified source path pattern to transfer. Check your source path.',
                            type: 'error'
                          });
                        }
                      } catch (err: any) {
                        await alert({
                          title: 'Migration Failure',
                          description: err.message,
                          type: 'error'
                        });
                      } finally {
                        setIsTransferring(false);
                      }
                    }}
                    disabled={isTransferring}
                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all hover:scale-[1.01] flex items-center justify-center gap-2"
                  >
                    {isTransferring ? (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <Share2 size={12} />
                    )}
                    {isTransferring ? 'Cloning & Migrating Paths...' : 'Execute Path Transference'}
                  </button>
                </div>

                <button
                  onClick={async () => {
                    if (!globalUpdateCode.trim()) {
                      await alert({ title: 'Requirements Missed', description: 'Please enter a global update code first before linking users.', type: 'error' });
                      return;
                    }

                    const confirmed = await confirm({
                      title: 'Bulk Match AppCode',
                      description: `Are you sure you want to set "users/{userId}/AppCode" of ALL users to "${globalUpdateCode.trim()}"? This will link/bypass the update blocker block for all existing users immediately.`,
                      type: 'confirm'
                    });
                    if (!confirmed) return;

                    try {
                      const usersSnapshot = await get(ref(db, 'users'));
                      if (usersSnapshot.exists()) {
                        const allUsers = usersSnapshot.val();
                        const updates: any = {};
                        Object.keys(allUsers).forEach((userId) => {
                          updates[`users/${userId}/AppCode`] = globalUpdateCode.trim();
                        });
                        await update(ref(db), updates);
                        await alert({
                          title: 'Success',
                          description: `Successfully matched & linked ${Object.keys(allUsers).length} users' AppCode to "${globalUpdateCode.trim()}" in Firebase RTDB.`,
                          type: 'success'
                        });
                      } else {
                        await alert({
                          title: 'Error',
                          description: 'No users found in database to link.',
                          type: 'error'
                        });
                      }
                    } catch (err: any) {
                      await alert({
                        title: 'Bulk Sync Failed',
                        description: err.message,
                        type: 'error'
                      });
                    }
                  }}
                  className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 border border-indigo-550/20 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-95"
                >
                  <Users size={16} />
                  Link All Users' AppCode to "{globalUpdateCode}"
                </button>
              </div>
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
                {[...feedback].reverse().map((f, fIdx) => (
                   <div key={`feedback-card-${f.id || fIdx}-${fIdx}`} className="bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/5 p-6 rounded-[2rem] space-y-4 hover:border-primary/20 transition-all flex flex-col group relative">
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
      case 'reports':
         return renderReportsSection();
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
                {pendingUsers.map((u, uIdx) => (
                  <motion.div 
                    key={`pending-pic-${u.id || uIdx}-${uIdx}`}
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
                  {unapprovedUsers.map((u, uIdx) => (
                    <motion.div 
                      key={`unapproved-user-${u.id || uIdx}-${uIdx}`}
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

                      <div className="bg-white/5 dark:bg-black/20 p-4 rounded-2xl border border-black/10 dark:border-white/5">
                        <p className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest mb-1">Email</p>
                        <p className="text-xs text-black/70 dark:text-white/70 truncate">{u.email}</p>
                      </div>

                      <div className="bg-white/5 dark:bg-black/20 p-4 rounded-2xl border border-black/10 dark:border-white/5 space-y-2">
                        <label className="text-[10px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest block ml-1">FCM Token (Link to player)</label>
                        <input 
                          value={pendingTokens[u.id] || ''}
                          onChange={e => setPendingTokens({...pendingTokens, [u.id]: e.target.value})}
                          placeholder="Paste FCM Token to link..."
                          className="w-full bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-black dark:text-white outline-none focus:border-primary"
                        />
                      </div>

                      <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            const v = await confirm({ title: 'Approve User?', description: `Allow ${u.name} to play Rahee Quiz?`, type: 'confirm' });
                            if (!v) return;
                            const tokenToLink = pendingTokens[u.id];
                            await approveUserAndNotify(u, tokenToLink);
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
                  {retryRequests.map((u, uIdx) => (
                    <motion.div 
                      key={`retry-user-${u.id || uIdx}-${uIdx}`}
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
      case 'dashboard':
        return renderDashboard();
      default: return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-white dark:bg-black text-black dark:text-white relative transition-colors duration-300">
       {/* Fullscreen Player Dashboard Overlay */}
       {fullscreenDashboardUser && renderFullscreenPlayerDashboard(fullscreenDashboardUser)}

       {/* Fullscreen Player Quiz History Overlay */}
       {historyFullscreenUser && renderFullscreenPlayerHistory(historyFullscreenUser)}

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
               { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
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
               { id: 'reports', label: 'Reports', icon: AlertTriangle },
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

        {/* CSV Import Topic Link Modal */}
        <AnimatePresence>
          {isCsvModalOpen && pendingCsvRows && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setIsCsvModalOpen(false);
                  setPendingCsvRows(null);
                }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm shadow-xl"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="bg-white dark:bg-[#0c0f16] border border-black/10 dark:border-white/10 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative z-10 text-left space-y-5 text-black dark:text-white"
              >
                <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3.5">
                  <div>
                    <span className="text-[10px] font-black uppercase text-[#32befa] tracking-widest block font-sans">
                      CSV Upload Wizard
                    </span>
                    <h3 className="text-lg font-black uppercase tracking-tight text-neutral-900 dark:text-neutral-50 mt-0.5 font-sans font-black">
                      Link Quizzes to Topic / Node
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCsvModalOpen(false);
                      setPendingCsvRows(null);
                    }}
                    className="p-1.5 hover:bg-black/5 dark:hover:bg-white/5 text-neutral-400 hover:text-red-500 rounded-full transition-all cursor-pointer"
                  >
                    <CloseIcon size={16} />
                  </button>
                </div>

                <div className="space-y-4 font-sans">
                  <div className="text-xs text-black/60 dark:text-gray-300 font-medium leading-relaxed">
                    You parsed <span className="font-extrabold text-[#32befa]">{pendingCsvRows.length}</span> rows from the CSV file. How should they be linked?
                  </div>

                  {/* Mode Selector Option Cards */}
                  <div className="space-y-3">
                    {/* Auto Map Card */}
                    <div
                      onClick={() => setCsvTopicLinkMode('csv')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 text-left relative overflow-hidden",
                        csvTopicLinkMode === 'csv'
                          ? "bg-[#32befa]/15 border-[#32befa]/40 shadow-sm"
                          : "bg-black/5 dark:bg-white/5 border-transparent hover:border-black/10 dark:hover:border-white/10"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                          csvTopicLinkMode === 'csv' ? "border-[#32befa]" : "border-black/30 dark:border-white/30"
                        )}>
                          {csvTopicLinkMode === 'csv' && <div className="w-2 h-2 rounded-full bg-[#32befa]" />}
                        </div>
                        <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white">
                          Use Topic ID from CSV Code
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-black/50 dark:text-gray-400 ml-6">
                        Auto-link using the <code>topicId</code> sheet columns dynamically.
                      </span>
                    </div>

                    {/* Single Topic Mapping Card */}
                    <div
                      onClick={() => setCsvTopicLinkMode('select')}
                      className={cn(
                        "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1 text-left relative overflow-hidden",
                        csvTopicLinkMode === 'select'
                          ? "bg-[#32befa]/15 border-[#32befa]/40 shadow-sm"
                          : "bg-black/5 dark:bg-white/5 border-transparent hover:border-black/10 dark:hover:border-white/10"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all",
                          csvTopicLinkMode === 'select' ? "border-[#32befa]" : "border-black/30 dark:border-white/30"
                        )}>
                          {csvTopicLinkMode === 'select' && <div className="w-2 h-2 rounded-full bg-[#32befa]" />}
                        </div>
                        <span className="text-xs font-black uppercase tracking-wider text-black dark:text-white">
                          Link All to a Single Topic Node
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-black/50 dark:text-gray-400 ml-6">
                        Map all imported quiz items into one of your existing game topics.
                      </span>
                    </div>
                  </div>

                  {/* Dropdown Selector if single topic mapping */}
                  {csvTopicLinkMode === 'select' && (
                    <div className="space-y-1.5 animate-fadeIn">
                      <label className="text-[9px] font-black uppercase tracking-widest text-[#32befa] block ml-1 font-mono">
                        Select Game Topic / Node
                      </label>
                      <select
                        value={selectedCsvTopicId}
                        onChange={(e) => setSelectedCsvTopicId(e.target.value)}
                        className="w-full bg-neutral-100 dark:bg-black border border-black/10 dark:border-white/10 p-3.5 rounded-2xl font-bold outline-none text-xs transition-colors text-black dark:text-white cursor-pointer"
                      >
                        {flattenTopics(topics).map((t) => (
                          <option key={`csv-topic-opt-${t.id}`} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2.5 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsCsvModalOpen(false);
                        setPendingCsvRows(null);
                      }}
                      className="flex-1 bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 text-black/70 dark:text-gray-300 font-extrabold uppercase p-4 rounded-xl hover:bg-black/10 dark:hover:bg-white/10 transition-all text-[10px] tracking-wider cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={processPendingCsvQuizzes}
                      className="flex-1 bg-[#32befa] text-black font-extrabold uppercase p-4 rounded-xl hover:bg-opacity-90 transition-all text-[10px] tracking-widest shadow-lg shadow-primary/10 cursor-pointer"
                    >
                      Import Now
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
    </div>
  );
}
