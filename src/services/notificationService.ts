import * as jose from 'jose';

export interface FCMMessage {
  token?: string;
  topic?: string;
  condition?: string;
  notification?: {
    title: string;
    body: string;
    image?: string;
  };
  data?: {
    [key: string]: string;
  };
  android?: {
    priority?: 'normal' | 'high';
  };
}

export interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

export class NotificationService {
  private static async getAccessToken(serviceAccount: ServiceAccount): Promise<string> {
    const { client_email, private_key } = serviceAccount;
    
    // JWT Claims
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    
    const payload = {
      iss: client_email,
      sub: client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat,
      exp,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    };

    const encoder = new TextEncoder();
    const pk = await jose.importPKCS8(private_key, 'RS256');
    
    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(pk);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get access token: ${error.error_description || error.error}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  static async sendNotification(serviceAccount: ServiceAccount, message: FCMMessage) {
    try {
      const accessToken = await this.getAccessToken(serviceAccount);
      const url = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;
      
      const messageWithPriority: FCMMessage = {
        ...message,
        android: {
          priority: 'high',
          ...message.android
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: messageWithPriority }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`FCM error: ${error.error.message}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Send notification failed:', error);
      throw error;
    }
  }

  static getTokensFromValue(val: any): string[] {
    if (!val) return [];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      return trimmed.length > 10 ? [trimmed] : [];
    }
    if (Array.isArray(val)) {
      return val.filter(item => typeof item === 'string' && item.trim().length > 10);
    }
    if (typeof val === 'object') {
      const values = Object.values(val);
      const tokens = values.filter((item: any) => typeof item === 'string' && item.trim().length > 10) as string[];
      if (tokens.length > 0) return tokens;
    }
    return [];
  }

  static async sendToAll(serviceAccount: ServiceAccount, title: string | {title: string, body: string, image?: string}, body?: string, image?: string, data?: { [key: string]: string }) {
    const payload = typeof title === 'object' ? title : { title, body: body || '', image };
    const interactiveActions = ['challenge', 'reply_accepted', 'reply_rejected', 'countdown', 'textbox_reply', 'friend_request'];
    const isInteractive = data && data.action_type && interactiveActions.includes(data.action_type);
    
    if (isInteractive) {
      const mergedData = {
        ...data,
        title: payload.title,
        body: payload.body,
        ...(payload.image ? { image: payload.image } : {})
      };
      return this.sendNotification(serviceAccount, {
        topic: 'all_users',
        data: mergedData
      });
    }

    const mergedData = {
      title: payload.title,
      body: payload.body,
      ...(payload.image ? { image: payload.image } : {}),
      ...(data || {})
    };

    // Aligned with background/killed state delivery: send as data-only payload to force onMessageReceived invocation
    return this.sendNotification(serviceAccount, {
      topic: 'all_users',
      data: mergedData
    });
  }

  static async sendToTopic(serviceAccount: ServiceAccount, topic: string, title: string | {title: string, body: string, image?: string}, body?: string, image?: string, data?: { [key: string]: string }) {
    const payload = typeof title === 'object' ? title : { title, body: body || '', image };
    const interactiveActions = ['challenge', 'reply_accepted', 'reply_rejected', 'countdown', 'textbox_reply', 'friend_request'];
    const isInteractive = data && data.action_type && interactiveActions.includes(data.action_type);
    
    if (isInteractive) {
      const mergedData = {
        ...data,
        title: payload.title,
        body: payload.body,
        ...(payload.image ? { image: payload.image } : {})
      };
      return this.sendNotification(serviceAccount, {
        topic,
        data: mergedData
      });
    }

    const mergedData = {
      title: payload.title,
      body: payload.body,
      ...(payload.image ? { image: payload.image } : {}),
      ...(data || {})
    };

    // Aligned with background/killed state delivery: send as data-only payload to force onMessageReceived invocation
    return this.sendNotification(serviceAccount, {
      topic,
      data: mergedData
    });
  }

  static async sendToToken(serviceAccount: ServiceAccount, token: string, title: string | {title: string, body: string, image?: string}, body?: string, image?: string, data?: { [key: string]: string }) {
    const payload = typeof title === 'object' ? title : { title, body: body || '', image };
    const interactiveActions = ['challenge', 'reply_accepted', 'reply_rejected', 'countdown', 'textbox_reply', 'friend_request'];
    const isInteractive = data && data.action_type && interactiveActions.includes(data.action_type);
    
    if (isInteractive) {
      const mergedData = {
        ...data,
        title: payload.title,
        body: payload.body,
        ...(payload.image ? { image: payload.image } : {})
      };
      return this.sendNotification(serviceAccount, {
        token,
        data: mergedData
      });
    }

    const mergedData = {
      title: payload.title,
      body: payload.body,
      ...(payload.image ? { image: payload.image } : {}),
      ...(data || {})
    };

    // Aligned with background/killed state delivery: send as data-only payload to force onMessageReceived invocation
    return this.sendNotification(serviceAccount, {
      token,
      data: mergedData
    });
  }
}
