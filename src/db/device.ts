export type DeviceInfo = {
	deviceId: string;
	deviceLabel?: string;
};

export function generateDeviceId(): string {
	return crypto.randomUUID();
}

export function detectDeviceLabel(): string {
	const ua = navigator.userAgent;

	if (/Android/i.test(ua)) return "Android";
	if (/iPhone|iPad/i.test(ua)) return "iOS";

	return "Desktop";
}
