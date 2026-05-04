import * as jose from 'jose';

export interface FCMMessage {
  token?: string;
  topic?: string;
  condition?: string;
  notification: {
    title: string;
    body: string;
    image?: string;
  };
  data?: {
    [key: string]: string;
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
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
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

  static async sendToAll(serviceAccount: ServiceAccount, title: string | {title: string, body: string, image?: string}, body?: string, image?: string) {
    const payload = typeof title === 'object' ? title : { title, body: body || '', image };
    return this.sendNotification(serviceAccount, {
      topic: 'all_users',
      notification: payload
    });
  }

  static async sendToTopic(serviceAccount: ServiceAccount, topic: string, title: string | {title: string, body: string, image?: string}, body?: string, image?: string) {
    const payload = typeof title === 'object' ? title : { title, body: body || '', image };
    return this.sendNotification(serviceAccount, {
      topic,
      notification: payload
    });
  }

  static async sendToToken(serviceAccount: ServiceAccount, token: string, title: string | {title: string, body: string, image?: string}, body?: string, image?: string) {
    const payload = typeof title === 'object' ? title : { title, body: body || '', image };
    return this.sendNotification(serviceAccount, {
      token,
      notification: payload
    });
  }
}
