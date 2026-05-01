import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { db, auth } from '../firebase/config';
import { ref, onValue, get } from 'firebase/database';
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

  // Helper to sync user data from Firebase
  const syncUserData = (username: string) => {
    const userRef = ref(db, `users/${username}`);
    return onValue(userRef, (snapshot) => {
      if (snapshot.exists()) {
        const userData = snapshot.val();
        setCurrentUser(prev => ({ ...prev, ...userData, id: username }));
      }
      setLoading(false);
    });
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Try to get username from mapping
        const mappingRef = ref(db, `uidToUsername/${user.uid}`);
        const mappingSnap = await get(mappingRef);
        
        if (mappingSnap.exists()) {
          const username = mappingSnap.val();
          const unsubscribeUser = syncUserData(username);
          return () => unsubscribeUser();
        } else {
           // No mapping found yet (might be halfway through signup or legacy)
           const saved = localStorage.getItem('rahee_quiz_user');
           if (saved) {
             const parsed = JSON.parse(saved);
             if (parsed.id) {
               syncUserData(parsed.id);
             }
           } else {
             setLoading(false);
           }
        }
      } else {
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

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
