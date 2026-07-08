import { requestUrl } from 'obsidian';

export interface CookieData {
  name: string;
  value: string;
}

export class CookieUtils {
  static serializeCookies(cookies: CookieData[]): string {
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  static findSessionCookie(cookies: CookieData[]): CookieData | undefined {
    const sessionNames = ['t', 'session', 'sessionid', 'auth', 'jwt'];
    return cookies.find(c => 
      sessionNames.includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes('session') ||
      c.name.toLowerCase().includes('auth')
    );
  }

  static async testCookies(cookies: CookieData[]): Promise<boolean> {
    try {
      const sessionCookie = this.findSessionCookie(cookies);
      if (!sessionCookie) return false;

      const response = await requestUrl({
        url: 'https://api.ticktick.com/api/v2/user/status',
        method: 'GET',
        headers: {
          'Cookie': `${sessionCookie.name}=${sessionCookie.value}`,
          'User-Agent': 'Obsidian Plugin'
        }
      });

      return response.status === 200;
    } catch {
      return false;
    }
  }
}