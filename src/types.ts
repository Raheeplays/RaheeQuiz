export type UserRole = 'user' | 'admin';
export type UserStatus = 'pending' | 'active' | 'rejected' | 'banned' | 'revoked';

export interface User {
  id: string;
  name: string;
  username: string; // Added for searching
  password?: string;
  role: UserRole;
  status: UserStatus;
  xp: number;
  rank: number;
  currentRound: number;
  currentQuizIndex: number;
  isBot?: boolean;
  avatar?: string;
  lastPlayed?: number;
  selectedTopicId: string | null;
  selectedSubTopicId?: string;
  selectedSubSubTopicId?: string;
  language: 'en' | 'hi';
  raheeCoins: number;
  lifelines: {
    'fiftyFifty': number;
    'changeQuiz': number;
  };
  scores: {
    [topicId: string]: {
      correct: number;
      total: number;
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
  };
}

export interface Event {
  id: string;
  title: string;
  description: string;
  topicId: string;
  startTime: number;
  endTime: number;
  type: 'test' | 'exam' | 'contest';
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
  createdAt: number;
}

export interface MatchProgress {
  userId: string;
  score: number;
  currentIndex: number;
  finished: boolean;
  accuracy: number;
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
  subTopicId?: string;
  subSubTopicId?: string;
  explanation?: {
    en: string;
    hi: string;
  };
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
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
}
