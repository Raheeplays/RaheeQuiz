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
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch Settings
  useEffect(() => {
    const settingsRef = ref(db, 'settings');
    const unsubscribe = onValue(settingsRef, (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.val());
      } else {
        setSettings({ livesEnabledForAll: true }); // Default
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in, fetch profile
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        const unsubscribeDb = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.val();
            // Ensure ID consistency
            if (userData.id && userData.id !== firebaseUser.uid) {
              console.error("User identity mismatch detected. Stopping sync.");
              return;
            }
            
            // Ensure structure for existing users
            let needsUpdate = false;
            const updates: any = {};

            if (!userData.lifelines) {
              userData.lifelines = { fiftyFifty: 1, changeQuiz: 1 };
              updates.lifelines = userData.lifelines;
              needsUpdate = true;
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

            // --- Daily Login & Streak Logic ---
            const today = new Date().toISOString().split('T')[0];
            if (userData.lastLoginDate !== today) {
              userData.raheeCoins = (userData.raheeCoins || 0) + 100;
              userData.lastLoginDate = today;
              updates.raheeCoins = userData.raheeCoins;
              updates.lastLoginDate = today;
              needsUpdate = true;
            }

            // Streak check
            if (userData.lastPlayedDate) {
              const lastPlayed = new Date(userData.lastPlayedDate);
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split('T')[0];

              if (userData.lastPlayedDate === yesterdayStr) {
                // Streak continues - this is updated when they finish a quiz
              } else if (userData.lastPlayedDate !== today) {
                // Streak broken
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
              // Refill logic: +1 every 16 minutes
              const now = Date.now();
              const diffMs = now - userData.lives.lastRefill;
              const refillInterval = 16 * 60 * 1000; // 16 minutes

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
          // Only log the error. Do NOT force logout unless it's a critical auth failure.
          // Permission denied here might be transient or related to a specific nested path change.
          setLoading(false);
        });

        return () => unsubscribeDb();
      } else {
        // User is signed out
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser, loading, settings }}>
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
