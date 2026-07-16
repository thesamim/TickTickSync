import { Platform } from 'obsidian';
import type { DeviceInfo } from './schema';

let currentDeviceInfo: DeviceInfo | null = null;

export function getCurrentDeviceInfo(): DeviceInfo | null {
	return currentDeviceInfo;
}

export function setCurrentDeviceInfo(info: DeviceInfo): void {
	currentDeviceInfo = info;
}

export function generateDeviceId(): string {
	return crypto.randomUUID();
}

export async function detectDeviceLabel(): Promise<string> {
	if (Platform.isDesktop) {
		try {
			const nodeRequire = (window as unknown as { require?: (mod: string) => { hostname?: () => string } }).require;
			const hostname = nodeRequire?.('os')?.hostname?.();
			if (hostname) return hostname;
		} catch {
			// Fallback: require not available
		}
		if (Platform.isMacOS) return "Mac";
		if (Platform.isWin) return "Windows";
		if (Platform.isLinux) return "Linux";
		return "Desktop";
	} else {
		try {
			const devicePlugin = (window as { Capacitor?: { Plugins?: { Device: { getInfo(): Promise<{ name?: string }> } } } }).Capacitor?.Plugins?.Device;
			if (devicePlugin) {
				const info = await devicePlugin.getInfo();
				return info?.name || 'Mobile Device';
			}
		} catch (e) {
			console.error("Failed to get device info via Capacitor", e);
		}

		return "Mobile Device";
	}

}
