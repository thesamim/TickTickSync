export class CookieUtils {
  static serializeCookies(cookies: any[]): string {
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  static findSessionCookie(cookies: any[]): any {
    const sessionNames = ['t', 'session', 'sessionid', 'auth', 'jwt'];
    return cookies.find(c => 
      sessionNames.includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes('session') ||
      c.name.toLowerCase().includes('auth')
    );
  }

  static async testCookies(cookies: any[]): Promise<boolean> {
    try {
      const sessionCookie = this.findSessionCookie(cookies);
      if (!sessionCookie) return false;

      const response = await fetch('https://api.ticktick.com/api/v2/user/status', {
        headers: {
          'Cookie': `${sessionCookie.name}=${sessionCookie.value}`,
          'User-Agent': 'Obsidian Plugin'
        }
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }
}