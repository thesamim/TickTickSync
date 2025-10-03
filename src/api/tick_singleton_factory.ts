// Centralized singleton factory for Tick instances.
// Keeps exactly one Tick and updates its mutable fields when called again.

import { Tick } from '@/api';

type TickInitOptions = {
  baseUrl?: string;
  token?: string;
  checkPoint?: number;
  username?: string;
  password?: string;
};

let tickInstance: Tick | null = null;

export function getTick(options: TickInitOptions = {}): Tick {
  if (!tickInstance) {
    tickInstance = new Tick({
      baseUrl: options.baseUrl,
      token: options.token ?? '',
      checkPoint: options.checkPoint ?? 0,
      username: options.username,
      password: options.password
    });
    return tickInstance;
  }

  // Update mutable state on the existing instance
  if (typeof options.token === 'string') {
    tickInstance.token = options.token;
  }
  if (typeof options.checkPoint === 'number') {
    tickInstance.checkpoint = options.checkPoint;
  }
  if (typeof options.username === 'string') {
    (tickInstance as any).username = options.username;
  }
  if (typeof options.password === 'string') {
    (tickInstance as any).password = options.password;
  }
  // If baseUrl changes, recompute URLs similarly to constructor
  if (typeof options.baseUrl === 'string' && options.baseUrl.length > 0) {
    const baseUrl = options.baseUrl;
    tickInstance.apiUrl = `${tickInstance.apiProtocol}${baseUrl}${tickInstance.apiVersion}`;
    (tickInstance as any).loginUrl = `${tickInstance.protocol}${baseUrl}${tickInstance.apiVersion}`;
    (tickInstance as any).originUrl = `${tickInstance.protocol}${baseUrl}`;
  }

  return tickInstance;
}
