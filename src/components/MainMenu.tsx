import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, ShoppingBag, TrendingUp, Users, Settings as SettingsIcon, 
  Trophy, Grid, Star, LogOut, Shield, Swords, Zap, RefreshCw, 
  MessageSquare, ChevronRight, Moon, Sun, Coins, HelpCircle, Heart,
  History as HistoryIcon, Clock, X, XCircle, Check, Camera, Upload, Image as ImageIcon, ChevronDown, ChevronUp, Loader2,
  Gift, Calendar, AlertTriangle, Activity
} from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { useTheme } from '../contexts/ThemeContext';
import { useDialog } from '../contexts/DialogContext';
import Layout from './Layout';
import QuizScreen from './QuizScreen';
import Leaderboard from './Leaderboard';
import Shop from './Shop';
import Settings from './Settings';
import SocialHub from './SocialHub';
import Events from './Events';
import MultiplayerHub from './MultiplayerHub';
import MultiplayerGame from './MultiplayerGame';
import AdminPanel from './AdminPanel';
import ScoreCard from './ScoreCard';
import History from './History';
import Chat from './Chat';
import TrackingHub from './TrackingHub';
import Feedback from './Feedback';
import { db } from '../firebase/config';
import { ref, onValue, update, query, orderByChild, equalTo, get, push, set } from 'firebase/database';
import { User, Topic } from '../types';
import { CLASSES, SUBJECTS, CURRENT_VERSION_CODE } from '../constants';
import { translations } from '../translations';
import { cn } from '../lib/utils';
import { logActivity, logAdminNotification } from '../activityService';

const DEFAULT_AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Buddy',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Caspian',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Dora',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Erik',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&mouth=smile',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&top=longHair',
];

