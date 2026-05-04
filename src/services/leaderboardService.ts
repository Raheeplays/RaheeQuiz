import { db } from '../firebase/config';
import { ref, get, update, set } from 'firebase/database';
import { User, Settings } from '../types';
import { NotificationService, ServiceAccount } from './notificationService';

export class LeaderboardService {
  static async checkAndTriggerReset(serviceAccount: ServiceAccount | null) {
    try {
      const settingsSnap = await get(ref(db, 'settings'));
      const settings = settingsSnap.val() as Settings;
      
      const lastDaily = settings?.resetTimes?.lastDailyReset || 0;
      const lastWeekly = settings?.resetTimes?.lastWeeklyReset || 0;
      
      const now = new Date();
      
      // Check Daily (Day changed since last reset)
      const lastDailyDate = new Date(lastDaily);
      if (now.getDate() !== lastDailyDate.getDate() || now.getMonth() !== lastDailyDate.getMonth() || now.getFullYear() !== lastDailyDate.getFullYear()) {
        if (lastDaily !== 0) { // Don't trigger on very first initialization if we want to be safe, but here we likely want it
           await this.performReset('daily', serviceAccount);
        } else {
           // First time setting the timestamp
           await update(ref(db, 'settings/resetTimes'), { lastDailyReset: now.getTime() });
        }
      }
      
      // Check Weekly (Every Monday, check if day of week is 1 and it's a new day)
      const lastWeeklyDate = new Date(lastWeekly);
      // Simplified weekly: just check if more than 7 days passed OR if it's Monday and last was not today
      const isMonday = now.getDay() === 1;
      const isNewDay = now.getDate() !== lastWeeklyDate.getDate();
      if (isMonday && isNewDay) {
         await this.performReset('weekly', serviceAccount);
      } else if (lastWeekly === 0) {
         await update(ref(db, 'settings/resetTimes'), { lastWeeklyReset: now.getTime() });
      }

    } catch (error) {
      console.error("Leaderboard reset check failed:", error);
    }
  }

  private static async performReset(type: 'daily' | 'weekly', serviceAccount: ServiceAccount | null) {
    console.log(`Performing ${type} leaderboard reset...`);
    
    // 1. Fetch all users
    const usersSnap = await get(ref(db, 'users'));
    if (!usersSnap.exists()) return;
    
    const usersData = usersSnap.val();
    const usersList = Object.entries(usersData).map(([id, data]: [string, any]) => ({ ...data, id })) as User[];
    
    // 2. Sort to get ranks before reset
    const sorted = [...usersList];
    if (type === 'daily') {
      sorted.sort((a, b) => (b.dailyXP || 0) - (a.dailyXP || 0));
    } else {
      sorted.sort((a, b) => (b.weeklyXP || 0) - (a.weeklyXP || 0));
    }
    
    // 3. Prepare updates
    const updates: any = {};
    for (let i = 0; i < sorted.length; i++) {
        const user = sorted[i];
        if (type === 'daily') {
          updates[`users/${user.id}/dailyXP`] = 0;
        } else {
          updates[`users/${user.id}/weeklyXP`] = 0;
          // Weekly also resets daily? Usually yes
          updates[`users/${user.id}/dailyXP`] = 0;
        }
    }
    
    // Update reset timestamp
    const now = Date.now();
    if (type === 'daily') {
      updates['settings/resetTimes/lastDailyReset'] = now;
    } else {
      updates['settings/resetTimes/lastWeeklyReset'] = now;
      updates['settings/resetTimes/lastDailyReset'] = now; // Sync them
    }
    
    // 4. Batch update
    await update(ref(db), updates);
    
    // 5. Send notifications if serviceAccount is available
    if (serviceAccount) {
      await this.sendResetNotifications(type, sorted, serviceAccount);
    }
  }

  private static async sendResetNotifications(type: 'daily' | 'weekly', sortedUsers: User[], serviceAccount: ServiceAccount) {
    const templatesSnap = await get(ref(db, 'customNotifications'));
    const templates = templatesSnap.val();
    
    const template = type === 'daily' ? templates?.dailyReset : templates?.weeklyReset;
    if (!template) return;
    
    // Fetch all tokens
    const tokensSnap = await get(ref(db, 'fcmTokens'));
    if (!tokensSnap.exists()) return;
    const allTokens = tokensSnap.val();
    
    for (let i = 0; i < sortedUsers.length; i++) {
      const user = sortedUsers[i];
      const rank = i + 1;
      const userTokensMap = allTokens[user.id];
      
      if (userTokensMap && template) {
        const tokens = Object.values(userTokensMap) as string[];
        const title = (template.title || "Leaderboard Reset").replace('{rank}', rank.toString());
        const body = (template.body || "A new leaderboard has started!").replace('{rank}', rank.toString());
        
        for (const token of tokens) {
          try {
            await NotificationService.sendToToken(serviceAccount, token, title, body);
          } catch (e) {
            console.error(`Failed to send rank notification to ${user.id}:`, e);
          }
        }
      }
    }
  }
}
