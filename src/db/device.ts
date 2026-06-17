import { Platform } from 'obsidian';

export function generateDeviceId(): string {
	return crypto.randomUUID();
}

export async function detectDeviceLabel(): Promise<string> {
	if (Platform.isDesktopApp) {
		return (
			// eslint-disable-next-line @typescript-eslint/no-var-requires
			require("os").hostname() ||
			(Platform.isMacOS
				? "Mac"
				: Platform.isWin
					? "Windows"
					: Platform.isLinux
						? "Linux"
						: "Desktop")
		);
	} else {
		try {
			const devicePlugin = (window as any).Capacitor?.Plugins?.Device;
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
