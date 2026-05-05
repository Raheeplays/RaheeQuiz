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
    // Load Admin SDK for all users to enable client-side push for social features
    if (currentUser) {
      const adminConfigRef = ref(db, 'adminConfig/serviceAccount');
      const unsubscribe = onValue(adminConfigRef, (snapshot) => {
        if (snapshot.exists()) {
          setServiceAccount(snapshot.val());
        } else {
          setServiceAccount(null);
        }
      }, (error) => {
        console.error("Failed to load Admin SDK (this is expected if not admin unless rules are set):", error);
        setServiceAccount(null);
      });
      return () => unsubscribe();
    } else {
      setServiceAccount(null);
    }
  }, [currentUser?.id]);

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
