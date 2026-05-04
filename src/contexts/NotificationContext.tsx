import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ServiceAccount } from '../services/notificationService';
import { db } from '../firebase/config';
import { ref, onValue } from 'firebase/database';
import { useUser } from './UserContext';

interface NotificationContextType {
  serviceAccount: ServiceAccount | null;
  setServiceAccount: (sa: ServiceAccount | null) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [serviceAccount, setServiceAccount] = useState<ServiceAccount | null>(null);
  const { currentUser } = useUser();

  useEffect(() => {
    // Only attempt to load if we have a user and they're an admin
    // This is safer and avoids unnecessary hits/permission errors for regular users
    if (currentUser?.role === 'admin') {
      const adminConfigRef = ref(db, 'adminConfig/serviceAccount');
      const unsubscribe = onValue(adminConfigRef, (snapshot) => {
        if (snapshot.exists()) {
          setServiceAccount(snapshot.val());
        } else {
          setServiceAccount(null);
        }
      }, (error) => {
        console.error("Failed to load Admin SDK:", error);
      });
      return () => unsubscribe();
    } else {
      setServiceAccount(null);
    }
  }, [currentUser?.role]);

  return (
    <NotificationContext.Provider value={{ serviceAccount, setServiceAccount }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
