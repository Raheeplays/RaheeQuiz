import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { db } from '../firebase/config';
import { ref, onValue, get } from 'firebase/database';

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  loading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('rahee_quiz_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (currentUser?.id) {
      const userRef = ref(db, `users/${currentUser.id}`);
      const unsubscribe = onValue(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.val();
          // Ensure structure for existing users and sync to DB if missing
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

          const syncData = async () => {
            if (needsUpdate) {
              const { update } = await import('firebase/database');
              await update(userRef, updates);
            }
          };
          syncData();

          setCurrentUser(prev => ({ ...prev, ...userData }));
          localStorage.setItem('rahee_quiz_user', JSON.stringify({ ...currentUser, ...userData }));
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('rahee_quiz_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('rahee_quiz_user');
    }
  }, [currentUser]);

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser, loading }}>
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
