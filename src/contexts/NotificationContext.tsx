import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ServiceAccount } from '../services/notificationService';
import { db } from '../firebase/config';
import { ref, onValue, get } from 'firebase/database';
import { useUser } from './UserContext';
import { NotificationService } from '../services/notificationService';

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

  useEffect(() => {
    (window as any).handleNotificationMatchAction = async (
      actionType: string,
      roomId?: string,
      opponentId?: string,
      hostId?: string
    ) => {
      console.log("FCM Action Received from Native Android:", actionType, roomId, opponentId, hostId);
      if ((actionType === 'accept' || actionType === 'play_now') && roomId) {
        // Dispatch start-match event to start the match globally
        window.dispatchEvent(new CustomEvent('start-match', { detail: { roomId } }));
      } else if (actionType === 'friend_accept' && opponentId) {
        if (serviceAccount && currentUser) {
          try {
            const tokensSnap = await get(ref(db, `fcmTokens/${opponentId}`));
            if (tokensSnap.exists()) {
              const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
              const title = 'Friend Request Accepted';
              const body = `${currentUser.name} accepted your friend request!`;
              for (const token of tokens) {
                await NotificationService.sendToToken(serviceAccount, token, title, body);
              }
              console.log("Friend acceptance plain push notification sent to opponent:", opponentId);
            }
          } catch (e) {
            console.error("Failed sending acceptance post-push:", e);
          }
        }
      } else if (actionType === 'friend_reject' && opponentId) {
        if (serviceAccount && currentUser) {
          try {
            const tokensSnap = await get(ref(db, `fcmTokens/${opponentId}`));
            if (tokensSnap.exists()) {
              const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
              const title = 'Friend Request Declined';
              const body = `${currentUser.name} rejected your friend request`;
              for (const token of tokens) {
                await NotificationService.sendToToken(serviceAccount, token, title, body);
              }
              console.log("Friend rejection push notification sent to opponent:", opponentId);
            }
          } catch (e) {
            console.error("Failed sending rejection post-push:", e);
          }
        }
      }
    };

    return () => {
      delete (window as any).handleNotificationMatchAction;
    };
  }, [serviceAccount, currentUser]);

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
