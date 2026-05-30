import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ServiceAccount } from '../services/notificationService';
import { db } from '../firebase/config';
import { ref, onValue, get, set, remove } from 'firebase/database';
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
      
      const effectiveHostId = hostId || opponentId;

      if (actionType === 'accept' && roomId && effectiveHostId && currentUser) {
        console.log("Processing challenge accept action via NotificationContext...", roomId, effectiveHostId);
        try {
          // 1. Write the accepted reply state to the host's reply node
          await set(ref(db, `users/${effectiveHostId}/challengeReplies/${currentUser.id}`), {
            opponentId: currentUser.id,
            opponentName: currentUser.name,
            roomId: roomId,
            status: 'accepted',
            timestamp: Date.now()
          });

          // 2. Erase the challenge node under target user's challenges (clean up my list)
          await remove(ref(db, `users/${currentUser.id}/challenges/${effectiveHostId}`));

          // 3. Mark myself as joined participant in the match room object
          await set(ref(db, `matches/${roomId}/participants/${currentUser.id}`), {
            userId: currentUser.id,
            userName: currentUser.name,
            score: 0,
            currentIndex: 0,
            finished: false,
            accuracy: 0
          });

          // 4. Update the room status to 'accepted'
          await set(ref(db, `matches/${roomId}/status`), 'accepted');

          // 5. Send FCM push callback notification to original host to let them know they should run/reload the game!
          if (serviceAccount) {
            try {
              const tokensSnap = await get(ref(db, `fcmTokens/${effectiveHostId}`));
              if (tokensSnap.exists()) {
                const tokens = NotificationService.getTokensFromValue(tokensSnap.val());
                const title = "Challenge Accepted!";
                const body = `${currentUser.name} accepted your challenge. Click Play Now!`;
                const pushData = {
                  action_type: 'reply_accepted',
                  roomId: roomId,
                  opponentId: currentUser.id,
                  opponentName: currentUser.name
                };
                for (const token of tokens) {
                  await NotificationService.sendToToken(serviceAccount, token, title, body, undefined, pushData);
                }
                console.log("Push notification sent to host informing acceptance:", effectiveHostId);
              }
            } catch (fcmErr) {
              console.error("FCM Send reply accepted update failure inside context:", fcmErr);
            }
          }

          // 6. Direct launch game screen locally of original user
          window.dispatchEvent(new CustomEvent('start-match', { detail: { roomId } }));
        } catch (dbErr) {
          console.error("FCM Accept DB routing errors:", dbErr);
          // Standard fallback start match
          window.dispatchEvent(new CustomEvent('start-match', { detail: { roomId } }));
        }
      } else if (actionType === 'start_exam' && roomId) {
        console.log("Processing start_exam FCM action inside NotificationContext, room/examId:", roomId);
        window.dispatchEvent(new CustomEvent('start-exam', { detail: { examId: roomId } }));
      } else if (actionType === 'play_now' && roomId) {
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
