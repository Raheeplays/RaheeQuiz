export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'banned' | 'revoked';

export interface User {
  id: string;
  name: string;
  email: string;
  username?: string; // Optional for searching
  password?: string;
  role: UserRole;
  status: UserStatus;
  xp: number;
  rank: number;
  currentRound: number;
  currentQuizIndex: number;
  AppCode?: string | number;
  CustomAppCodePath?: string;
  isBot?: boolean;
  avatar?: string;
  avatarUrl?: string;
  pendingAvatarUrl?: string | null;
  lastPlayed?: number;
  lastLoginDate?: string; // YYYY-MM-DD
  lastLoginTime?: string; // e.g. "May 22, 2026, 11:20 AM"
  lastPlayedDate?: string; // YYYY-MM-DD
  lastPlayedTime?: string; // e.g. "May 22, 2026, 11:25 AM"
  streak?: number;
  lives?: {
    count: number;
    lastRefill: number; // timestamp
    enabled: boolean;
  };
  selectedTopicId: string | null;
  selectedSubTopicId?: string;
  selectedSubSubTopicId?: string;
  fixedTopicId?: string | null; // Locked topic ID
  canSwitchTopic?: boolean; // Admin flag to allow switching
  language: 'en' | 'hi';
  raheeCoins: number;
  lifelines: {
    'fiftyFifty': number;
    'changeQuiz': number;
    'audiencePoll': number;
    'hint': number;
  };
  scores: {
    [topicId: string]: {
      correct: number;
      total: number;
      unattempted?: number;
    }
  };
  friends?: { [userId: string]: boolean };
  pendingRequests?: { [userId: string]: 'incoming' | 'outgoing' };
  extraTriesRequested?: boolean;
  extraTriesAllowed?: boolean;
  stats?: {
    totalAttempted: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unattemptedAnswers?: number;
  };
  dailyXP?: number;
  weeklyXP?: number;
  autoCorrectEnabled?: boolean;
  privacyEnabled?: boolean;
  referralCode?: string;
  referredBy?: string;
  deviceUid?: string;
  ambientModeEnabled?: boolean;
  bgmEnabled?: boolean;
  bgmPreset?: 'synth' | 'flute' | 'piano' | 'guitar' | 'ensemble' | 'violin' | 'harp' | 'custom_midi';
  bgmVolumeSynth?: number;
  bgmVolumeFlute?: number;
  bgmVolumePiano?: number;
  bgmVolumeGuitar?: number;
  bgmVolumeBeats?: number;
  bgmVolumeViolin?: number;
  bgmVolumeHarp?: number;
  bgmBpm?: number;
  midiUrlSynth?: string;
  midiUrlFlute?: string;
  midiUrlPiano?: string;
  midiUrlGuitar?: string;
  midiUrlViolin?: string;
  midiUrlHarp?: string;
  midiPresetName?: string;
  ambientThreshold?: number;
  playedDates?: string[];
  dailyRewards?: {
    lastClaimDate?: string;
    currentDay?: number;
  };
  freeRewards?: {
    lastHourlyClaim?: string; // ISO string or timestamp
    lastClaimTier1?: string;
    lastClaimTier2?: string;
    lastClaimTier3?: string;
    lastClaimTier4?: string;
    lastClaimTier5?: string;
  };
}

export interface Coupon {
  code: string;
  value: number;
  isUsed: boolean;
  usedBy?: string;
  usedByName?: string;
  usedByUsername?: string;
  usedAt?: number;
  createdAt: number;
  createdBy: string;
}

export interface CouponLog {
  userId: string;
  userName: string;
  code: string;
  isSuccess: boolean;
  timestamp: number;
  error?: string;
}

export interface ReferralLog {
  referrerId: string;
  referrerName: string;
  referredId: string;
  referredName: string;
  rewardValue: number;
  timestamp: number;
}

