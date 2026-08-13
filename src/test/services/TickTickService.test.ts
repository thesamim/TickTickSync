import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { TickTickService } from '@/services/index';

// Mock dependencies
vi.mock('obsidian', () => ({
	App: vi.fn(),
	AbstractInputSuggest: class AbstractInputSuggest {
		constructor() {}
	},
	MarkdownRenderChild: vi.fn(),
	MarkdownView: vi.fn(),
	Modal: vi.fn(),
	Notice: vi.fn(),
	Plugin: vi.fn(),
	PluginSettingTab: vi.fn(),
	// SettingPage is imported as a value but only ever subclassed lazily inside
	// getSettingDefinitions() (Obsidian 1.13.0+ only), so the mock only needs
	// to exist for imports; it is never instantiated on the 1.12.7 path.
	SettingPage: class SettingPage {},
	TFile: vi.fn(),
	TFolder: vi.fn(),
}));

vi.mock('@/settings', () => ({
	getSettings: vi.fn(() => ({
		token: 'test-token',
		inboxID: 'inbox-id',
		baseURL: 'https://api.ticktick.com',
		checkPoint: 0,
		SyncProject: '',
		SyncTag: '',
		tagAndOr: 0,
		debugMode: false,
	})),
	updateSettings: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
	default: {
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
	},
}));

vi.mock('@/utils/locks', () => ({
	doWithLock: vi.fn((_name: string, fn: () => void) => fn()),
}));

vi.mock('@/db/dexie', () => ({
	db: {
		meta: { update: vi.fn() },
		tasks: {
			where: vi.fn(),
			toArray: vi.fn().mockResolvedValue([]),
			bulkPut: vi.fn(),
		},
		files: { toArray: vi.fn().mockResolvedValue([]) },
		transaction: vi.fn((_mode: string, _table: string, cb: () => void) => cb()),
	},
}));

vi.mock('@/db/files', () => ({
	getFile: vi.fn(),
	getAllFiles: vi.fn().mockResolvedValue([]),
	upsertFile: vi.fn(),
}));

vi.mock('@/db/projects', () => ({
	getAllProjects: vi.fn().mockResolvedValue([]),
	getProjectById: vi.fn(),
	upsertProjects: vi.fn(),
}));

vi.mock('@/db/tasks', () => ({
	loadTasksFromCache: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/api/tick_singleton_factory', () => ({
	getTick: vi.fn(),
}));

const cleanupModalShowModal = vi.fn();
vi.mock('@/modals/CleanupDatabaseModal', () => ({
	CleanupDatabaseModal: class CleanupDatabaseModal {
		constructor(_app: unknown, _files: string[]) {}
		async showModal() {
			return cleanupModalShowModal();
		}
	},
}));

