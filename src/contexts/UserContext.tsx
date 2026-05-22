import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Settings } from '../types';
import { db, auth } from '../firebase/config';
import { ref, onValue, get, update, onDisconnect } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  loading: boolean;
  settings: Settings | null;
  logout: () => void;
  impersonateBot: (bot: User) => void;
  stopImpersonating: () => void;
  isImpersonating: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    const activeUserId = impersonatedUser?.id || currentUser?.id;
    if (activeUserId) {
      const nowTimeStr = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      });
      try {
        await update(ref(db, `users/${activeUserId}`), { lastPlayedTime: nowTimeStr });
      } catch (err) {
        console.error("Failed to update lastPlayedTime on logout:", err);
      }
    }
    await auth.signOut();
    setImpersonatedUser(null);
    setCurrentUser(null);
  };

  const impersonateBot = (bot: User) => {
    setImpersonatedUser(bot);
  };

  const stopImpersonating = () => {
    setImpersonatedUser(null);
  };

  // Keep the impersonated user data perfectly synchronized with Firebase in real-time
  useEffect(() => {
    if (!impersonatedUser?.id) return;

    const impUserRef = ref(db, `users/${impersonatedUser.id}`);
    const unsubscribe = onValue(impUserRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setImpersonatedUser({ ...data, id: impersonatedUser.id });
      }
    });

    return () => unsubscribe();
  }, [impersonatedUser?.id]);

  // Fetch Settings
  useEffect(() => {
    const settingsRef = ref(db, 'settings');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setSettings(data);
        if (!data.specialPin) {
          update(settingsRef, { specialPin: '8532' });
        }
      } else {
        setSettings({ livesEnabledForAll: true, specialPin: '8532' }); // Default
        update(settingsRef, { livesEnabledForAll: true, specialPin: '8532' });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let unsubscribeDb: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Clean up previous DB listener if it exists
      if (unsubscribeDb) {
        unsubscribeDb();
        unsubscribeDb = null;
      }

      if (firebaseUser) {
        // User is signed in, fetch profile
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        unsubscribeDb = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.val();
            
            // Ensure structure for existing users
            let needsUpdate = false;
            const updates: any = {};

            if (!userData.id) {
              userData.id = firebaseUser.uid;
              updates.id = firebaseUser.uid;
              needsUpdate = true;
            }

            if (!userData.lifelines) {
              userData.lifelines = { fiftyFifty: 1, changeQuiz: 1, audiencePoll: 1, hint: 1 };
              updates.lifelines = userData.lifelines;
              needsUpdate = true;
            } else {
              let nestedNeedsUpdate = false;
              if (userData.lifelines.audiencePoll === undefined) {
                userData.lifelines.audiencePoll = 1;
                nestedNeedsUpdate = true;
              }
              if (userData.lifelines.hint === undefined) {
                userData.lifelines.hint = 1;
                nestedNeedsUpdate = true;
              }
              if (nestedNeedsUpdate) {
                updates.lifelines = userData.lifelines;
                needsUpdate = true;
              }
            }
            if (userData.raheeCoins === undefined) {
              userData.raheeCoins = 0;
              updates.raheeCoins = 0;
              needsUpdate = true;
            }
            if (!userData.language) {
              userData.language = 'en';
              updates.language = 'en';
              needsUpdate = true;
            }
            if (!userData.referralCode) {
              const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
              let code = '';
              for (let i = 0; i < 10; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
              }
              userData.referralCode = code;
              updates.referralCode = code;
              needsUpdate = true;
            }

            // --- Daily Login & Streak Logic ---
            const today = new Date().toISOString().split('T')[0];
            const nowTimeStr = new Date().toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'medium'
            });
            
            // Set current precise last login time and date
            userData.lastLoginTime = nowTimeStr;
            updates.lastLoginTime = nowTimeStr;
            needsUpdate = true;

            if (userData.lastLoginDate !== today) {
              userData.raheeCoins = (userData.raheeCoins || 0) + 100;
              userData.lastLoginDate = today;
              updates.raheeCoins = userData.raheeCoins;
              updates.lastLoginDate = today;
            }

            // Streak check
            if (userData.lastPlayedDate) {
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split('T')[0];

              if (userData.lastPlayedDate !== yesterdayStr && userData.lastPlayedDate !== today) {
                userData.streak = 0;
                updates.streak = 0;
                needsUpdate = true;
              }
            } else {
              userData.streak = 0;
              updates.streak = 0;
              needsUpdate = true;
            }

            // --- Lives Logic ---
            if (!userData.lives) {
              userData.lives = {
                count: 16,
                lastRefill: Date.now(),
                enabled: true
              };
              updates.lives = userData.lives;
              needsUpdate = true;
            } else {
              const now = Date.now();
              const diffMs = now - userData.lives.lastRefill;
              const refillInterval = 16 * 60 * 1000;

              if (diffMs >= refillInterval && userData.lives.count < 16) {
                const livesToAdd = Math.floor(diffMs / refillInterval);
                const newCount = Math.min(16, userData.lives.count + livesToAdd);
                userData.lives.count = newCount;
                userData.lives.lastRefill = userData.lives.lastRefill + (livesToAdd * refillInterval);
                updates.lives = userData.lives;
                needsUpdate = true;
              }
            }

            if (needsUpdate) {
              update(userRef, updates).catch(err => console.error("Sync error:", err));
            }

            setCurrentUser({ ...userData, id: firebaseUser.uid });
          } else {
            console.warn("User profile missing for UID:", firebaseUser.uid);
            setCurrentUser(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Database read error for user profile:", error);
          setLoading(false);
        });
      } else {
        // User is signed out
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDb) unsubscribeDb();
    };
  }, []);

  // Synchronize dynamic exit lastPlayedTime
  useEffect(() => {
    const activeUserId = impersonatedUser?.id || currentUser?.id;
    if (!activeUserId) return;

    const recordExitPlayedTime = () => {
      const nowTimeStr = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'medium'
      });
      update(ref(db, `users/${activeUserId}`), {
        lastPlayedTime: nowTimeStr
      }).catch((e) => console.error("Error setting exit lastPlayedTime:", e));
    };

    window.addEventListener('beforeunload', recordExitPlayedTime);
    window.addEventListener('pagehide', recordExitPlayedTime);

    return () => {
      window.removeEventListener('beforeunload', recordExitPlayedTime);
      window.removeEventListener('pagehide', recordExitPlayedTime);
      recordExitPlayedTime();
    };
  }, [currentUser?.id, impersonatedUser?.id]);

  return (
    <UserContext.Provider value={{ 
      currentUser: impersonatedUser || currentUser, 
      setCurrentUser, 
      loading, 
      settings,
      logout,
      impersonateBot,
      stopImpersonating,
      isImpersonating: !!impersonatedUser
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
