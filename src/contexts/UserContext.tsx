import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { db, auth } from '../firebase/config';
import { ref, onValue, get, update } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';

interface UserContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  loading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in, fetch profile
        const userRef = ref(db, `users/${firebaseUser.uid}`);
        const unsubscribeDb = onValue(userRef, (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.val();
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
          console.error("Database read error:", error);
          if (error.message.includes('permission_denied')) {
            // This shouldn't happen if auth exists, but good to handle
            setCurrentUser(null);
          }
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