export interface Settings {
  livesEnabledForAll: boolean;
  quizTimerEnabled?: boolean;
  quizTimerSeconds?: number;
  pushNotificationsEnabled?: boolean;
  customization?: {
    correctSound: string;
    incorrectSound: string;
    vibrationEnabled: boolean;
    correctVibration: number;
    incorrectVibration: number;
    primaryColor: string;
    accentColor: string;
    animationIntensity: number; // 0 to 1
  };
  notificationTemplates?: {
    challenge: { title: string; body: string };
    dailyReset: { title: string; body: string };
    weeklyReset: { title: string; body: string };
    rankUp: { title: string; body: string };
  };
  resetTimes?: {
    lastDailyReset: number;
    lastWeeklyReset: number;
  };
  specialPin?: string; // Hidden access pin
  code?: string; // Game update code node
  bgmEnabled?: boolean;
  bgmUrl?: string;
  bgmPreset?: 'synth' | 'flute' | 'piano' | 'guitar' | 'ensemble' | 'violin' | 'harp' | 'custom_midi';
  bgmVolumeSynth?: number;
  bgmVolumeFlute?: number;
  bgmVolumePiano?: number;
  bgmVolumeGuitar?: number;
  bgmVolumeBeats?: number;
  bgmVolumeViolin?: number;
  bgmVolumeHarp?: number;
  bgmBpm?: number;
  midiUrlSynth?: string;
  midiUrlFlute?: string;
  midiUrlPiano?: string;
  midiUrlGuitar?: string;
  midiUrlViolin?: string;
  midiUrlHarp?: string;
  midiPresetName?: string;
  ambientThreshold?: number;
  updateCodeSettings?: {
    code: string;
    updateUrl?: string;
    message?: string;
  };
}

export interface SpecialMessage {
  id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
  adminReply?: string;
  replyTimestamp?: number;
  replyExpiresAt?: number;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  topicId: string;
  startTime: number;
  endTime: number;
  type: 'test' | 'exam' | 'contest';
  isImmediate?: boolean;
  participants?: { [userId: string]: boolean };
  hasTimer?: boolean;
  timerDuration?: number;
  certificateTitle?: string;
  certificateSubtitle?: string;
  certificateFooter?: string;
  certificateColor?: string;
  certificateLayout?: {
    borderWidth?: number;
    headerFontSize?: number;
    headerStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
    subtitleFontSize?: number;
    subtitleStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
    nameFontSize?: number;
    nameStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
    bodyFontSize?: number;
    footerFontSize?: number;
    footerStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
    showBackgroundPattern?: boolean;
    borderPadding?: number;
  };
  results?: {
    [userId: string]: {
      score: number;
      total: number;
      completedAt: number;
    }
  };
  isTesting?: boolean;
  selectedPlayers?: string[];
  createdAt: number;
}

export interface MatchProgress {
  userId: string;
  userName?: string; // Added for display in match
  score: number;
  currentIndex: number;
  finished: boolean;
  accuracy: number;
  team?: 'blue' | 'red';
  isBot?: boolean;
}

export interface MatchRoom {
  id: string;
  topicId: string;
  joinCode?: string;
  hostId: string;
  participants: { [userId: string]: MatchProgress };
  status: 'waiting' | 'playing' | 'finished';
  timerEnabled: boolean;
  whoFirstMode: boolean; // New buzzer mode
  totalTime: number; // in minutes
  claimedQuestions?: { [questionIndex: number]: string }; // userId who claimed it
  isTeamBattle?: boolean;
  teamSize?: number;
  startTime?: number;
  createdAt: number;
}

export const SKINS = {
  'rahee': { name: 'Rahee Classic', primary: '#32befa', accent: '#0088cc' },
  'sunset': { name: 'Sunset Bloom', primary: '#f43f5e', accent: '#fb7185' },
  'forest': { name: 'Deep Forest', primary: '#10b981', accent: '#34d399' },
  'purple': { name: 'Royal Purple', primary: '#8b5cf6', accent: '#a78bfa' },
} as const;

export interface Quiz {
  id: string;
  question: {
    en: string;
    hi: string;
  };
  options: {
    en: string[];
    hi: string[];
  };
  correctAnswerIndex: number;
  topicId: string;
  explanation?: {
    en: string;
    hi: string;
  };
  hint?: {
    en: string;
    hi: string;
  };
  questionImage?: string;
  optionImages?: string[];
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  order?: number;
  disableMultiSelect?: boolean;
  children?: { [childId: string]: Topic };
}

export interface Feedback {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  timestamp: number;
}

export interface QuizHistory {
  id: string;
  userId: string;
  quizId: string;
  userAnswerIndex: number;
  isCorrect: boolean;
  timestamp: number;
  language?: 'en' | 'hi';
  theme?: 'light' | 'dark';
}

export interface SessionHistory {
  id: string;
  userId: string;
  topicId: string;
  score: number;
  total: number;
  timestamp: number;
  language?: 'en' | 'hi';
  theme?: 'light' | 'dark';
  answers: {
    quizId: string;
    userAnswerIndex: number;
    isCorrect: boolean;
  }[];
}

export interface Ad {
  id: string;
  title: string;
  mediaType: 'video' | 'image' | 'text';
  mediaUrl: string; // URL of the banner or a simulated YouTube / GIF embed
  active: boolean;
  durationSeconds: number;
  rewardValue?: string;
  createdAt: number;
}
