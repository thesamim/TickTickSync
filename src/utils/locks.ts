//https://gist.github.com/Justin-Credible/693529fa4672a0d97963b95a26897812#file-async-utils-ts
/**
 * A wrapper around setTimeout which returns a promise. Useful for waiting for an amount of
 * time from an async function. e.g. await waitFor(1000);
 *
 * @param milliseconds The amount of time to wait.
 * @returns A promise that resolves once the given number of milliseconds has ellapsed.
 */
export function waitFor(milliseconds: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});
}


/**
 * Used by doWithLock() to keep track of each "stack" of locks for a given lock name.
 */
const locksByName: Record<string, Promise<void>[]> = {};

/**
 * Used to ensure that only a single task for the given lock name can be executed at once.
 * While JS is generally single threaded, this method can be useful when running asynchronous
 * tasks which may interact with external systems (HTTP API calls, React Native plugins, etc)
 * which will cause the main JS thread's event loop to become unblocked. By using the same
 * lock name for a group of tasks you can ensure the only one task will ever be in progress
 * at a given time.
 *
 * @param lockName The name of the lock to be obtained.
 * @param task The task to execute.
 * @returns The value returned by the task.
 */
export async function doWithLock<T>(lockName: string, task: () => Promise<T>): Promise<T> {
	// Ensure array present for the given lock name.
	if (!locksByName[lockName]) {
		locksByName[lockName] = [];
	}

	// Obtain the stack (array) of locks (promises) for the given lock name.
	// The lock at the bottom of the stack (index 0) is for the currently executing task.
	const locks = locksByName[lockName];

	// Determine if this is the first/only task for the given lock name.
	const isFirst = locks.length === 0;

	// Create the lock, which is simply a promise. Obtain the promise's resolve method which
	// we can use to "unlock" the lock, which signals to the next task in line that it can start.

	let unlock = () => {};

	const newLock = new Promise<void>((resolve) => {
		unlock = resolve;
	});

	locks.push(newLock);

	// If this is the first task for a given lock, we can skip this. All other tasks need to wait
	// for the immediately proceeding task to finish executing before continuing.
	if (!isFirst) {
		const predecessorLock = locks[locks.length - 2];
		await predecessorLock;
	}

	// Now that it's our turn, execute the task. We use a finally block here to ensure that we unlock
	// the lock so the next task can start, even if our task throws an error.
	try {
		return await task();
	} catch (error) {
		throw error;
	} finally {
		// Ensure that our lock is removed from the stack.
		locks.splice(0, 1);

		// Invoke unlock to signal to the next waiting task to start.
		unlock();
	}
}