describe('TickTickService', () => {
	let service: TickTickService;
	let mockPlugin: unknown;

	beforeEach(() => {
		vi.clearAllMocks();

		mockPlugin = {
			app: {
				vault: {
					getAbstractFileByPath: vi.fn().mockReturnValue({}),
					getMarkdownFiles: vi.fn().mockReturnValue([]),
				},
			},
			taskCache: { fill: vi.fn(), clear: vi.fn() },
			tickTickRestAPI: {},
			vaultSyncCoordinator: { syncVaultWithDatabase: vi.fn() },
			taskModificationDetector: {
				checkFileForNewTasks: vi.fn().mockResolvedValue(undefined),
				checkFileForModifications: vi.fn().mockResolvedValue(undefined),
			},
			taskDeletionHandler: {
				checkFileForDeletedTasks: vi.fn().mockResolvedValue(undefined),
			},
			reorganizeFilesToFolders: vi.fn(),
			fileTaskQueries: {
				fileHasTasks: vi.fn(),
				getTasksInFile: vi.fn().mockResolvedValue([]),
			},
			fileOperation: {
				checkForDuplicates: vi.fn().mockResolvedValue(undefined),
			},
			taskOperationsService: { updateTaskContentForFile: vi.fn() },
			folderSyncService: { detectProjectGroupChange: vi.fn() },
			taskRepository: { loadTaskById: vi.fn(), upsertTask: vi.fn() },
		};

		service = new TickTickService(mockPlugin);
		service.api = {} as unknown;
	});

	describe('syncFiles - two-phase ordering', () => {
		it('should run modifications before deletions for the same file', async () => {
			const filesToSync: Record<string, unknown> = {
				'Projects/ProjectA.md': { defaultProjectId: 'proj-a' },
			};
			(mockPlugin as Record<string, unknown>).fileMetadataService = {
				getAllFileMetadata: vi.fn().mockResolvedValue(filesToSync),
				checkForDuplicates: vi.fn().mockResolvedValue({ duplicates: {} }),
				deleteFileMetadata: vi.fn(),
			};

			await service.syncFiles(false);

			const modDetector = (mockPlugin as { taskModificationDetector: { checkFileForModifications: Mock; checkFileForNewTasks: Mock } }).taskModificationDetector;
			const deletionHandler = (mockPlugin as { taskDeletionHandler: { checkFileForDeletedTasks: Mock } }).taskDeletionHandler;

			// Verify modifications ran
			expect(modDetector.checkFileForModifications).toHaveBeenCalledWith('Projects/ProjectA.md');
			// Verify deletions ran
			expect(deletionHandler.checkFileForDeletedTasks).toHaveBeenCalledWith('Projects/ProjectA.md');
		});

		it('should run modifications on all files before deletions on any file', async () => {
			const filesToSync: Record<string, unknown> = {
				'Projects/ProjectA.md': { defaultProjectId: 'proj-a' },
				'Projects/ProjectB.md': { defaultProjectId: 'proj-b' },
				'Projects/ProjectC.md': { defaultProjectId: 'proj-c' },
			};
			(mockPlugin as Record<string, unknown>).fileMetadataService = {
				getAllFileMetadata: vi.fn().mockResolvedValue(filesToSync),
				checkForDuplicates: vi.fn().mockResolvedValue({ duplicates: {} }),
				deleteFileMetadata: vi.fn(),
			};

			// Track call order
			const callOrder: string[] = [];
			(mockPlugin as { taskModificationDetector: { checkFileForModifications: Mock } }).taskModificationDetector.checkFileForModifications = vi.fn((fileKey: string) => {
				callOrder.push(`mod:${fileKey}`);
			});
			(mockPlugin as { taskDeletionHandler: { checkFileForDeletedTasks: Mock } }).taskDeletionHandler.checkFileForDeletedTasks = vi.fn((fileKey: string) => {
				callOrder.push(`del:${fileKey}`);
			});

			await service.syncFiles(false);

			// All modifications should come before any deletion
			const modCalls = callOrder.filter(c => c.startsWith('mod:'));
			const delCalls = callOrder.filter(c => c.startsWith('del:'));
			const lastModIndex = callOrder.lastIndexOf(modCalls[modCalls.length - 1]);
			const firstDelIndex = callOrder.indexOf(delCalls[0]);

			expect(lastModIndex).toBeLessThan(firstDelIndex);
		});

		it('should not call deletions if there are no files to sync', async () => {
			(mockPlugin as Record<string, unknown>).fileMetadataService = {
				getAllFileMetadata: vi.fn().mockResolvedValue({}),
				checkForDuplicates: vi.fn().mockResolvedValue({ duplicates: {} }),
				deleteFileMetadata: vi.fn(),
			};

			await service.syncFiles(false);

			expect((mockPlugin as { taskDeletionHandler: { checkFileForDeletedTasks: Mock } }).taskDeletionHandler.checkFileForDeletedTasks).not.toHaveBeenCalled();
		});

		it('should not skip deletions when modifications fail', async () => {
			const filesToSync: Record<string, unknown> = {
				'Projects/ProjectA.md': { defaultProjectId: 'proj-a' },
			};
			(mockPlugin as Record<string, unknown>).fileMetadataService = {
				getAllFileMetadata: vi.fn().mockResolvedValue(filesToSync),
				checkForDuplicates: vi.fn().mockResolvedValue({ duplicates: {} }),
				deleteFileMetadata: vi.fn(),
			};

			// Make modifications throw
			(mockPlugin as { taskModificationDetector: { checkFileForModifications: Mock } }).taskModificationDetector.checkFileForModifications = vi.fn().mockRejectedValue(new Error('mod error'));

			// Should not throw, and deletions should still run
			await expect(service.syncFiles(false)).resolves.not.toThrow();

			expect((mockPlugin as { taskDeletionHandler: { checkFileForDeletedTasks: Mock } }).taskDeletionHandler.checkFileForDeletedTasks).toHaveBeenCalledWith('Projects/ProjectA.md');
		});

		it('should present cleanup modal and delete metadata for files missing from vault when confirmed', async () => {
			const filesToSync: Record<string, unknown> = {
				'Projects/ProjectA.md': { defaultProjectId: 'proj-a' },
				'Projects/Deleted.md': { defaultProjectId: 'proj-b' },
			};
			(mockPlugin as Record<string, unknown>).fileMetadataService = {
				getAllFileMetadata: vi.fn().mockResolvedValue(filesToSync),
				checkForDuplicates: vi.fn().mockResolvedValue({ duplicates: {} }),
				deleteFileMetadata: vi.fn(),
			};
			(mockPlugin as { app: { vault: { getAbstractFileByPath: Mock } } }).app.vault.getAbstractFileByPath = vi.fn((path: string) => {
				return path === 'Projects/ProjectA.md' ? {} : null;
			});
			cleanupModalShowModal.mockResolvedValue(true);

			await service.syncFiles(false);

			expect(cleanupModalShowModal).toHaveBeenCalledTimes(1);
			const fileMetadataService = (mockPlugin as { fileMetadataService: { deleteFileMetadata: Mock } }).fileMetadataService;
			expect(fileMetadataService.deleteFileMetadata).toHaveBeenCalledWith('Projects/Deleted.md');
			expect(fileMetadataService.deleteFileMetadata).not.toHaveBeenCalledWith('Projects/ProjectA.md');
		});

		it('should present cleanup modal but not delete metadata when user declines', async () => {
			const filesToSync: Record<string, unknown> = {
				'Projects/ProjectA.md': { defaultProjectId: 'proj-a' },
				'Projects/Deleted.md': { defaultProjectId: 'proj-b' },
			};
			(mockPlugin as Record<string, unknown>).fileMetadataService = {
				getAllFileMetadata: vi.fn().mockResolvedValue(filesToSync),
				checkForDuplicates: vi.fn().mockResolvedValue({ duplicates: {} }),
				deleteFileMetadata: vi.fn(),
			};
			(mockPlugin as { app: { vault: { getAbstractFileByPath: Mock } } }).app.vault.getAbstractFileByPath = vi.fn((path: string) => {
				return path === 'Projects/ProjectA.md' ? {} : null;
			});
			cleanupModalShowModal.mockResolvedValue(false);

			await service.syncFiles(false);

			expect(cleanupModalShowModal).toHaveBeenCalledTimes(1);
			const fileMetadataService = (mockPlugin as { fileMetadataService: { deleteFileMetadata: Mock } }).fileMetadataService;
			expect(fileMetadataService.deleteFileMetadata).not.toHaveBeenCalled();
		});

		it('should not present cleanup modal when all files exist in vault', async () => {
			const filesToSync: Record<string, unknown> = {
				'Projects/ProjectA.md': { defaultProjectId: 'proj-a' },
			};
			(mockPlugin as Record<string, unknown>).fileMetadataService = {
				getAllFileMetadata: vi.fn().mockResolvedValue(filesToSync),
				checkForDuplicates: vi.fn().mockResolvedValue({ duplicates: {} }),
				deleteFileMetadata: vi.fn(),
			};
			(mockPlugin as { app: { vault: { getAbstractFileByPath: Mock } } }).app.vault.getAbstractFileByPath = vi.fn().mockReturnValue({});

			await service.syncFiles(false);

			expect(cleanupModalShowModal).not.toHaveBeenCalled();
		});
	});
});
