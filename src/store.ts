import { writable } from 'svelte/store';
import type { TickTickService } from '@/services';

const service = writable<TickTickService>();
export default { service };
