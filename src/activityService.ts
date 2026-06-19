import { ref, push, set, get } from 'firebase/database';
import { db } from './firebase/config';
import { NotificationService } from './services/notificationService';

export interface ActivityLog {
  id?: string;
  userId: string;
  userName: string;
  action: 'send_challenge' | 'accept_challenge' | 'reject_challenge' | 'play_now' | 'cancel_match' | 'cancel_challenge' | 'textbox_reply_sent' | 'claim_daily_rewards' | 'claim_free_reward' | 'watch_ad_reward' | 'textbox_reply';
  timestamp: number;
  details: string;
}

export async function logActivity(
  userId: string, 
  userName: string, 
  action: 'send_challenge' | 'accept_challenge' | 'reject_challenge' | 'play_now' | 'cancel_match' | 'cancel_challenge' | 'textbox_reply_sent' | 'claim_daily_rewards' | 'claim_free_reward' | 'watch_ad_reward' | 'textbox_reply', 
  details: string
) {
  try {
    const logsRef = ref(db, 'adminConfig/activityLogs');
    const newLogRef = push(logsRef);
    await set(newLogRef, {
      userId,
      userName,
      action,
      timestamp: Date.now(),
      details
    });
  } catch (error) {
    console.error("Failed to log activity to RTDB:", error);
  }
}

const recentNotificationsCache = new Map<string, number>();
const RECENT_DEDUPLICATE_WINDOW_MS = 1800000; // 30 minutes window (1.8 million milliseconds)

export async function logAdminNotification(
  type: 'signup' | 'approved' | 'login' | 'play',
  userName: string,
  details?: string
) {
  try {
    const cleanUser = userName.trim().toLowerCase();

    // 1. SessionStorage Deduplication: Completely prevent duplicates within the active browser session/tab
    // EXCEPT for 'play' which can be sent multiple times
    if (type !== 'play' && typeof window !== 'undefined' && window.sessionStorage) {
      const sessionKey = `rahee_notif_${type}_${cleanUser}`;
      if (window.sessionStorage.getItem(sessionKey)) {
        console.log(`[Deduplication] Prevented duplicate send by SessionStorage for key: ${sessionKey}`);
        return;
      }
      window.sessionStorage.setItem(sessionKey, 'true');
    }

    // 2. In-Memory Cache Deduplication: Guard against duplicates sent within a window
    // For play notifications, use a 15-second window to prevent rapid UI double/quad rendering glitch duplicates,
    // while allowing the player to trigger play notifications multiple times within a short period.
    const windowMs = type === 'play' ? 15000 : RECENT_DEDUPLICATE_WINDOW_MS;
    const cacheKey = type === 'play' ? `${type}:${cleanUser}:${details || ''}` : `${type}:${cleanUser}`;
    const now = Date.now();
    const lastSent = recentNotificationsCache.get(cacheKey);
    if (lastSent && (now - lastSent < windowMs)) {
      console.log(`[Deduplication] Prevented duplicate send by cache for key: ${cacheKey}`);
      return;
    }
    recentNotificationsCache.set(cacheKey, now);

    const settingsSnap = await get(ref(db, 'settings'));
    const settingsVal = settingsSnap.exists() ? settingsSnap.val() : {};
    
    // Check if notifications are enabled
    const isGeneralEnabled = settingsVal.adminNotificationsEnabled !== false;
    const isPlayEnabled = settingsVal.adminNotifyOnPlay !== false;
    
    // We notify if general is enabled, and if it's a play/login event, we also check if play/login tracking is active
    let isNotifyEnabled = isGeneralEnabled;
    if (type === 'play' || type === 'login') {
      isNotifyEnabled = isGeneralEnabled && isPlayEnabled;
    }

    if (isNotifyEnabled) {
      const alertRef = push(ref(db, 'admin_notifications'));
      let message = '';
      if (type === 'signup') {
        message = `New Player Signup: ${userName} (Username: @${details || ''})`;
      } else if (type === 'approved') {
        message = `Player Approved: "${userName}" is now approved and active.`;
      } else if (type === 'login') {
        message = `Player Login: "${userName}" logged into the platform.`;
      } else if (type === 'play') {
        const playDetails = details || 'General in solomode';
        message = `${userName} is playing ${playDetails}`;
      }

      await set(alertRef, {
        id: alertRef.key,
        type,
        message,
        timestamp: Date.now(),
        read: false
      });

      // Dispatch real FCM Push delivery to any connected Administrator tokens
      const serviceAccountSnap = await get(ref(db, 'adminConfig/serviceAccount'));
      if (serviceAccountSnap.exists()) {
        const serviceAccount = serviceAccountSnap.val();
        if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key) {
          
          // 1. Send directly to the Master FCM token configured by the admin (independent of users list)
          const directToken = settingsVal.adminConfigFcmToken;
          const isMasterFcmEnabled = settingsVal.adminMasterFcmEnabled !== false;
          if (isMasterFcmEnabled && directToken && typeof directToken === 'string' && directToken.trim().length > 10) {
            try {
              await NotificationService.sendToToken(
                serviceAccount as any,
                directToken.trim(),
                'Rahee Quiz System Alert',
                message,
                undefined,
                {
                  action_type: 'system_log',
                  msg_type: type,
                  notif_id: alertRef.key || ''
                }
              );
            } catch (fcmError) {
              console.error(`FCM Dispatch nested error for adminConfigFcmToken; error:`, fcmError);
            }
          }

          // 2. Send to specific administrator user accounts' registered browser FCM tokens
          try {
            const usersSnap = await get(ref(db, 'users'));
            if (usersSnap.exists()) {
              const usersObj = usersSnap.val();
              const admins: any[] = [];
              for (const [uid, uVal] of Object.entries(usersObj)) {
                if (uVal && typeof uVal === 'object' && (uVal as any).role === 'admin') {
                  admins.push({
                    ...(uVal as any),
                    id: uid
                  });
                }
              }
              
              for (const admin of admins) {
                const tokenSnap = await get(ref(db, `fcmTokens/${admin.id}`));
                if (tokenSnap.exists()) {
                  const tokenData = tokenSnap.val();
                  let tokens: string[] = [];
                  if (typeof tokenData === 'string') {
                    tokens = [tokenData];
                  } else if (typeof tokenData === 'object' && tokenData !== null) {
                    tokens = Object.values(tokenData).filter(t => typeof t === 'string') as string[];
                  }
                  
                  for (const token of tokens) {
                    if (token.trim().length > 10) {
                      try {
                        await NotificationService.sendToToken(
                          serviceAccount as any,
                          token,
                          'Rahee Quiz System Alert',
                          message,
                          undefined,
                          {
                            action_type: 'system_log',
                            msg_type: type,
                            notif_id: alertRef.key || ''
                          }
                        );
                      } catch (fcmError) {
                        console.error(`FCM Dispatch nested error for admin token on account: ${admin.id}; error:`, fcmError);
                      }
                    }
                  }
                }
              }
            }
          } catch (usersErr) {
            console.error("Failed to load users list or dispatch to admin accounts:", usersErr);
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to log admin notification:", err);
  }
}

