import { ref, push, set, get } from 'firebase/database';
import { db } from './firebase/config';

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

export async function logAdminNotification(
  type: 'signup' | 'approved' | 'login' | 'play',
  userName: string,
  details?: string
) {
  try {
    const settingsSnap = await get(ref(db, 'settings'));
    const isEnabled = settingsSnap.exists() ? settingsSnap.val().adminNotificationsEnabled !== false : true;
    if (isEnabled) {
      const alertRef = push(ref(db, 'admin_notifications'));
      let message = '';
      if (type === 'signup') {
        message = `New Player Signup: ${userName} (Username: @${details || ''})`;
      } else if (type === 'approved') {
        message = `Player Approved: "${userName}" is now approved and active.`;
      } else if (type === 'login') {
        message = `Player Login: "${userName}" logged into the platform.`;
      } else if (type === 'play') {
        message = `Player Playing: "${userName}" is now playing ${details || 'a game'}.`;
      }

      await set(alertRef, {
        id: alertRef.key,
        type,
        message,
        timestamp: Date.now(),
        read: false
      });
    }
  } catch (err) {
    console.error("Failed to log admin notification:", err);
  }
}