export default function MainMenu() {
  const { currentUser, setCurrentUser, settings, isImpersonating, stopImpersonating } = useUser();
  const { isDark, setIsDark } = useTheme();
  const { alert } = useDialog();
  const [activeTab, setActiveTab] = useState<'home' | 'leaderboard' | 'shop' | 'friends' | 'admin' | 'event' | 'tracking'>('home');
  const [showQuiz, setShowQuiz] = useState(false);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showRaheePass, setShowRaheePass] = useState(false);
  const [showTopicSelect, setShowTopicSelect] = useState(false);
  const [selectionPath, setSelectionPath] = useState<Topic[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMultiplayerHub, setShowMultiplayerHub] = useState(false);
  const [multiRoomId, setMultiRoomId] = useState<string | null>(null);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [isBotMatch, setIsBotMatch] = useState(false);
  const [isMatchMinimized, setIsMatchMinimized] = useState(false);
  const [showScoreCard, setShowScoreCard] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showLivesModal, setShowLivesModal] = useState(false);
  const [showStreakModal, setShowStreakModal] = useState(false);
  const [streakView, setStreakView] = useState<'weekly' | 'calendar'>('weekly');
  const [refillTimeLeft, setRefillTimeLeft] = useState<number>(0);
  const [isEditingAvatar, setIsEditingAvatar] = useState(false);
  const [referralInput, setReferralInput] = useState('');
  const [isRedeemingReferral, setIsRedeemingReferral] = useState(false);
  const [showDailyRewards, setShowDailyRewards] = useState(false);
  const [isClaimingReward, setIsClaimingReward] = useState(false);
  const [rewardsTab, setRewardsTab] = useState<'daily' | 'free'>('daily');
  const [showAdPlayer, setShowAdPlayer] = useState(false);
  const [currentAd, setCurrentAd] = useState<any | null>(null);
  const [adCountdown, setAdCountdown] = useState(0);
  const [adRewardType, setAdRewardType] = useState<number | null>(null); // 2, 3, 4
  const [isAdRewardClaiming, setIsAdRewardClaiming] = useState(false);
  const [adsFeed, setAdsFeed] = useState<any[]>([]);

  const REFILL_INTERVAL = 15 * 60 * 1000; // 15 minutes
  const MAX_LIVES = 16;

  // Streak & Refill Logic
  useEffect(() => {
    if (!currentUser) return;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const lastLogin = currentUser.lastLoginDate;

    // Daily Streak Logic
    if (lastLogin !== today) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      let newStreak = currentUser.streak || 0;
      if (lastLogin === yesterdayStr) {
        newStreak += 1;
      } else if (lastLogin) {
        newStreak = 1; // Reset if missed a day
      } else {
        newStreak = 1; // First time
      }

      update(ref(db, `users/${currentUser.id}`), {
        lastLoginDate: today,
        streak: newStreak
      });
    }

    // Refill Timer
    const interval = setInterval(() => {
      if (!currentUser.lives?.enabled) return;
      
      const count = currentUser.lives?.count || 0;
      if (count >= MAX_LIVES) {
        setRefillTimeLeft(0);
        return;
      }

      const lastRefill = currentUser.lives?.lastRefill || Date.now();
      const elapsed = Date.now() - lastRefill;
      
      if (elapsed >= REFILL_INTERVAL) {
        const refillCount = Math.floor(elapsed / REFILL_INTERVAL);
        const nextCount = Math.min(MAX_LIVES, count + refillCount);
        update(ref(db, `users/${currentUser.id}/lives`), {
          count: nextCount,
          lastRefill: lastRefill + (refillCount * REFILL_INTERVAL)
        });
      } else {
        setRefillTimeLeft(REFILL_INTERVAL - elapsed);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentUser?.id, currentUser?.lastLoginDate, currentUser?.lives?.lastRefill]);

  // Real-time Active View State Sync for Admin Monitor
  useEffect(() => {
    if (!currentUser?.id) return;
    
    // Set active values or standard blank values
    const actState = {
      activeTab: activeTab || 'home',
      showQuiz: showQuiz || false,
      activeExamId: activeExamId || "",
      showSettings: showSettings || false,
      showTopicSelect: showTopicSelect || false,
      showFeedback: showFeedback || false,
      showMultiplayerHub: showMultiplayerHub || false,
      multiRoomId: multiRoomId || "",
      showScoreCard: showScoreCard || false,
      showHistory: showHistory || false,
      showProfile: showProfile || false,
      showLivesModal: showLivesModal || false,
      showStreakModal: showStreakModal || false,
      showRaheePass: showRaheePass || false,
      isDarkObj: isDark, // sync dark mode theme
      lastUpdated: Date.now()
    };
    
    const activeStateRef = ref(db, `users/${currentUser.id}/activeState`);
    set(activeStateRef, actState).catch(err => console.error("Active state sync failed:", err));
  }, [
    currentUser?.id,
    activeTab,
    showQuiz,
    activeExamId,
    showSettings,
    showTopicSelect,
    showFeedback,
    showMultiplayerHub,
    multiRoomId,
    showScoreCard,
    showHistory,
    showProfile,
    showLivesModal,
    showStreakModal,
    showRaheePass,
    isDark
  ]);

  // Auto-show daily rewards on load/open if unclaimed today
  useEffect(() => {
    if (!currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const lastClaimDate = currentUser.dailyRewards?.lastClaimDate || '';
    
    // Track daily reward auto-show occurrence in local storage per unique user and day
    const storageKey = `daily_reward_shown_${currentUser.id}_${today}`;
    const alreadyShownToday = localStorage.getItem(storageKey) === 'true';

    if (lastClaimDate !== today && !alreadyShownToday) {
      const timer = setTimeout(() => {
        setShowDailyRewards(true);
        localStorage.setItem(storageKey, 'true');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentUser?.id, currentUser?.dailyRewards?.lastClaimDate]);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [totalQuizzesCount, setTotalQuizzesCount] = useState(0);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 512 * 1024) { // 512KB limit
        alert({ title: 'File too large', description: 'Max 512KB allowed', type: 'error' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        await update(ref(db, `users/${currentUser?.id}`), {
          pendingAvatarUrl: base64String
        });
        await alert({ title: 'Uploaded!', description: 'Your profile picture is pending admin approval.', type: 'success' });
        setIsEditingAvatar(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectAvatar = async (url: string) => {
    if (!currentUser) return;
    await update(ref(db, `users/${currentUser.id}`), {
      avatarUrl: url,
      pendingAvatarUrl: null
    });
    setIsEditingAvatar(false);
  };

  const redeemReferral = async () => {
    if (!currentUser || !referralInput.trim()) return;
    if (currentUser.referredBy) {
      await alert({ title: "Already Referred", description: "You have already used a referral code.", type: 'info' });
      return;
    }
    const code = referralInput.trim().toUpperCase();
    if (code === currentUser.referralCode) {
      await alert({ title: "Invalid Code", description: "You cannot use your own referral code.", type: 'error' });
      return;
    }

    setIsRedeemingReferral(true);
    try {
      const usersRef = ref(db, 'users');
      const q = query(usersRef, orderByChild('referralCode'), equalTo(code));
      const snapshot = await get(q);

      if (!snapshot.exists()) {
        await alert({ title: "Invalid Code", description: "This referral code does not exist.", type: 'error' });
      } else {
        const referrerId = Object.keys(snapshot.val())[0];
        const referrerData = snapshot.val()[referrerId] as User;
        
        const settingsSnap = await get(ref(db, 'settings/referralReward'));
        const reward = settingsSnap.exists() ? settingsSnap.val() : 500;

        const timestamp = Date.now();
        const updates: any = {};
        
        updates[`users/${referrerId}/raheeCoins`] = (referrerData.raheeCoins || 0) + reward;
        updates[`users/${currentUser.id}/raheeCoins`] = (currentUser.raheeCoins || 0) + reward;
        updates[`users/${currentUser.id}/referredBy`] = referrerId;
        
        const logRef = push(ref(db, 'referralLogs'));
        updates[`referralLogs/${logRef.key}`] = {
          referrerId,
          referrerName: referrerData.username || referrerData.name || 'Anonymous',
          referredId: currentUser.id,
          referredName: currentUser.username || currentUser.name || 'Anonymous',
          rewardValue: reward,
          timestamp
        };

        await update(ref(db), updates);
        await alert({ title: "Referral Success!", description: `Both you and ${referrerData.username || referrerData.name} received ${reward} Rahee Coins!`, type: 'success' });
        setReferralInput('');
      }
    } catch (err: any) {
      await alert({ title: "Error", description: err.message, type: 'error' });
    } finally {
      setIsRedeemingReferral(false);
    }
  };

  useEffect(() => {
    let usersList: User[] = [];
    let botsList: User[] = [];

    const usersRef = ref(db, 'users');
    const unsubscribeUsers = onValue(usersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        usersList = Object.entries(data)
          .filter(([_, val]) => val !== null)
          .map(([id, val]: [string, any]) => ({
            id,
            ...val
          }));
      } else {
        usersList = [];
      }
      setAllUsers([...usersList, ...botsList]);
    });

    const botsRef = ref(db, 'bots');
    const unsubscribeBots = onValue(botsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        botsList = Object.entries(data)
          .filter(([_, val]) => val !== null)
          .map(([id, val]: [string, any]) => ({
            id,
            ...val,
            isBot: true
          }));
      } else {
        botsList = [];
      }
      setAllUsers([...usersList, ...botsList]);
    });

    const topicsRef = ref(db, 'topics');
    onValue(topicsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setTopics(Object.entries(data)
          .filter(([_, val]) => val !== null)
          .map(([id, val]: [string, any]) => ({ id, ...val })));
      }
    });

    const quizzesRef = ref(db, 'quizzes');
    onValue(quizzesRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTotalQuizzesCount(Object.keys(data).length);
      }
    });

    const adsRef = ref(db, 'ads');
    onValue(adsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const activeList = Object.entries(data)
          .filter(([_, val]: any) => val !== null && val.active)
          .map(([id, val]: any) => ({ id, ...val }));
        setAdsFeed(activeList);
      } else {
        setAdsFeed([]);
      }
    });

    const handleStartMatch = (e: any) => {
      if (e.detail?.roomId) {
        setMultiRoomId(e.detail.roomId);
        setIsBotMatch(false);
      }
    };
    window.addEventListener('start-match', handleStartMatch);

    const handleStartExam = (e: any) => {
      console.log("handleStartExam event caught inside MainMenu, examId:", e.detail?.examId);
      if (e.detail?.examId) {
        setActiveExamId(e.detail.examId);
        setShowQuiz(true);
      }
    };
    window.addEventListener('start-exam', handleStartExam);

    return () => {
      unsubscribeUsers();
      unsubscribeBots();
      window.removeEventListener('start-match', handleStartMatch);
      window.removeEventListener('start-exam', handleStartExam);
    };
  }, []);

  useEffect(() => {
    if (isImpersonating) {
      setActiveTab('home');
    }
  }, [isImpersonating]);

  useEffect(() => {
    if (showQuiz && currentUser) {
      logAdminNotification('play', currentUser.name || currentUser.username || 'Player', 'Solo Quiz Game');
    }
  }, [showQuiz, currentUser?.id]);

  // Automatically redirect to active match if one exists in status 'accepted' or 'playing'
  useEffect(() => {
    if (!currentUser?.id) return;

    const matchesRef = ref(db, 'matches');
    const unsubscribe = onValue(matchesRef, (snapshot) => {
      if (snapshot.exists()) {
        const matches = snapshot.val();
        const activeMatch = Object.values(matches).find((m: any) => 
          (m.status === 'accepted' || m.status === 'playing') && 
          m.participants?.[currentUser.id]
        ) as any;

        if (activeMatch && activeMatch.id !== multiRoomId) {
          // Verify it is not finished
          if (activeMatch.status !== 'finished') {
            setMultiRoomId(activeMatch.id);
            setIsBotMatch(false);
          }
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser?.id, multiRoomId]);

  const checkGameStart = (onSuccess: () => void) => {
    onSuccess();
  };

  const handleStartQuiz = () => {
    checkGameStart(() => {
      if ((currentUser?.currentQuizIndex || 0) > 0) {
         setShowQuiz(true);
         return;
      }

      if (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic) {
         // If fixed topic but different from selected, force sync (should be handled at login/update)
         if (currentUser.selectedTopicId !== currentUser.fixedTopicId) {
            update(ref(db, `users/${currentUser.id}`), { selectedTopicId: currentUser.fixedTopicId });
         }
         setShowQuiz(true);
         return;
      }

      const hasValidTopic = currentUser?.selectedTopicId && topics.some(t => t.id === currentUser.selectedTopicId);
      if (!currentUser?.selectedTopicId || !hasValidTopic) {
         setShowTopicSelect(true);
         return;
      }
      setShowQuiz(true);
    });
  };

  const getUserRank = (userId: string) => {
    const sortedUsers = [...allUsers].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const index = sortedUsers.findIndex(u => u.id === userId);
    return index !== -1 ? index + 1 : '-';
  };

  const toggleLanguage = async () => {
    if (!currentUser) return;
    const nextLang = currentUser.language === 'en' ? 'hi' : 'en';
    await update(ref(db, `users/${currentUser.id}`), { language: nextLang });
  };

  const getAllChildTopicIds = (topic: Topic): string[] => {
    let ids = [topic.id];
    if (topic.children) {
      Object.values(topic.children).forEach(child => {
        ids = [...ids, ...getAllChildTopicIds(child)];
      });
    }
    return ids;
  };

  const startSelectedQuiz = async (ids?: string[]) => {
    if (!currentUser) return;
    const targetIds = ids || selectedTopicIds;
    if (targetIds.length === 0) return;

    checkGameStart(async () => {
      await update(ref(db, `users/${currentUser.id}`), {
        selectedTopicIds: targetIds,
        selectedTopicId: targetIds[0],
        currentQuizIndex: 0,
        currentRound: 1
      });
      setSelectedTopicIds([]);
      setShowTopicSelect(false);
      setShowQuiz(true);
    });
  };

  const toggleTopicSelection = (topicId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    // Find matching topic in hierarchical trees to assess disableMultiSelect flag
    const findInTopics = (list: Topic[]): Topic | undefined => {
      for (const t of list) {
        if (t.id === topicId) return t;
        if (t.children) {
          const found = findInTopics(Object.values(t.children));
          if (found) return found;
        }
      }
      return undefined;
    };
    const topic = findInTopics(topics);
    if (topic?.disableMultiSelect) return;

    setSelectedTopicIds(prev => 
      prev.includes(topicId) 
        ? prev.filter(id => id !== topicId) 
        : [...prev, topicId]
    );
  };

  const handlePlayAgainFromHistory = async (topicId: string) => {
    if (!currentUser) return;
    checkGameStart(async () => {
      await update(ref(db, `users/${currentUser.id}`), {
        selectedTopicId: topicId,
        currentQuizIndex: 0,
        currentRound: 1,
        extraTriesAllowed: false
      });
      setShowHistory(false);
      setShowQuiz(true);
    });
  };

  const isRewardClaimed = (d: number) => {
    if (!currentUser) return false;
    const dailyRewards = currentUser.dailyRewards || {};
    const currentDay = dailyRewards.currentDay || 1;
    const today = new Date().toISOString().split('T')[0];
    const claimedToday = dailyRewards.lastClaimDate === today;

    if (claimedToday) {
      const claimedTodayDay = currentDay === 1 ? 7 : currentDay - 1;
      if (currentDay === 1) {
        return true;
      }
      return d < currentDay;
    } else {
      return d < currentDay;
    }
  };

  const handleClaimReward = async () => {
    if (!currentUser || isClaimingReward) return;
    const today = new Date().toISOString().split('T')[0];
    const dailyRewards = currentUser.dailyRewards || {};
    const lastClaimDate = dailyRewards.lastClaimDate || '';
    const currentDay = dailyRewards.currentDay || 1;

    if (lastClaimDate === today) {
      await alert({
        title: "Already Claimed",
        description: "You have already claimed your daily reward for today!",
        type: "error"
      });
      return;
    }

    setIsClaimingReward(true);

    const updates: any = {};
    let addCoins = 0;
    let addLives = 0;
    let plusFifty = 0;
    let plusChange = 0;
    let plusHint = 0;

    if (currentDay === 1) addCoins = 150;
    else if (currentDay === 2) addLives = 2;
    else if (currentDay === 3) plusFifty = 1;
    else if (currentDay === 4) addCoins = 300;
    else if (currentDay === 5) addLives = 3;
    else if (currentDay === 6) plusChange = 1;
    else if (currentDay === 7) {
      addCoins = 500;
      addLives = 5;
      plusHint = 1;
    }

    if (addCoins > 0) {
      updates.raheeCoins = (currentUser.raheeCoins || 0) + addCoins;
    }
    if (addLives > 0) {
      const currentLivesCount = currentUser.lives?.count ?? 16;
      updates['lives/count'] = Math.min(16, currentLivesCount + addLives);
    }
    if (plusFifty > 0) {
      const lifelines = currentUser.lifelines || { fiftyFifty: 1, changeQuiz: 1, audiencePoll: 1, hint: 1 };
      updates['lifelines/fiftyFifty'] = (lifelines.fiftyFifty || 0) + plusFifty;
    }
    if (plusChange > 0) {
      const lifelines = currentUser.lifelines || { fiftyFifty: 1, changeQuiz: 1, audiencePoll: 1, hint: 1 };
      updates['lifelines/changeQuiz'] = (lifelines.changeQuiz || 0) + plusChange;
    }
    if (plusHint > 0) {
      const lifelines = currentUser.lifelines || { fiftyFifty: 1, changeQuiz: 1, audiencePoll: 1, hint: 1 };
      updates['lifelines/hint'] = (lifelines.hint || 0) + plusHint;
    }

    const nextDay = currentDay >= 7 ? 1 : currentDay + 1;
    updates['dailyRewards/lastClaimDate'] = today;
    updates['dailyRewards/currentDay'] = nextDay;

    try {
      await update(ref(db, `users/${currentUser.id}`), updates);
      
      let rewardDesc = "";
      if (addCoins > 0) rewardDesc += `🪙 ${addCoins} Coins `;
      if (addLives > 0) rewardDesc += `❤️ ${addLives} Hearts `;
      if (plusFifty > 0) rewardDesc += `🎭 50:50 Lifeline `;
      if (plusChange > 0) rewardDesc += `🔄 Change Quiz Lifeline `;
      if (plusHint > 0) rewardDesc += `💡 Hint Lifeline `;

      // Log the activity
      await logActivity(
        currentUser.id,
        currentUser.name || currentUser.username || 'Guest',
        'claim_daily_rewards',
        `Claimed Day ${currentDay} Calendar Reward: ${rewardDesc.trim()}`
      );

      setIsClaimingReward(false);
      await alert({
        title: "Reward Claimed! 🎉",
        description: `Congratulations! Day ${currentDay} reward claimed: ${rewardDesc}. Come back tomorrow!`,
        type: "success"
      });
    } catch (error) {
      console.error("Error claiming reward:", error);
      setIsClaimingReward(false);
      await alert({
        title: "Error",
        description: "Something went wrong while claiming your reward.",
        type: "error"
      });
    }
  };

  const [hourlyTimeLeftStr, setHourlyTimeLeftStr] = useState<string>('');

  useEffect(() => {
    const updateHourlyTimer = () => {
      if (!currentUser) return;
      const lastClaimStr = currentUser.freeRewards?.lastHourlyClaim;
      if (!lastClaimStr) {
        setHourlyTimeLeftStr('');
        return;
      }
      const lastClaimTime = new Date(lastClaimStr).getTime();
      const elapsedMs = Date.now() - lastClaimTime;
      const oneHourMs = 60 * 60 * 1000;
      
      const accumulated = Math.floor(elapsedMs / oneHourMs);
      if (accumulated >= 24) {
        setHourlyTimeLeftStr('Treasury Full!');
        return;
      }

      const nextTickMs = oneHourMs - (elapsedMs % oneHourMs);
      if (nextTickMs <= 0) {
        setHourlyTimeLeftStr('');
        return;
      }

      const totalSeconds = Math.floor(nextTickMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      const formatted = `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
      setHourlyTimeLeftStr(formatted);
    };

    updateHourlyTimer();
    const interval = setInterval(updateHourlyTimer, 1000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const getHourlyAccumulated = () => {
    if (!currentUser) return 0;
    const lastClaimStr = currentUser.freeRewards?.lastHourlyClaim;
    if (!lastClaimStr) return 100; // Ready immediately on first open!
    
    const lastClaimTime = new Date(lastClaimStr).getTime();
    const elapsedMs = Date.now() - lastClaimTime;
    const elapsedHours = Math.floor(elapsedMs / (60 * 60 * 1000));
    return Math.min(24, Math.max(0, elapsedHours)) * 100;
  };

  const getNextHourlyTickProgress = () => {
    if (!currentUser) return 0;
    const lastClaimStr = currentUser.freeRewards?.lastHourlyClaim;
    if (!lastClaimStr) return 100;
    
    const lastClaimTime = new Date(lastClaimStr).getTime();
    const elapsedMs = Date.now() - lastClaimTime;
    const hourlyMs = 60 * 60 * 1000;
    
    const currentTickProgress = (elapsedMs % hourlyMs) / hourlyMs;
    return Math.min(100, Math.round(currentTickProgress * 100));
  };

  // Timer loop for ad player
  useEffect(() => {
    if (!showAdPlayer || adCountdown <= 0) return;
    const timer = setInterval(() => {
      setAdCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [showAdPlayer, adCountdown]);

  const handleClaimHourlyReward = async () => {
    if (!currentUser || isClaimingReward) return;
    
    const accumulated = getHourlyAccumulated();
    if (accumulated <= 0) {
      await alert({
        title: "No rewards ready",
        description: "Nothing accumulated yet! Check back in an hour to collect coins.",
        type: "error"
      });
      return;
    }

    setIsClaimingReward(true);
    const updates: any = {};
    updates.raheeCoins = (currentUser.raheeCoins || 0) + accumulated;
    updates['freeRewards/lastHourlyClaim'] = new Date().toISOString();

    try {
      await update(ref(db, `users/${currentUser.id}`), updates);
      setIsClaimingReward(false);
      await alert({
        title: "Coins Collected! 🪙",
        description: `Successfully collected ${accumulated} Coins from your hourly treasury!`,
        type: "success"
      });
    } catch (error) {
      console.error(error);
      setIsClaimingReward(false);
      await alert({
        title: "Error",
        description: "Something went wrong collecting coins.",
        type: "error"
      });
    }
  };

  const startWatchAd = async (rewardType: number) => {
    if (!currentUser) return;
    const today = new Date().toISOString().split('T')[0];
    const freeRewards = currentUser.freeRewards || {};
    
    let isClaimed = false;
    if (rewardType === 1) isClaimed = freeRewards.lastClaimTier1 === today;
    else if (rewardType === 2) isClaimed = freeRewards.lastClaimTier2 === today;
    else if (rewardType === 3) isClaimed = freeRewards.lastClaimTier3 === today;
    else if (rewardType === 4) isClaimed = freeRewards.lastClaimTier4 === today;
    else if (rewardType === 5) isClaimed = freeRewards.lastClaimTier5 === today;

    if (isClaimed) {
      await alert({
        title: "Already Claimed Today",
        description: "You have already claimed this specific tier today! Check back tomorrow.",
        type: "error"
      });
      return;
    }

    if (rewardType === 1) {
      setIsClaimingReward(true);
      const updates: any = {};
      updates.raheeCoins = (currentUser.raheeCoins || 0) + 100;
      updates['freeRewards/lastClaimTier1'] = today;
      try {
        await update(ref(db, `users/${currentUser.id}`), updates);
        
        // Log the activity
        await logActivity(
          currentUser.id,
          currentUser.name || currentUser.username || 'Guest',
          'claim_free_reward',
          "Claimed Free Calendar Tier 1 Boost: 100 Coins (no ads)"
        );

        setIsClaimingReward(false);
        await alert({
          title: "Claimed 100 Coins! 🎉",
          description: "Instant first reward claimed successfully without watching any ads - Come back tomorrow!",
          type: "success"
        });
      } catch (err) {
        setIsClaimingReward(false);
        await alert({ title: "Error", description: "Could not claim premium boost.", type: "error" });
      }
      return;
    }

    let activeAd = null;
    if (adsFeed && adsFeed.length > 0) {
      const lastSeenAdId = localStorage.getItem(`last_seen_ad_${currentUser?.id || 'guest'}`);
      const fallbackPool = adsFeed;
      const primaryPool = adsFeed.filter(ad => ad.id !== lastSeenAdId);
      const activePool = primaryPool.length > 0 ? primaryPool : fallbackPool;
      
      const randomIndex = Math.floor(Math.random() * activePool.length);
      activeAd = activePool[randomIndex];
      
      if (activeAd && activeAd.id) {
        localStorage.setItem(`last_seen_ad_${currentUser?.id || 'guest'}`, activeAd.id);
      }
    } else {
      activeAd = {
        id: 'fallback_default',
        title: '🌟 Rahee Premium Trivia Star Campaign 🌟',
        mediaType: 'text',
        mediaUrl: 'Join Rahee Premium and gain access to infinite quiz boosts, daily streak extensions, and real cash certificates! Upgrade your learning journey today!',
        durationSeconds: 12,
        active: true,
        rewardValue: 'Booster bundle unlock ready'
      };
    }

    // Set countdown based on the tier or media
    setCurrentAd(activeAd);
    setAdCountdown(activeAd.durationSeconds || 12);
    setAdRewardType(rewardType);
    setShowAdPlayer(true);
  };

  const handleCompleteAdReward = async () => {
    if (!currentUser || isAdRewardClaiming || !adRewardType) return;
    setIsAdRewardClaiming(true);
    const today = new Date().toISOString().split('T')[0];
    const updates: any = {};

    let titleText = "Reward Active! 🎉";
    let rewardMsg = "";

    if (adRewardType === 2) {
      updates.raheeCoins = (currentUser.raheeCoins || 0) + 200;
      updates['freeRewards/lastClaimTier2'] = today;
      rewardMsg = "Successfully earned 200 Coins!";
    } else if (adRewardType === 3) {
      updates.raheeCoins = (currentUser.raheeCoins || 0) + 300;
      updates['freeRewards/lastClaimTier3'] = today;
      rewardMsg = "Successfully earned 300 Coins!";
    } else if (adRewardType === 4) {
      const currentLivesCount = currentUser.lives?.count ?? 16;
      updates['lives/count'] = Math.min(16, currentLivesCount + 2);
      updates['freeRewards/lastClaimTier4'] = today;
      rewardMsg = "Successfully earned +2 Hearts!";
    } else if (adRewardType === 5) {
      const lifelines = currentUser.lifelines || { fiftyFifty: 1, changeQuiz: 1, audiencePoll: 1, hint: 1 };
      const keys = ['fiftyFifty', 'changeQuiz', 'audiencePoll', 'hint'];
      const chosenKey = keys[Math.floor(Math.random() * keys.length)];
      updates[`lifelines/${chosenKey}`] = (lifelines[chosenKey as keyof typeof lifelines] || 0) + 1;
      updates['freeRewards/lastClaimTier5'] = today;
      rewardMsg = `Successfully earned +1 bonus lifeline: ${chosenKey}!`;
    }

    try {
      await update(ref(db, `users/${currentUser.id}`), updates);
      
      // Log the activity
      await logActivity(
        currentUser.id,
        currentUser.name || currentUser.username || 'Guest',
        'watch_ad_reward',
        `Watched Promo Ad & Claimed Tier ${adRewardType} Reward: ${rewardMsg}`
      );

      // Save log entry for ad impression viewing
      try {
        const adLogRef = push(ref(db, 'adLogs'));
        await set(adLogRef, {
          userId: currentUser.id,
          userName: currentUser.username || currentUser.name || 'Unknown User',
          adId: currentAd?.id || 'unknown_ad',
          adTitle: currentAd?.title || 'System Sponsored boost',
          rewardType: adRewardType,
          timestamp: Date.now()
        });
      } catch (logErr) {
        console.error("Failed to write ad log: ", logErr);
      }

      setIsAdRewardClaiming(false);
      setShowAdPlayer(false);
      setCurrentAd(null);
      setAdRewardType(null);
      await alert({
        title: titleText,
        description: rewardMsg,
        type: "success"
      });
    } catch (e) {
      console.error(e);
      setIsAdRewardClaiming(false);
      await alert({
        title: "Error",
        description: "Failed to claim ad reward.",
        type: "error"
      });
    }
  };

  const renderRewardsModal = () => {
    if (!showDailyRewards) return null;
    return (
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-y-auto">
         <motion.div 
           initial={{ opacity: 0 }} 
           animate={{ opacity: 1 }} 
           exit={{ opacity: 0 }}
           onClick={() => setShowDailyRewards(false)}
           className="absolute inset-0 bg-black/95 backdrop-blur-md fixed"
         />
         
         <motion.div 
           initial={{ scale: 0.9, y: 20, opacity: 0 }} 
           animate={{ scale: 1, y: 0, opacity: 1 }} 
           exit={{ scale: 0.9, y: 20, opacity: 0 }}
           className="relative bg-white dark:bg-[#0c0c0c] w-full max-w-md rounded-[3rem] border border-black/5 dark:border-white/10 p-6 md:p-8 text-center my-auto transition-all shadow-2xl overflow-hidden"
         >
            {/* Close Button */}
            <button 
              onClick={() => setShowDailyRewards(false)}
              className="absolute top-6 right-6 p-2 bg-black/5 dark:bg-white/5 rounded-2xl text-black/40 dark:text-white/40 hover:bg-red-500 hover:text-white transition-all z-20"
            >
               <X size={20} />
            </button>

            {/* Header */}
            <div className="mb-4 space-y-1">
               <div className="w-14 h-14 bg-purple-500/10 dark:bg-purple-500/20 text-purple-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-2 animate-bounce">
                  <Gift size={28} />
               </div>
               <h3 className="text-2xl font-black text-black dark:text-white uppercase tracking-tighter">Rewards center</h3>
               <p className="text-black/40 dark:text-white/40 font-bold text-[9px] uppercase tracking-widest leading-none">
                  Get free coins, booster hearts, and lifelines!
               </p>
            </div>

            {/* Dual Section Slide Switcher Tab */}
            <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-2xl mb-5">
               <button
                 type="button"
                 onClick={() => setRewardsTab('daily')}
                 className={cn(
                   "flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all",
                   rewardsTab === 'daily'
                     ? "bg-purple-500 text-white shadow-md font-extrabold"
                     : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white font-bold"
                 )}
               >
                 📅 Daily Calendar
               </button>
               <button
                 type="button"
                 onClick={() => setRewardsTab('free')}
                 className={cn(
                   "flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all relative",
                   rewardsTab === 'free'
                     ? "bg-purple-500 text-white shadow-md font-extrabold"
                     : "text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white font-bold"
                 )}
               >
                 ⚡ Free & Ads
                 {getHourlyAccumulated() > 0 && (
                   <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-yellow-500 rounded-full animate-ping" />
                 )}
               </button>
            </div>

            {/* Tab 1: Daily Login Calendar Grid */}
            {rewardsTab === 'daily' && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 col-span-full">
                   {[1, 2, 3, 4, 5, 6].map((dayNum) => {
                      const isClaimed = isRewardClaimed(dayNum);
                      const dailyRewards = currentUser?.dailyRewards || {};
                      const currentDay = dailyRewards.currentDay || 1;
                      const today = new Date().toISOString().split('T')[0];
                      const claimedToday = dailyRewards.lastClaimDate === today;
                      const isCurrent = dayNum === currentDay && !claimedToday;
                      
                      let rewardTitle = "";
                      let rewardIcon = null;

                      if (dayNum === 1) {
                        rewardTitle = "150 Coins";
                        rewardIcon = <Coins size={22} className="text-yellow-500" />;
                      } else if (dayNum === 2) {
                        rewardTitle = "2 Hearts";
                        rewardIcon = <Heart size={22} className="text-red-500 fill-red-500" />;
                      } else if (dayNum === 3) {
                        rewardTitle = "50:50";
                        rewardIcon = <HelpCircle size={22} className="text-blue-500" />;
                      } else if (dayNum === 4) {
                        rewardTitle = "300 Coins";
                        rewardIcon = <Coins size={22} className="text-yellow-500" />;
                      } else if (dayNum === 5) {
                        rewardTitle = "3 Hearts";
                        rewardIcon = <Heart size={22} className="text-red-500 fill-red-500" />;
                      } else if (dayNum === 6) {
                        rewardTitle = "Change Q";
                        rewardIcon = <RefreshCw size={22} className="text-green-500" />;
                      }

                      return (
                         <div 
                           key={dayNum} 
                           className={cn(
                              "relative p-3 rounded-2xl flex flex-col items-center justify-center border transition-all text-center group/card",
                              isClaimed 
                                 ? "bg-black/5 dark:bg-white/5 border-transparent opacity-45 line-through"
                                 : isCurrent
                                    ? "bg-purple-500/10 border-purple-500/40 text-purple-500 shadow-md scale-105"
                                    : "bg-black/5 dark:bg-white/5 border-transparent text-black dark:text-white"
                           )}
                         >
                            {isClaimed && (
                               <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white scale-90 shadow">
                                  <Check size={10} strokeWidth={4} />
                                </div>
                            )}
                            <p className={cn(
                               "text-[8px] font-black uppercase tracking-wider mb-1",
                               isCurrent ? "text-purple-500" : "text-black/30 dark:text-white/30"
                            )}>
                               Day {dayNum}
                            </p>
                            <div className={cn(
                               "w-9 h-9 rounded-xl flex items-center justify-center mb-1 bg-black/5 dark:bg-white/5",
                               isCurrent && "bg-purple-500/20"
                            )}>
                               {rewardIcon}
                            </div>
                            <p className="font-extrabold text-[9px] uppercase tracking-tight text-black dark:text-white truncate max-w-full">
                               {rewardTitle}
                            </p>
                         </div>
                      );
                   })}
                   
                   {/* Day 7 Mega Reward Option */}
                   {(() => {
                      const dayNum = 7;
                      const isClaimed = isRewardClaimed(dayNum);
                      const dailyRewards = currentUser?.dailyRewards || {};
                      const currentDay = dailyRewards.currentDay || 1;
                      const today = new Date().toISOString().split('T')[0];
                      const claimedToday = dailyRewards.lastClaimDate === today;
                      const isCurrent = dayNum === currentDay && !claimedToday;

                      return (
                         <div 
                           className={cn(
                              "col-span-3 relative p-3 rounded-[1.8rem] flex items-center justify-between border transition-all text-left",
                              isClaimed 
                                 ? "bg-black/5 dark:bg-white/5 border-transparent opacity-45 line-through"
                                 : isCurrent
                                    ? "bg-gradient-to-r from-yellow-500/10 to-purple-500/10 border-purple-400 text-purple-500 shadow-lg scale-[1.02]"
                                    : "bg-black/5 dark:bg-white/5 border-transparent text-black dark:text-white"
                           )}
                         >
                            <div className="flex items-center gap-3">
                               <div className={cn(
                                  "w-10 h-10 rounded-xl flex items-center justify-center",
                                  isCurrent ? "bg-gradient-to-r from-yellow-500/20 to-purple-500/20 animate-pulse" : "bg-black/5 dark:bg-white/10"
                               )}>
                                  <Gift size={20} className={cn(isCurrent ? "text-purple-500" : "text-black/40 dark:text-white/40")} />
                               </div>
                               <div>
                                  <p className={cn(
                                     "text-[8px] font-black uppercase tracking-wider leading-none",
                                     isCurrent ? "text-purple-500" : "text-black/30 dark:text-white/30"
                                  )}>
                                     Day 7 Mega Chest
                                  </p>
                                  <p className="font-black text-[10px] uppercase tracking-tight text-black dark:text-white mt-0.5">
                                     500 Coins + 5 Hearts + Hint
                                  </p>
                               </div>
                            </div>
                            {isClaimed ? (
                               <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white shadow">
                                  <Check size={12} strokeWidth={4} />
                               </div>
                            ) : isCurrent ? (
                               <span className="text-[7px] font-black bg-purple-500 text-white px-2 py-0.5 rounded-md animate-pulse uppercase tracking-wider">
                                  ACTIVE
                               </span>
                            ) : (
                               <span className="text-[7px] font-black text-black/20 dark:text-white/20 uppercase tracking-wider">
                                  LOCKED
                               </span>
                            )}
                         </div>
                      );
                   })()}
                </div>

                {/* Daily Claim Action or claim status */}
                {(() => {
                   const dailyRewards = currentUser?.dailyRewards || {};
                   const lastClaimDate = dailyRewards.lastClaimDate || '';
                   const today = new Date().toISOString().split('T')[0];
                   const hasClaimedToday = lastClaimDate === today;
                   const currentDay = dailyRewards.currentDay || 1;

                   if (hasClaimedToday) {
                     return (
                        <div className="bg-green-500/10 text-green-500 p-3.5 rounded-xl border border-green-500/20 font-black text-[10px] uppercase tracking-wider flex items-center justify-center gap-2">
                           <Check size={14} strokeWidth={4} />
                           <span>Reward Already Claimed today!</span>
                        </div>
                     );
                   } else {
                     return (
                        <button 
                          onClick={handleClaimReward}
                          disabled={isClaimingReward}
                          className="w-full py-4 bg-purple-605 to-indigo-65 bg-purple-600 hover:bg-purple-700 text-white font-black uppercase tracking-widest text-[10px] rounded-xl active:scale-95 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                        >
                           {isClaimingReward ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                           CLAIM DAY {currentDay} REWARD
                        </button>
                     );
                   }
                })()}
              </div>
            )}

            {/* Tab 2: Free hourly accumulated, and 5 tiered promo/ad rewards */}
            {rewardsTab === 'free' && (
              <div className="space-y-5 text-left">
                {/* Part A: Free Hourly Accrual Box */}
                <div className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl border border-black/5 dark:border-white/5 relative overflow-hidden">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-[8px] font-black opacity-30 uppercase tracking-widest leading-none mb-0.5 animate-pulse">🚀 Hour Treasury Miner</p>
                      <h4 className="text-xl font-black text-black dark:text-white uppercase leading-none">
                        {getHourlyAccumulated()} Coins Ready
                      </h4>
                      {getHourlyAccumulated() <= 0 && (
                        <p className="text-[9px] font-black uppercase text-purple-500 mt-1 flex items-center gap-1 leading-none">
                          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping" />
                          <span>Next Coin in:</span>
                          <span className="font-mono bg-purple-500/10 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-md text-[8.5px]">{hourlyTimeLeftStr || "1h 00m 00s"}</span>
                        </p>
                      )}
                    </div>
                    <span className="text-[8px] font-black text-primary px-2 py-1 bg-primary/10 rounded-lg uppercase tracking-wider">
                      ⚡ +100 c / HR
                    </span>
                  </div>

                  {/* Mini Progress bar */}
                  <div className="w-full h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full transition-all duration-1000"
                      style={{ width: `${getHourlyAccumulated() > 0 ? 100 : getNextHourlyTickProgress()}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center">
                    <p className="text-[8.5px] font-bold text-black/40 dark:text-white/40 leading-none uppercase">
                      {getHourlyAccumulated() >= 2400 ? "Cap: 24h filled!" : "Accumulating automatically..."}
                    </p>
                    <button
                      type="button"
                      disabled={getHourlyAccumulated() <= 0 || isClaimingReward}
                      onClick={handleClaimHourlyReward}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-transform cursor-pointer",
                        getHourlyAccumulated() > 0
                          ? "bg-primary text-black hover:scale-105 active:scale-95 shadow-md font-black"
                          : "bg-black/10 dark:bg-white/5 text-black/30 dark:text-white/25 cursor-not-allowed font-medium text-[8px]"
                      )}
                    >
                      {isClaimingReward ? "Claiming..." : getHourlyAccumulated() > 0 ? "CLAIM MINTS" : `LOCKED [${hourlyTimeLeftStr || 'COUNTING'}]`}
                    </button>
                  </div>
                </div>

                {/* Part B: Tiered Ads Promo Block */}
                <div className="space-y-2">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-tight text-black dark:text-white leading-none">Daily Booster Station</h4>
                    <p className="text-[8px] font-bold text-black/30 dark:text-white/30 uppercase tracking-widest mt-0.5 leading-none">Watch sponsored promos for infinite boosts</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {[1, 2, 3, 4, 5].map((tierNum) => {
                      const today = new Date().toISOString().split('T')[0];
                      const freeRewards = currentUser?.freeRewards || {};
                      let isClaimed = false;
                      if (tierNum === 1) isClaimed = freeRewards.lastClaimTier1 === today;
                      else if (tierNum === 2) isClaimed = freeRewards.lastClaimTier2 === today;
                      else if (tierNum === 3) isClaimed = freeRewards.lastClaimTier3 === today;
                      else if (tierNum === 4) isClaimed = freeRewards.lastClaimTier4 === today;
                      else if (tierNum === 5) isClaimed = freeRewards.lastClaimTier5 === today;

                      let title = "";
                      let icon = null;
                      let costText = "";
                      let benefit = "";

                      if (tierNum === 1) {
                        title = "1. Instant Starter";
                        icon = <Gift size={16} className="text-pink-500 animate-pulse" />;
                        costText = "FREE (No Ad)";
                        benefit = "100 coins";
                      } else if (tierNum === 2) {
                        title = "2. Silver Coin Chest";
                        icon = <Coins size={16} className="text-yellow-500 animate-pulse" />;
                        costText = "Play Ad watch";
                        benefit = "200 coins";
                      } else if (tierNum === 3) {
                        title = "3. Golden Grand Loot";
                        icon = <Coins size={16} className="text-purple-500 animate-pulse" />;
                        costText = "Play Ad watch";
                        benefit = "300 coins";
                      } else if (tierNum === 4) {
                        title = "4. Heart Refuel II";
                        icon = <Heart size={16} className="text-red-500 fill-red-500 animate-pulse" />;
                        costText = "Play Ad watch";
                        benefit = "+2 Hearts";
                      } else if (tierNum === 5) {
                        title = "5. Ultimate Mystery";
                        icon = <HelpCircle size={16} className="text-sky-550 animate-pulse text-sky-500" />;
                        costText = "Play Ad watch";
                        benefit = "+1 Lifeline";
                      }

                      return (
                        <div
                          key={tierNum}
                          className={cn(
                            "p-3 rounded-2xl flex flex-col justify-between border text-left relative overflow-hidden transition-all",
                            isClaimed
                              ? "bg-black/5 dark:bg-white/5 border-transparent opacity-40 line-through"
                              : "bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 hover:border-purple-500/50 hover:scale-[1.01] cursor-pointer"
                          )}
                          onClick={() => !isClaimed && startWatchAd(tierNum)}
                        >
                          {isClaimed && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center text-white text-[8px] font-black shadow inline-block">
                              ✓
                            </div>
                          )}
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              {icon}
                              <p className="font-extrabold text-[9px] text-black dark:text-white uppercase leading-none truncate">{title}</p>
                            </div>
                            <p className={cn(
                              "text-[7px] font-black uppercase tracking-wider leading-none",
                              tierNum === 1 ? "text-green-500" : "text-purple-500"
                            )}>
                              {costText}
                            </p>
                          </div>
                          <div className="mt-2.5">
                            <p className="text-[7px] font-black opacity-30 uppercase tracking-widest leading-none">Bonus</p>
                            <p className="font-black text-[10px] text-black dark:text-white uppercase mt-0.5 leading-none">{benefit}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
         </motion.div>
      </div>
    );
  };

  const renderAdPlayer = () => {
    if (!showAdPlayer || !currentAd) return null;
    
    const defaultSlogans = [
      "Sharpen your mind daily! Knowledge is the only wealth that grows when shared. Keep playing, keep winning!",
      "Upgrade to Rahee Premium for unlimited lives, instant expert lifelines, and exclusive tournament tickets!",
      "Master general science, history, geography, and code trivia in high-stakes quiz matches against global players!",
      "Join 10,000+ ultimate learners building consecutive daily streaks to unlock authorized certificates!",
      "Power up your brain with lightning quiz rounds and level up your ranking to become the ultimate Trivia King!"
    ];
    
    const selectedSlogan = currentAd.mediaUrl || defaultSlogans[(adRewardType || 2) % defaultSlogans.length];

    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#050505] text-white p-6 md:p-12 overflow-hidden select-none">
        {/* Floating background ambient glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none animate-pulse" />
        
        {/* Ad Status Header */}
        <div className="absolute top-8 left-8 right-8 flex justify-between items-center z-10">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">SPONSORED BROADCAST LIVE</p>
          </div>
          <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-full flex items-center gap-2 backdrop-blur-md">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-purple-400">Reward Tier {adRewardType}</span>
            {adCountdown > 0 ? (
              <span className="text-xs font-black font-mono text-yellow-500">{adCountdown}s</span>
            ) : (
              <span className="text-xs font-black text-green-400 animate-pulse">READY</span>
            )}
          </div>
        </div>

        {/* Big Center Display for Slogan & Promotional Content */}
        <div className="max-w-2xl w-full text-center space-y-8 my-auto z-10 px-4">
          <div className="space-y-4">
            <p className="text-purple-500 text-xs font-black uppercase tracking-widest leading-none">
              — Rahee Learning Network Promo —
            </p>
            <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">
              {currentAd?.title || "EXPLORE THE NEXT FRONTIER"}
            </h2>
          </div>

          {/* Slogan Container Box */}
          <div className="relative py-8 px-6 md:py-12 md:px-10 rounded-[2.5rem] bg-white/5 border border-white/5 backdrop-blur-sm shadow-2xl space-y-6 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 pointer-events-none" />
            
            <p className="text-lg md:text-2xl font-bold text-white/90 leading-relaxed tracking-tight italic select-text selection:bg-purple-500 selection:text-white">
              "{selectedSlogan}"
            </p>
            
            <div className="pt-4 flex items-center justify-center gap-3">
              <span className="w-1.5 h-1.5 bg-white/30 rounded-full" />
              <p className="text-[9px] font-black uppercase tracking-widest text-white/30">RAHEE INC. BRAND PARTNERSHIP</p>
              <span className="w-1.5 h-1.5 bg-white/30 rounded-full" />
            </div>
          </div>

          {/* Slogan Bottom Callouts */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-white/[0.02] rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">Verified</p>
              <p className="text-xs font-bold text-white/80">Premium Ad</p>
            </div>
            <div className="p-3 bg-white/[0.02] rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">Sponsor</p>
              <p className="text-xs font-bold text-white/80">Trivio Star</p>
            </div>
            <div className="p-3 bg-white/[0.02] rounded-2xl border border-white/5">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-0.5">Conversion</p>
              <p className="text-xs font-bold text-white/80">Instant Coins</p>
            </div>
          </div>
        </div>

        {/* Bottom Interactive Claim / Close bar */}
        <div className="w-full max-w-sm text-center space-y-4 pb-8 z-10 px-4">
          {adCountdown > 0 ? (
            <div className="space-y-2">
              <div className="w-full py-4 bg-white/5 border border-white/10 text-white/40 rounded-2xl text-[10px] font-black tracking-widest uppercase flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={14} />
                <span>Watch ad: {adCountdown}s remaining</span>
              </div>
              <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest font-mono">
                Do not exit to keep your boost progress
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <button 
                onClick={handleCompleteAdReward}
                disabled={isAdRewardClaiming}
                className="w-full py-5 bg-gradient-to-r from-purple-500 to-indigo-500 bg-purple-600 hover:bg-purple-500 text-white rounded-2xl text-xs font-black tracking-widest uppercase cursor-pointer shadow-lg shadow-purple-500/20 active:scale-95 transition-transform flex items-center justify-center gap-2 animate-bounce"
              >
                {isAdRewardClaiming ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} strokeWidth={3} />}
                CLAIM YOUR BOOSTER REWARD!
              </button>
              <button 
                onClick={() => {
                  setShowAdPlayer(false);
                  setCurrentAd(null);
                  setAdRewardType(null);
                }}
                className="text-[9px] font-black hover:text-white text-white/40 tracking-widest uppercase transition-colors"
              >
                CANCEL & FORFEIT REWARD
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderHome = () => {
    const userRank = getUserRank(currentUser?.id || '');
    const lang = currentUser?.language || 'en';
    const t = translations[lang] || translations.en;
    
    return (
    <div className="p-6 space-y-8">
      {/* Profile Summary */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex items-center justify-between"
      >
        <div 
          onClick={() => setShowProfile(true)}
          className="flex items-center gap-2 cursor-pointer group shrink-0"
        >
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-black font-black text-xl shadow-[0_0_15px_rgba(var(--primary-color),0.2)] group-hover:scale-105 transition-transform overflow-hidden border-2 border-primary">
            {currentUser?.avatarUrl ? (
              <img src={currentUser.avatarUrl} className="w-full h-full object-cover" alt="Avatar" />
            ) : (
              currentUser?.name?.[0].toUpperCase()
            )}
          </div>
          <div className="max-w-[100px]">
            <h2 className="text-lg font-black flex items-center gap-1.5 text-black dark:text-white group-hover:text-primary transition-colors truncate">
              {currentUser?.name}
              {currentUser?.role === 'admin' && <Shield size={14} className="text-primary shrink-0" />}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <button 
                onClick={(e) => { e.stopPropagation(); toggleLanguage(); }}
                className="px-1.5 py-0.5 bg-primary/10 text-primary text-[7px] font-black rounded uppercase tracking-widest border border-primary/20 hover:bg-primary hover:text-black transition-all"
              >
                {lang === 'en' ? 'English' : 'हिंदी'}
              </button>
              <span className="text-black/30 dark:text-white/40 text-[8px] font-bold uppercase tracking-widest leading-none">#{userRank}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center overflow-x-auto no-scrollbar pb-1 pl-4 -mr-4 flex-1">
          <div className="flex gap-2 flex-nowrap items-center ml-auto pr-4">
            {currentUser?.streak !== undefined && currentUser.streak > 0 && (
              <button 
                onClick={(e) => { e.stopPropagation(); setShowStreakModal(true); setStreakView('weekly'); }}
                className="flex items-center gap-2 px-3 h-10 bg-orange-500/10 dark:bg-orange-500/5 rounded-xl border border-orange-500/20 shrink-0 hover:scale-105 active:scale-95 transition-all"
              >
                 <Zap size={14} className="text-orange-500 fill-orange-500" />
                 <span className="text-sm font-black text-orange-500">{currentUser.streak}</span>
              </button>
            )}
            {settings?.livesEnabledForAll && currentUser?.lives?.enabled && (
              <button 
                onClick={(e) => { e.stopPropagation(); setShowLivesModal(true); }}
                className="flex items-center gap-2 px-3 h-10 bg-red-500/10 dark:bg-red-500/5 rounded-xl border border-red-500/20 hover:scale-105 active:scale-95 transition-all shrink-0"
              >
                 <Heart size={14} className="text-red-500 fill-red-500" />
                 <span className="text-sm font-black text-red-500">{currentUser.lives.count}</span>
              </button>
            )}
            <button 
              onClick={(e) => { e.stopPropagation(); setActiveTab('shop'); }}
              className="flex items-center gap-2 px-3 h-10 bg-black/5 dark:bg-[#1a1a1a] rounded-xl border border-black/5 dark:border-white/5 shrink-0"
            >
               <Coins size={14} className="text-primary italic" />
               <span className="text-sm font-black text-primary">{currentUser?.raheeCoins || 0}</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowHistory(true); }}
              className="p-2.5 h-10 bg-black/5 dark:bg-[#1a1a1a] rounded-xl text-black/40 dark:text-white/40 hover:text-primary transition-colors border border-black/5 dark:border-white/5 shrink-0"
            >
              <HistoryIcon size={18} />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setIsDark(!isDark); }}
              className="p-2.5 h-10 bg-black/5 dark:bg-[#1a1a1a] rounded-xl text-black/40 dark:text-white/40 hover:text-primary transition-colors border border-black/5 dark:border-white/5 shrink-0"
            >
              {isDark ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowSettings(true); }}
              className="p-2.5 h-10 bg-black/5 dark:bg-[#1a1a1a] rounded-xl text-black/40 dark:text-white/40 hover:text-primary transition-colors border border-black/5 dark:border-white/5 shrink-0"
            >
              <SettingsIcon size={18} />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Action Stack */}
      <div className="space-y-4">
        {/* Rahee Pass Card */}
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowRaheePass(true)}
          className="relative overflow-hidden bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 p-5 rounded-3xl cursor-pointer shadow-lg shadow-yellow-500/20 group h-24"
        >
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-125 transition-transform translate-x-4 -translate-y-4">
            <Star size={80} fill="black" />
          </div>
          <div className="relative z-10 flex items-center justify-between h-full">
            <div className="flex items-center gap-4">
               <div className="w-14 h-14 bg-black/10 rounded-2xl flex items-center justify-center text-black shadow-inner shrink-0 rotate-3 group-hover:rotate-0 transition-transform">
                  <Trophy size={28} />
               </div>
               <div>
                  <h3 className="text-black font-black text-xl uppercase tracking-tighter leading-tight">{t.raheePass}</h3>
                  <p className="text-black/60 text-[9px] font-black uppercase tracking-widest leading-none mt-0.5">LVL {(currentUser?.rank || 0)} • {currentUser?.xp} XP</p>
               </div>
            </div>
            <div className="flex flex-col items-end gap-2 pr-2">
               <div className="w-24 h-2 bg-black/10 rounded-full overflow-hidden border border-black/5">
                  <motion.div 
                     initial={{ width: 0 }}
                     animate={{ width: `${((currentUser?.xp || 0) % 1600) / 16}%` }}
                     className="h-full bg-black rounded-full"
                  />
               </div>
               <p className="text-[8px] font-black text-black/40 uppercase tracking-widest">{Math.round(((currentUser?.xp || 0) % 1600) / 16)}% TO LEVEL {(currentUser?.rank || 0) + 1}</p>
            </div>
          </div>
        </motion.div>

        {/* Daily Login Rewards Card */}
        <motion.div 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowDailyRewards(true)}
          className="relative overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-5 rounded-3xl cursor-pointer shadow-lg shadow-purple-500/20 group h-24"
        >
          <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:scale-125 transition-transform translate-x-4 -translate-y-4">
            <Gift size={80} fill="black" />
          </div>
          <div className="relative z-10 flex items-center justify-between h-full">
            <div className="flex items-center gap-4">
               <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white shadow-inner shrink-0 rotate-3 group-hover:rotate-0 transition-transform">
                  <Gift size={28} />
               </div>
               <div>
                  <h3 className="text-white font-black text-xl uppercase tracking-tighter leading-tight">Daily Rewards</h3>
                  <p className="text-white/80 text-[9px] font-black uppercase tracking-widest leading-none mt-1">
                    {(() => {
                      const today = new Date().toISOString().split('T')[0];
                      const isClaimedToday = (currentUser?.dailyRewards?.lastClaimDate === today);
                      const currentDay = currentUser?.dailyRewards?.currentDay || 1;
                      return isClaimedToday 
                        ? `All claimed for today • Next: Day ${currentDay}` 
                        : `Claim Day ${currentDay} Reward! 🎉`;
                    })()}
                  </p>
               </div>
            </div>
            <div className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl text-[9px] font-black shadow-sm flex items-center gap-1.5 border border-white/20 transition-all">
               <span>VIEW BOARD</span>
               <ChevronRight size={12} />
            </div>
          </div>
        </motion.div>

        {/* Play/Resume Quiz */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleStartQuiz}
          className="w-full h-24 bg-primary rounded-3xl p-5 flex items-center justify-between text-black shadow-lg shadow-primary/20 active:scale-95 transition-all group overflow-hidden"
        >
          <div className="flex items-center gap-4">
             <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Play size={28} fill="currentColor" />
             </div>
             <div className="text-left">
                <h3 className="font-black text-xl uppercase tracking-tighter leading-none mb-1">
                  {(currentUser?.currentQuizIndex || 0) > 0 ? (lang === 'en' ? 'Resume' : 'फिर से शुरू करें') : t.startQuiz}
                </h3>
                <p className="text-black/60 text-[9px] font-black uppercase tracking-widest leading-none">
                  {(currentUser?.currentQuizIndex || 0) > 0 ? "CONTINUE YOUR JOURNEY" : "BEGIN YOUR ADVENTURE"}
                </p>
             </div>
          </div>
          <ChevronRight size={24} className="text-black/40 group-hover:translate-x-1 transition-transform" />
        </motion.button>

        {/* New Topic Selection */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            if (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic) return;
            setShowTopicSelect(true);
          }}
          className={cn(
             "w-full h-24 bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/10 rounded-3xl p-5 flex items-center justify-between active:scale-95 transition-all group",
             (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic) && "opacity-50 grayscale cursor-not-allowed"
          )}
        >
          <div className="flex items-center gap-4">
             <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0 group-hover:rotate-90 transition-transform">
                <Grid size={28} />
             </div>
             <div className="text-left">
                <h3 className="font-black text-xl uppercase tracking-tighter text-black dark:text-white leading-none mb-1">
                  {lang === 'en' ? (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic ? 'Topic Locked' : 'New Topic') : (currentUser?.fixedTopicId && !currentUser?.canSwitchTopic ? 'विषय लॉक है' : 'नया विषय')}
                </h3>
                <p className="text-black/30 dark:text-white/30 text-[9px] font-black uppercase tracking-widest leading-none">EXPLORE NEW SUBJECTS</p>
             </div>
          </div>
          <ChevronRight size={24} className="text-black/20 dark:text-white/20 group-hover:translate-x-1 transition-transform" />
        </motion.button>

        {/* Battle Hub */}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => checkGameStart(() => setShowMultiplayerHub(true))}
          className="w-full h-24 bg-black/5 dark:bg-[#111] border border-black/5 dark:border-white/10 rounded-3xl p-5 flex items-center justify-between active:scale-95 transition-all group"
        >
          <div className="flex items-center gap-4">
             <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-black shadow-lg shadow-primary/20 shrink-0 group-hover:scale-110 transition-transform -rotate-12 group-hover:rotate-0">
                <Swords size={28} />
             </div>
             <div className="text-left">
                <h3 className="font-black text-xl uppercase tracking-tighter text-black dark:text-white leading-none mb-1">{t.battleHub}</h3>
                <p className="text-black/30 dark:text-white/30 text-[9px] font-black uppercase tracking-widest leading-none">CHALLENGE OTHERS WORLDWIDE</p>
             </div>
          </div>
          <ChevronRight size={24} className="text-black/20 dark:text-white/20 group-hover:translate-x-1 transition-transform" />
        </motion.button>

        {/* Active Topic / Progress Summary */}
        {((currentUser?.currentRound || 0) > 1 || (currentUser?.currentQuizIndex || 0) > 0) && (
          <motion.div 
            whileHover={{ scale: 1.02 }}
            className="w-full h-24 bg-black/5 dark:bg-[#111] border-2 border-primary/20 border-dashed rounded-3xl p-5 flex items-center justify-between group cursor-pointer"
            onClick={handleStartQuiz}
          >
            <div className="flex items-center gap-4">
               <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shrink-0 group-hover:scale-110 transition-transform">
                  <Clock size={28} />
               </div>
               <div className="text-left overflow-hidden">
                  <h3 className="font-black text-xl uppercase tracking-tighter text-black dark:text-white leading-none mb-0.5 truncate" title={
                    currentUser?.selectedTopicIds && currentUser.selectedTopicIds.length > 0
                      ? topics.filter(t => currentUser.selectedTopicIds?.includes(t.id)).map(t => t.name).join(', ')
                      : (topics.find(t => t.id === currentUser?.selectedTopicId)?.name || 'General Knowledge')
                  }>
                    {currentUser?.selectedTopicIds && currentUser.selectedTopicIds.length > 0
                      ? topics.filter(t => currentUser.selectedTopicIds?.includes(t.id)).map(t => t.name).join(', ')
                      : (topics.find(t => t.id === currentUser?.selectedTopicId)?.name || 'General Knowledge')}
                  </h3>
                  <p className="text-black/30 dark:text-white/30 text-[9px] font-black uppercase tracking-widest leading-none">
                    Round {currentUser?.currentRound || 1} • {currentUser?.currentQuizIndex || 0} Solved
                  </p>
               </div>
            </div>
            <div className="bg-primary/20 text-primary px-3 py-1.5 rounded-xl text-[9px] font-black shadow-sm flex flex-col items-center gap-0.5 border border-primary/30">
               <span>ACTIVE</span>
               <div className="w-6 h-0.5 bg-primary rounded-full" />
            </div>
          </motion.div>
        )}



        {/* Admin Quick Access */}
        {currentUser?.role === 'admin' && (
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab('admin')}
            className="w-full h-24 bg-red-500/5 dark:bg-red-500/10 border-2 border-red-500/20 rounded-3xl p-5 flex items-center justify-between text-red-500 group hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5"
          >
            <div className="flex items-center gap-4">
               <div className="w-14 h-14 bg-red-500/20 rounded-2xl flex items-center justify-center shrink-0 border border-red-500/20">
                  <Shield size={28} />
               </div>
               <div className="text-left">
                  <p className="font-black text-xl uppercase tracking-tighter leading-none mb-1">ADMIN PANEL</p>
                  <p className="opacity-60 text-[9px] font-black uppercase tracking-widest leading-none">SYSTEMS READY</p>
               </div>
            </div>
            <ChevronRight size={24} className="opacity-40 group-hover:translate-x-1 transition-transform" />
          </motion.button>
        )}
      </div>
    </div>
    );
  };

  const lang = currentUser?.language || 'en';
  const t = translations[lang] || translations.en;

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      setShowSettings={setShowSettings} 
      setShowFeedback={setShowFeedback}
    >
      {isImpersonating && currentUser && (
        <div className="bg-red-500 text-white px-4 py-2.5 flex items-center justify-between font-black text-xs uppercase tracking-wider relative z-[150] shadow-md border-b border-red-600">
          <div className="flex items-center gap-2">
            <span className="animate-pulse bg-white text-red-500 px-1.5 py-0.5 rounded text-[9px] font-black mr-1">BOT MODE</span>
            <span>Playing as: {currentUser.name} (@{currentUser.username || 'Bot'})</span>
          </div>
          <button 
            onClick={() => {
              stopImpersonating();
              setActiveTab('home');
            }}
            className="bg-white text-red-500 px-3 py-1 rounded-xl transition-all text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 shadow"
          >
            Exit Bot
          </button>
        </div>
      )}
      <AnimatePresence mode="wait">
        {activeTab === 'home' && (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {renderHome()}
          </motion.div>
        )}
        {activeTab === 'leaderboard' && <Leaderboard />}
        {activeTab === 'shop' && <Shop onClose={() => setActiveTab('home')} language={lang} />}
        {activeTab === 'friends' && <SocialHub onClose={() => setActiveTab('home')} allUsers={allUsers} totalQuizzesCount={totalQuizzesCount} />}
        {activeTab === 'events' && <Events />}
        {activeTab === 'admin' && currentUser?.role === 'admin' && <AdminPanel />}
        {activeTab === 'tracking' && <TrackingHub onClose={() => setActiveTab('home')} />}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {showRaheePass && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 overflow-y-auto pt-20">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setShowRaheePass(false)}
               className="absolute inset-0 bg-black/90 backdrop-blur-md fixed"
             />
             <motion.div 
               initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
               className="relative bg-white dark:bg-[#050505] w-full max-w-sm rounded-[3rem] overflow-hidden border border-black/5 dark:border-white/5 mb-20"
             >
                 <div className="bg-primary p-8 pt-12 text-black relative">
                    <button 
                      onClick={() => setShowRaheePass(false)}
                      className="absolute top-6 right-6 p-2 bg-black/10 rounded-full hover:bg-black/20 transition-all active:scale-90"
                    >
                      <X size={20} />
                    </button>
                    <div className="space-y-1 mb-8">
                       <h2 className="text-black font-black text-4xl uppercase tracking-tighter leading-none">{t.raheePass}</h2>
                       <p className="text-black/60 font-black text-sm uppercase tracking-widest">{currentUser?.name}</p>
                    </div>
                    <div className="bg-white dark:bg-black p-6 rounded-3xl shadow-xl border border-black/5 dark:border-white/5">
                       <div className="flex justify-between items-center mb-1">
                          <span className="text-black/40 dark:text-white/40 text-[8px] font-black uppercase tracking-widest">Total XP</span>
                          <div className="bg-yellow-500 text-black px-2 py-0.5 rounded text-[8px] font-black uppercase">Active</div>
                       </div>
                       <div className="flex items-baseline gap-2">
                          <span className="text-5xl font-black text-black dark:text-white">{currentUser?.xp}</span>
                       </div>
                    </div>
                 </div>
                 <div className="p-8 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                       <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                          <p className="text-black/20 dark:text-white/20 text-[8px] font-black uppercase mb-1 tracking-widest leading-none">{t.rank}</p>
                          <p className="font-black uppercase text-sm">#{getUserRank(currentUser?.id || '')}</p>
                       </div>
                       <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl">
                          <p className="text-black/20 dark:text-white/20 text-[8px] font-black uppercase mb-1 tracking-widest leading-none">Round</p>
                          <p className="font-black uppercase text-sm">R-{currentUser?.currentRound || 1}</p>
                       </div>
                    </div>
                    
                    <div className="space-y-2">
                       <p className="text-[10px] font-black uppercase tracking-widest text-black/30 dark:text-white/30 ml-1">Topic Performance</p>
                       <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                          {[...topics].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((topic, tIdx) => {
                             const stat = currentUser?.scores?.[topic.id];
                             const percentage = stat ? Math.round((stat.correct / stat.total) * 100) : 0;
                             if (!stat) return null;
                             return (
                                <div key={`main-topic-stat-${topic.id || tIdx}-${tIdx}`} className="bg-black/5 dark:bg-white/5 p-3 rounded-xl flex items-center justify-between border border-black/5 dark:border-white/5">
                                   <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                         <HelpCircle size={14} />
                                      </div>
                                      <div>
                                         <p className="text-[10px] font-black uppercase tracking-tight">{topic.name}</p>
                                         <p className="text-[10px] text-black/40 dark:text-white/40">{stat.correct}/{stat.total} Correct</p>
                                      </div>
                                   </div>
                                   <div className="text-right">
                                      <p className="text-xs font-black text-primary">{percentage}%</p>
                                   </div>
                                </div>
                             );
                          })}
                       </div>
                    </div>

                    <button onClick={() => setShowRaheePass(false)} className="w-full bg-black dark:bg-white text-white dark:text-black py-4 rounded-2xl font-black uppercase tracking-widest text-[10px]">Close Pass</button>
                 </div>
             </motion.div>
          </div>
        )}

        {showProfile && (
           <div className="fixed inset-0 z-[110] flex items-start justify-center p-4 overflow-y-auto pt-20">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowProfile(false)}
                className="absolute inset-0 bg-black/90 backdrop-blur-xl fixed"
              />
              <motion.div 
                initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="relative bg-white dark:bg-[#111] w-full max-w-md rounded-[3rem] border border-black/5 dark:border-white/10 p-8 shadow-2xl mb-20"
              >
                 <button 
                   onClick={() => setShowProfile(false)}
                   className="absolute top-6 right-6 p-3 bg-black/5 dark:bg-white/5 rounded-2xl text-black/40 dark:text-white/40 hover:bg-red-500 hover:text-white transition-all active:scale-90 z-10"
                 >
                    <X size={24} />
                 </button>
                 <div className="flex items-center gap-6 mb-8">
                    <div className="relative group/avatar">
                       <div className="w-24 h-24 bg-primary rounded-[2rem] flex items-center justify-center text-black font-black text-4xl shadow-xl shadow-primary/20 overflow-hidden border-2 border-primary">
                          {currentUser?.avatarUrl || currentUser?.pendingAvatarUrl ? (
                             <img 
                               src={currentUser.pendingAvatarUrl || currentUser.avatarUrl} 
                               className={cn("w-full h-full object-cover", currentUser?.pendingAvatarUrl && "opacity-50")} 
                               alt="Avatar" 
                             />
                          ) : (
                             currentUser?.name?.[0].toUpperCase()
                          )}
                          {currentUser?.pendingAvatarUrl && (
                             <div className="absolute inset-0 flex items-center justify-center">
                                <Clock size={24} className="text-white drop-shadow-lg animate-pulse" />
                             </div>
                          )}
                       </div>
                       <button 
                         onClick={() => setIsEditingAvatar(!isEditingAvatar)}
                         className="absolute -bottom-2 -right-2 w-10 h-10 bg-white dark:bg-black rounded-2xl flex items-center justify-center text-primary shadow-xl border border-black/5 dark:border-white/10 active:scale-90 transition-all hover:bg-primary hover:text-black"
                       >
                          <Camera size={18} />
                       </button>
                    </div>
                    <div>
                       <h2 className="text-3xl font-black text-black dark:text-white leading-none mb-1">{currentUser?.name}</h2>
                       <p className="text-primary font-black uppercase tracking-widest text-xs italic">LVL {currentUser?.rank || 0} ELITE PLAYER</p>
                       {currentUser?.pendingAvatarUrl && (
                          <p className="text-[8px] font-black uppercase tracking-widest text-yellow-500 mt-1 flex items-center gap-1">
                             <Clock size={10} /> Pending Verification
                          </p>
                       )}
                    </div>
                 </div>

                 <AnimatePresence>
                    {isEditingAvatar && (
                       <motion.div 
                         initial={{ height: 0, opacity: 0 }}
                         animate={{ height: 'auto', opacity: 1 }}
                         exit={{ height: 0, opacity: 0 }}
                         className="overflow-hidden mb-8"
                       >
                          <div className="bg-black/5 dark:bg-white/5 p-6 rounded-[2rem] border border-black/5 dark:border-white/5 space-y-6">
                             <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                   <p className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Select Avatar</p>
                                   <div className="flex items-center gap-4">
                                      {(currentUser?.avatarUrl || currentUser?.pendingAvatarUrl) && (
                                         <button 
                                           onClick={() => selectAvatar('')}
                                           className="text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-red-600 transition-all"
                                         >
                                            Remove
                                         </button>
                                      )}
                                      <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary cursor-pointer hover:underline transition-all">
                                         <Upload size={14} />
                                         Upload Custom
                                         <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                                      </label>
                                   </div>
                                </div>
                                <div className="grid grid-cols-4 gap-3">
                                   {DEFAULT_AVATARS.map((url, i) => (
                                      <button 
                                        key={i}
                                        onClick={() => selectAvatar(url)}
                                        className={cn(
                                          "aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 active:scale-95",
                                          currentUser?.avatarUrl === url ? "border-primary bg-primary/10" : "border-transparent bg-black/5 dark:bg-white/5"
                                        )}
                                      >
                                         <img src={url} alt={`Avatar ${i}`} className="w-full h-full object-cover" />
                                      </button>
                                   ))}
                                </div>
                             </div>
                          </div>
                       </motion.div>
                    )}
                 </AnimatePresence>

                 <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl text-center border border-black/5 dark:border-white/5">
                       <p className="text-black/30 dark:text-white/30 text-[8px] font-black uppercase tracking-widest mb-1">XP</p>
                       <p className="text-xl font-black text-primary">{currentUser?.xp}</p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl text-center border border-black/5 dark:border-white/5">
                       <p className="text-black/30 dark:text-white/30 text-[8px] font-black uppercase tracking-widest mb-1">Rank</p>
                       <p className="text-xl font-black text-black dark:text-white">#{getUserRank(currentUser?.id || '')}</p>
                    </div>
                    <div className="bg-black/5 dark:bg-white/5 p-4 rounded-3xl text-center border border-black/5 dark:border-white/5">
                       <p className="text-black/30 dark:text-white/30 text-[8px] font-black uppercase tracking-widest mb-1">Coins</p>
                       <p className="text-xl font-black text-yellow-500">{currentUser?.raheeCoins || 0}</p>
                    </div>
                 </div>

                 <div className="space-y-4 mb-8">
                    <h3 className="font-black text-[10px] uppercase tracking-widest text-black/20 dark:text-white/20 ml-2">Lifetime Statistics</h3>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="flex items-center gap-4 bg-black/5 dark:bg-white/5 p-5 rounded-3xl border border-black/5 dark:border-white/5">
                          <div className="w-10 h-10 bg-green-500/20 rounded-2xl flex items-center justify-center text-green-500"><Zap size={20} /></div>
                          <div>
                             <p className="text-[8px] font-black text-black/30 dark:text-white/30 uppercase tracking-widest leading-none">Accuracy</p>
                             <p className="text-lg font-black text-black dark:text-white">
                                {Math.round((currentUser?.stats?.correctAnswers || 0) / (currentUser?.stats?.totalAttempted || 1) * 100)}%
                             </p>
                          </div>
                       </div>
                       <div className="flex items-center gap-4 bg-black/5 dark:bg-white/5 p-5 rounded-3xl border border-black/5 dark:border-white/5">
                          <div className="w-10 h-10 bg-blue-500/20 rounded-2xl flex items-center justify-center text-blue-500"><TrendingUp size={20} /></div>
                          <div>
                             <p className="text-[8px] font-black text-black/30 dark:text-white/30 uppercase tracking-widest leading-none">Solved</p>
                             <p className="text-lg font-black text-black dark:text-white">
                                {currentUser?.stats?.totalAttempted || 0}
                             </p>
                          </div>
                       </div>
                    </div>
                 </div>

                  {/* Referral Section */}
                  <div className="space-y-4 mb-8">
                     <h3 className="font-black text-[10px] uppercase tracking-widest text-black/20 dark:text-white/20 ml-2">Referrals & Rewards</h3>
                     <div className="p-6 bg-black/5 dark:bg-white/5 rounded-[2.5rem] border border-black/5 dark:border-white/10 space-y-4">
                        <div className="flex items-center justify-between">
                           <div>
                              <p className="text-[10px] font-black uppercase text-black/40 dark:text-white/40 mb-1">Your Referral Code</p>
                              <div className="flex items-center gap-2">
                                 <code className="text-lg font-black text-primary font-mono select-all">{currentUser?.referralCode}</code>
                                 <button 
                                   onClick={() => {
                                      navigator.clipboard.writeText(currentUser?.referralCode || '');
                                      alert({ title: 'Copied!', description: 'Code copied to clipboard.', type: 'success' });
                                   }}
                                   className="p-1 px-2 bg-primary/10 text-primary text-[8px] font-black rounded uppercase hover:bg-primary hover:text-black transition-all"
                                 >
                                    Copy
                                 </button>
                              </div>
                           </div>
                           <div className="w-10 h-10 bg-[#32befa]/20 rounded-xl flex items-center justify-center text-[#32befa]">
                              <TrendingUp size={20} />
                           </div>
                        </div>

                        {!currentUser?.referredBy && (
                           <div className="pt-4 border-t border-black/5 dark:border-white/5 space-y-3">
                              <p className="text-[9px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest leading-relaxed">Enter a friend's code to both win {settings?.referralReward || 500} coins!</p>
                              <div className="flex gap-2">
                                 <input 
                                   type="text"
                                   placeholder="Enter Code"
                                   value={referralInput}
                                   onChange={e => setReferralInput(e.target.value)}
                                   className="flex-1 bg-white dark:bg-black border border-black/10 dark:border-white/10 p-3 rounded-xl font-black text-[10px] outline-none focus:border-primary uppercase transition-all"
                                 />
                                 <button 
                                   onClick={redeemReferral}
                                   disabled={!referralInput.trim() || isRedeemingReferral}
                                   className="px-4 py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center"
                                 >
                                    {isRedeemingReferral ? <Loader2 size={12} className="animate-spin" /> : 'Apply'}
                                 </button>
                              </div>
                           </div>
                        )}
                        {currentUser?.referredBy && (
                           <div className="pt-4 border-t border-black/5 dark:border-white/5 flex items-center gap-2 text-green-500">
                              <Check size={14} />
                              <span className="text-[9px] font-black uppercase tracking-widest leading-none">Referral reward claimed</span>
                           </div>
                        )}
                     </div>
                  </div>

                  <div className="space-y-4 mb-8">
                    <h3 className="font-black text-[10px] uppercase tracking-widest text-black/20 dark:text-white/20 ml-2">Topic Knowledge</h3>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                       {[...topics].filter(t => currentUser?.scores?.[t.id]).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((topic, tIdx) => {
                          const score = currentUser?.scores?.[topic.id];
                          const percent = Math.round((score?.correct || 0) / (score?.total || 1) * 100);
                          return (
                             <div key={`topic-knowledge-${topic.id || tIdx}-${tIdx}`} className="space-y-2">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tight">
                                   <span className="text-black dark:text-white">{topic.name}</span>
                                   <span className="text-primary">{percent}%</span>
                                </div>
                                <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                                   <motion.div 
                                     initial={{ width: 0 }}
                                     animate={{ width: `${percent}%` }}
                                     className="h-full bg-primary rounded-full"
                                   />
                                </div>
                             </div>
                          );
                       })}
                    </div>
                 </div>

                 <button 
                   onClick={() => setShowProfile(false)}
                   className="w-full bg-black dark:bg-white text-white dark:text-black py-5 rounded-3xl font-black uppercase tracking-widest text-xs hover:scale-[1.02] active:scale-95 transition-all shadow-xl"
                 >
                    Close Profile
                 </button>
              </motion.div>
           </div>
        )}

        {showTopicSelect && (
           <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 overflow-y-auto pt-20">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowTopicSelect(false)}
                className="absolute inset-0 bg-black/90 backdrop-blur-md fixed"
              />
              <motion.div 
                initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }}
                className="relative bg-white dark:bg-[#0a0a0a] w-full max-w-md rounded-[3rem] border border-black/5 dark:border-white/10 flex flex-col my-auto"
              >
                 <button 
                   onClick={() => setShowTopicSelect(false)}
                   className="absolute top-6 right-6 p-2 bg-black/5 dark:bg-white/5 rounded-2xl text-black/40 dark:text-white/40 hover:bg-red-500 hover:text-white transition-all z-20"
                 >
                    <X size={20} />
                 </button>
                 <div className="p-8 border-b border-black/5 dark:border-white/10 shrink-0 text-center relative">
                    <h2 className="text-2xl font-black text-black dark:text-white uppercase tracking-tighter leading-none mb-1">
                       {selectionPath.length > 0 ? selectionPath[selectionPath.length - 1].name : 'Select Topic'}
                    </h2>
                    <p className="text-black/40 dark:text-white/40 text-[10px] font-black uppercase tracking-widest">
                       {selectionPath.length > 0 ? 'Select Specialization' : 'Choose your interest'}
                    </p>
                    {selectionPath.length > 0 && (
                       <button 
                         onClick={() => setSelectionPath(selectionPath.slice(0, -1))}
                         className="absolute left-6 top-1/2 -translate-y-1/2 p-2 bg-black/5 dark:bg-white/5 rounded-xl text-black/40 dark:text-white/40 hover:text-primary transition-colors"
                       >
                          <ChevronRight size={20} className="rotate-180" />
                       </button>
                    )}
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    <div className="space-y-4">
                      {selectionPath.length > 0 && (
                         <button 
                           onClick={() => startSelectedQuiz(getAllChildTopicIds(selectionPath[selectionPath.length-1]))}
                           className="w-full p-4 bg-primary/10 text-primary border border-primary/20 rounded-3xl flex items-center justify-center gap-3 font-black uppercase tracking-widest text-[10px] hover:bg-primary/20 transition-all mb-2"
                         >
                            <Play size={16} fill="currentColor" />
                            Play Entire Topic & Sub-topics
                         </button>
                      )}
                       <div className="space-y-3">
                          {(() => {
                             const currentOptions = (selectionPath.length === 0 
                                ? topics 
                                : Object.values(selectionPath[selectionPath.length - 1].children || {})) as Topic[];
                             
                             const sortedOptions = [...currentOptions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                             if (sortedOptions.length === 0) {
                                return (
                                  <div className="py-12 text-center bg-black/5 dark:bg-white/5 rounded-[2rem] border border-dashed border-black/10 dark:border-white/10">
                                     <HelpCircle className="mx-auto mb-2 text-black/10 dark:text-white/10" size={32} />
                                     <p className="text-black/40 dark:text-white/40 font-bold italic tracking-tighter text-sm px-8">No further sub-topics.</p>
                                  </div>
                                );
                             }

                             return sortedOptions.map((topic, tIdx) => (
                                <motion.div 
                                   key={`sorted-topic-${topic.id || tIdx}-${tIdx}`}
                                   className="flex gap-2"
                                >
                                   <motion.button 
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={() => toggleTopicSelection(topic.id)}
                                      className={cn(
                                         topic.disableMultiSelect ? "hidden pointer-events-none" : "w-14 h-auto rounded-3xl flex items-center justify-center transition-all border shrink-0",
                                         selectedTopicIds.includes(topic.id)
                                            ? "bg-primary text-black border-primary"
                                            : "bg-black/5 dark:bg-white/5 text-black/20 dark:text-white/20 border-black/5 dark:border-white/5"
                                      )}
                                   >
                                      {selectedTopicIds.includes(topic.id) ? <Check size={20} strokeWidth={4} /> : <div className="w-5 h-5 rounded-md border-2 border-current opacity-20" />}
                                   </motion.button>

                                   <motion.button 
                                      whileHover={{ scale: 1.02 }}
                                      whileTap={{ scale: 0.98 }}
                                      onClick={async () => {
                                         if (!currentUser) return;
                                         if (topic.children && Object.keys(topic.children).length > 0) {
                                            setSelectionPath([...selectionPath, topic]);
                                         } else {
                                            startSelectedQuiz([topic.id]);
                                         }
                                      }}
                                      className={cn(
                                         "flex-1 p-5 rounded-3xl flex items-center gap-4 transition-all border overflow-hidden",
                                         currentUser?.selectedTopicId === topic.id 
                                            ? "bg-primary/20 text-primary border-primary/20" 
                                            : "bg-black/5 dark:bg-white/5 text-black dark:text-white border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                                      )}
                                   >
                                      <div className={cn(
                                         "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shrink-0",
                                         currentUser?.selectedTopicId === topic.id ? "bg-primary text-black" : "bg-primary/20 text-primary"
                                      )}>
                                         <HelpCircle size={24} />
                                      </div>
                                      <div className="text-left overflow-hidden flex-1">
                                         <h4 className="font-black uppercase tracking-tighter text-lg leading-none mb-1 truncate">{topic.name}</h4>
                                         <div className="flex gap-1.5 items-center">
                                            <span className="text-[8px] font-bold text-black/40 dark:text-white/40 uppercase tracking-widest">
                                               {topic.children && Object.keys(topic.children).length > 0 ? `${Object.keys(topic.children).length} Specialties` : 'Explore this topic'}
                                            </span>
                                         </div>
                                      </div>
                                      {topic.children && Object.keys(topic.children).length > 0 && <ChevronRight size={16} className="text-black/20 dark:text-white/20" />}
                                   </motion.button>
                                </motion.div>
                             ));
                          })()}
                       </div>
                    </div>
                 </div>

                 <div className="p-6 shrink-0 bg-white/50 dark:bg-[#0a0a0a]/50 backdrop-blur-md border-t border-black/5 dark:border-white/10">
                    {selectedTopicIds.length > 0 && (
                       <button 
                         onClick={() => startSelectedQuiz()}
                         className="w-full bg-primary text-black py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all mb-3 flex items-center justify-center gap-2"
                       >
                          <Play size={16} fill="currentColor" />
                          Start Mixed Mode ({selectedTopicIds.length})
                       </button>
                    )}
                    <button onClick={() => setShowTopicSelect(false)} className="w-full bg-[#32befa] text-black py-5 rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-xl active:scale-95 transition-all">Close</button>
                 </div>
              </motion.div>
           </div>
        )}

        {showQuiz && <QuizScreen 
            onClose={() => {
              setShowQuiz(false);
              setActiveExamId(null);
            }} 
            language={lang} 
            eventId={activeExamId || undefined}
            topicIds={activeExamId ? undefined : currentUser?.selectedTopicIds} 
          />}
        {showSettings && (
          <Settings 
            onClose={() => setShowSettings(false)} 
            onShowFeedback={() => setShowFeedback(true)} 
            onShowHistory={() => setShowHistory(true)}
          />
        )}
        {showFeedback && <Feedback onClose={() => setShowFeedback(false)} />}
        
        {/* Lives Refill Modal */}
        <AnimatePresence>
          {showLivesModal && (
            <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 overflow-y-auto pt-20">
               <motion.div 
                 initial={{ opacity: 0 }} 
                 animate={{ opacity: 1 }} 
                 exit={{ opacity: 0 }}
                 onClick={() => setShowLivesModal(false)}
                 className="absolute inset-0 bg-black/90 backdrop-blur-xl fixed"
               />
               <motion.div 
                 initial={{ scale: 0.9, y: 20, opacity: 0 }}
                 animate={{ scale: 1, y: 0, opacity: 1 }}
                 exit={{ scale: 0.9, y: 20, opacity: 0 }}
                 className="relative bg-white dark:bg-[#111] w-full max-w-sm rounded-[3rem] border border-black/5 dark:border-white/10 p-8 text-center my-auto"
               >
                  <button 
                    onClick={() => setShowLivesModal(false)}
                    className="absolute top-6 right-6 p-2 bg-black/5 dark:bg-white/5 rounded-2xl text-black/40 dark:text-white/40 hover:bg-red-500 hover:text-white transition-all z-10"
                  >
                     <X size={20} />
                  </button>
                  <div className="w-24 h-24 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center text-red-500 mx-auto mb-6">
                     <Heart size={48} className="fill-red-500" />
                  </div>
                  
                  <h3 className="text-2xl font-black text-black dark:text-white uppercase tracking-tighter mb-2">Lives Refill</h3>
                  <p className="text-black/40 dark:text-white/40 font-bold text-xs uppercase tracking-widest mb-8 leading-relaxed">
                     Lives are used to play quizzes. You get 1 life back every 15 minutes.
                  </p>

                  <div className="bg-black/5 dark:bg-white/5 p-6 rounded-3xl border border-black/5 dark:border-white/5 mb-8">
                     <div className="flex justify-between items-center mb-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-black/40 dark:text-white/40">Current Balance</span>
                        <span className="text-xl font-black text-red-500">{currentUser?.lives?.count || 0}/{MAX_LIVES}</span>
                     </div>
                     
                     {(currentUser?.lives?.count || 0) < MAX_LIVES ? (
                        <div className="space-y-1">
                           <div className="flex justify-between items-end">
                              <span className="text-[8px] font-black uppercase tracking-widest text-black/20 dark:text-white/20">Next Refill In</span>
                              <span className="text-lg font-black text-black dark:text-white tabular-nums">
                                 {Math.floor(refillTimeLeft / 60000)}:{(Math.floor((refillTimeLeft % 60000) / 1000)).toString().padStart(2, '0')}
                              </span>
                           </div>
                           <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                initial={false}
                                animate={{ width: `${(1 - refillTimeLeft / REFILL_INTERVAL) * 100}%` }}
                                className="h-full bg-red-500"
                              />
                           </div>
                        </div>
                     ) : (
                        <p className="text-[10px] font-black text-green-500 uppercase tracking-widest">Maximum focus reached!</p>
                     )}
                  </div>

                  <div className="flex flex-col gap-3">
                     <button 
                       onClick={() => {
                          setShowLivesModal(false);
                          setActiveTab('shop');
                          // Use a shortcut to lives section in shop
                          setTimeout(() => {
                             const el = document.getElementById('shop-lives');
                             el?.scrollIntoView({ behavior: 'smooth' });
                          }, 100);
                       }}
                       className="w-full py-5 bg-primary text-black font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                        <ShoppingBag size={18} />
                        Buy More Lives
                   </button>
                   <button 
                     onClick={() => setShowLivesModal(false)}
                     className="w-full py-5 text-black/40 dark:text-white/40 font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all"
                   >
                      Maybe Later
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
        {/* Streak Modal */}
        <AnimatePresence>
          {showStreakModal && (
             <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 overflow-y-auto pt-20">
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  onClick={() => setShowStreakModal(false)}
                  className="absolute inset-0 bg-black/90 backdrop-blur-xl fixed"
                />
                <motion.div 
                  initial={{ scale: 0.9, y: 20, opacity: 0 }} 
                  animate={{ scale: 1, y: 0, opacity: 1 }} 
                  exit={{ scale: 0.9, y: 20, opacity: 0 }}
                  className="relative bg-white dark:bg-[#111] w-full max-w-sm rounded-[3rem] border border-black/5 dark:border-white/10 p-8 text-center my-auto transition-all shadow-2xl"
                >
                   <button 
                     onClick={() => setShowStreakModal(false)}
                     className="absolute top-6 right-6 p-2 bg-black/5 dark:bg-white/5 rounded-2xl text-black/40 dark:text-white/40 hover:bg-red-500 hover:text-white transition-all z-10"
                   >
                      <X size={20} />
                   </button>

                   {streakView === 'weekly' ? (
                      <>
                        <div className="w-20 h-20 bg-orange-500/10 rounded-[2rem] flex items-center justify-center text-orange-500 mx-auto mb-4 animate-bounce">
                           <Zap size={40} className="fill-orange-500" />
                        </div>
                        <h3 className="text-2xl font-black text-black dark:text-white uppercase tracking-tighter mb-2">{currentUser?.streak} Day Streak!</h3>
                        <p className="text-black/40 dark:text-white/40 font-bold text-[10px] uppercase tracking-[0.2em] mb-8">
                           Keep playing every day to grow your streak!
                        </p>

                        <div className="flex justify-between items-center gap-2 mb-8 bg-black/5 dark:bg-white/5 p-4 rounded-[2rem] border border-black/5 dark:border-white/10">
                           {(() => {
                              const days = [];
                              const today = new Date();
                              for (let i = 6; i >= 0; i--) {
                                 const d = new Date(today);
                                 d.setDate(d.getDate() - i);
                                 const dStr = d.toISOString().split('T')[0];
                                 const isPlayed = currentUser?.playedDates?.includes(dStr);
                                 const dayName = d.toLocaleDateString('en-US', { weekday: 'short' })[0];
                                 days.push(
                                    <div key={dStr} className="flex flex-col items-center gap-2">
                                       <div className={cn(
                                          "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                                          isPlayed 
                                             ? "bg-orange-500 border-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]" 
                                             : "bg-black/5 dark:bg-white/5 border-transparent text-black/20 dark:text-white/20"
                                       )}>
                                          {isPlayed ? <Check size={14} strokeWidth={4} /> : <span className="text-[10px] font-black">{dayName}</span>}
                                       </div>
                                       {i === 0 && <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />}
                                    </div>
                                 );
                              }
                              return days;
                           })()}
                        </div>

                        <button 
                           onClick={() => setStreakView('calendar')}
                           className="w-full py-5 bg-black/5 dark:bg-white/5 text-black dark:text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-black/10 dark:hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                        >
                           <HistoryIcon size={16} />
                           View Activity Calendar
                        </button>
                      </>
                   ) : (
                      <>
                        <div className="flex justify-between items-center mb-6 px-2">
                           <button onClick={() => setStreakView('weekly')} className="p-2 bg-black/5 dark:bg-white/5 rounded-xl text-black/40 dark:text-white/40 hover:text-black hover:dark:text-white transition-colors">
                              <ChevronRight className="rotate-180" size={20} />
                           </button>
                           <h3 className="font-black uppercase tracking-tighter text-lg">{new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
                           <div className="w-10" />
                        </div>

                        <div className="bg-black/5 dark:bg-white/5 p-4 rounded-[2rem] border border-black/5 dark:border-white/5 mb-6">
                           <div className="grid grid-cols-7 gap-1">
                              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                 <div key={`${d}-${i}`} className="text-[8px] font-black opacity-20 py-2">{d}</div>
                              ))}
                              {(() => {
                                 const now = new Date();
                                 const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
                                 const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                                 const startOffset = firstDay.getDay();
                                 const totalDays = lastDay.getDate();
                                 
                                 const days = [];
                                 for(let i=0; i<startOffset; i++) days.push(<div key={`pad-${i}`} />);
                                 
                                 for(let i=1; i<=totalDays; i++) {
                                    const d = new Date(now.getFullYear(), now.getMonth(), i);
                                    const dStr = d.toISOString().split('T')[0];
                                    const isPlayed = currentUser?.playedDates?.includes(dStr);
                                    const isToday = dStr === now.toISOString().split('T')[0];
                                    
                                    days.push(
                                       <div 
                                          key={dStr}
                                          className={cn(
                                             "aspect-square rounded-full flex items-center justify-center text-[10px] font-bold transition-all relative",
                                             isPlayed 
                                                ? "bg-orange-500 text-white shadow-sm" 
                                                : "text-black/40 dark:text-white/40",
                                             isToday && !isPlayed && "border border-primary text-primary"
                                          )}
                                       >
                                          {i}
                                          {isToday && <div className={cn("absolute -bottom-0.5 w-1 h-1 rounded-full", isPlayed ? "bg-white" : "bg-primary")} />}
                                       </div>
                                    );
                                 }
                                 return days;
                              })()}
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <div className="bg-black/5 dark:bg-white/5 p-4 rounded-2xl text-left border border-black/5 dark:border-white/5">
                              <p className="text-[8px] font-black opacity-20 uppercase tracking-widest mb-1 leading-none">Days Active</p>
                              <p className="font-black text-xl leading-none">{currentUser?.playedDates?.length || 0}</p>
                           </div>
                           <div className="bg-orange-500/10 p-4 rounded-2xl text-left border border-orange-500/10">
                              <p className="text-[8px] font-black text-orange-500/40 uppercase tracking-widest mb-1 leading-none">Streak</p>
                              <p className="font-black text-xl text-orange-500 leading-none">{currentUser?.streak || 0}D</p>
                           </div>
                        </div>
                      </>
                   )}
                </motion.div>
             </div>
          )}
        </AnimatePresence>

        {/* Daily Login Rewards Modal */}
        <AnimatePresence>
          {renderRewardsModal()}
        </AnimatePresence>

        {/* Cinematic Full Screen Ad Player Overlay */}
        <AnimatePresence>
          {showAdPlayer && renderAdPlayer()}
        </AnimatePresence>

        {showChat && <Chat onClose={() => setShowChat(false)} />}
        {showHistory && (
          <History 
            onClose={() => setShowHistory(false)} 
            onPlayAgain={(topicId) => {
              checkGameStart(() => {
                setShowHistory(false);
                const updates: any = { selectedTopicIds: [topicId] };
                if (currentUser?.extraTriesAllowed) {
                  updates.extraTriesAllowed = false;
                }
                update(ref(db, `users/${currentUser?.id}`), updates)
                  .then(() => setShowQuiz(true));
              });
            }}
          />
        )}
        {showMultiplayerHub && (
          <MultiplayerHub 
            onClose={() => setShowMultiplayerHub(false)} 
            allUsers={allUsers}
            onStartMatch={(roomId, isBot) => {
              checkGameStart(() => {
                setMultiRoomId(roomId);
                setIsBotMatch(isBot);
                setShowMultiplayerHub(false);
                if (currentUser) {
                  logAdminNotification('play', currentUser.name || currentUser.username || 'Player', 'Multiplayer Match');
                }
              });
            }}
          />
        )}
        {multiRoomId && !isMatchMinimized && (
          <MultiplayerGame 
            roomId={multiRoomId} 
            isBot={isBotMatch} 
            onClose={() => setMultiRoomId(null)} 
            onMinimize={() => setIsMatchMinimized(true)}
          />
        )}

        {/* Resumable Match Bubble */}
        {multiRoomId && isMatchMinimized && (
           <motion.div
             initial={{ scale: 0.5, opacity: 0, x: 50 }}
             animate={{ scale: 1, opacity: 1, x: 0 }}
             onClick={() => setIsMatchMinimized(false)}
             className="fixed bottom-24 right-6 z-[90] bg-primary text-black p-4 rounded-3xl shadow-2xl shadow-primary/40 cursor-pointer flex items-center gap-3 active:scale-95 transition-all border-4 border-black group"
           >
              <div className="w-10 h-10 bg-black/10 rounded-xl flex items-center justify-center animate-pulse">
                 <Swords size={20} />
              </div>
              <div className="pr-2">
                 <p className="text-[8px] font-black uppercase tracking-widest leading-none mb-1 opacity-60">Match Active</p>
                 <p className="text-xs font-black uppercase tracking-tighter">Resume Battle</p>
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full border-2 border-primary flex items-center justify-center text-[10px] font-black text-white">
                 !
              </div>
           </motion.div>
        )}
         {/* Game Update Required Modal */}
         {false && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-y-auto">
               <motion.div 
                 initial={{ opacity: 0 }} 
                 animate={{ opacity: 1 }} 
                 className="absolute inset-0 bg-black/95 backdrop-blur-xl fixed"
               />
               <motion.div 
                 initial={{ scale: 0.9, y: 20, opacity: 0 }}
                 animate={{ scale: 1, y: 0, opacity: 1 }}
                 className="relative bg-white dark:bg-[#111] w-full max-w-md rounded-[3rem] border border-black/5 dark:border-white/10 p-8 text-center my-auto shadow-2xl z-10"
               >
                  <div className="w-24 h-24 bg-primary/10 rounded-[2.5rem] flex items-center justify-center text-primary mx-auto mb-6 animate-bounce">
                     <AlertTriangle size={48} />
                  </div>
                  
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-black dark:text-white mb-2">
                     Update Required!
                  </h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-6">
                     New Game Version Available
                  </p>

                  <p className="text-sm font-semibold text-black/60 dark:text-white/70 leading-relaxed mb-8 px-2">
                     {settings?.updateCodeSettings?.message || 
                       "We've added amazing new features and fixed bugs to make your experience even better. Please update the game to the latest version to continue playing."}
                  </p>

                  <div className="flex flex-col gap-3">
                     {settings?.updateCodeSettings?.updateUrl ? (
                        <a 
                          href={settings.updateCodeSettings.updateUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-full py-5 bg-primary text-black rounded-[1.5rem] font-black uppercase tracking-widest text-xs shadow-xl hover:scale-[1.02] active:scale-95 transition-all text-center block"
                        >
                           Update Now
                        </a>
                     ) : (
                        <p className="text-xs font-bold text-red-500 bg-red-500/10 p-4 rounded-2xl">
                           No update link configured by Admin.
                        </p>
                     )}
                     
                     <button 
                       onClick={() => setShowUpdateModal(false)}
                       className="w-full py-5 bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 hover:text-red-500 rounded-[1.5rem] font-black uppercase tracking-widest text-xs transition-all text-center block"
                     >
                        Cancel
                     </button>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>
    </Layout>
  );
}
