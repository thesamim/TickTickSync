import "@testing-library/jest-dom/vitest";
import { vi } from 'vitest';

vi.stubGlobal('moment', vi.fn(() => ({
	format: vi.fn(() => '2024-01-01-00:00:00')
})));
