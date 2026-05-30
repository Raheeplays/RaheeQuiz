import { ref, push, set } from 'firebase/database';
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
