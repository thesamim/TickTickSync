//From https://publish.obsidian.md/tasks/Reference/Task+Formats/Tasks+Emoji+Format
//
// interface date_emoji_type {
// 	created_date: string,
// 	scheduled_date: string,
// 	start_date: string,
// 	due_date: string,
// 	done_date: string,
// 	cancelled_date: string
// }
//
// https://forum.obsidian.md/t/task-time-editing-ux-ui-advice/86124/2?u=thesamim
import type { ITask } from './api/types/Task';
import log from '@/utils/logger';

enum date_emoji {
	createdTime = '➕',
	scheduled_date = '⏳',
	startDate = '🛫',
	dueDate = '📅',
	completedTime = '✅',
	cancelled_date = '❌'
}

interface date_time_type {
	hasATime: boolean,
	date: string | null,
	time: string | null,
	isoDate: string | null,
	emoji: string | null
}

export interface date_holder_type {
	[key: string]: date_time_type | boolean | null;
	isAllDay: boolean,
	createdTime: date_time_type | null,
	scheduled_date: date_time_type | null,
	startDate: date_time_type | null,
	dueDate: date_time_type | null,
	completedTime: date_time_type | null,
	cancelled_date: date_time_type | null
}


//objectives:
// 1. get the times
// 2. save the times
// 3. move the dates to the end
// 4. return a properly formatted line
// 5. Return trip too.
export class DateMan {

	/* 	input: a task string
		output: a dateholer struct
		Called when a task is being examined for changes, or ready for update. (Called from convertLineToTask.)
	*/
	parseDates(inString: string, timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone): date_holder_type {
		// log.debug('parseDates: ', inString);
		let myDateHolder = this.getEmptydateHolder();

		//look for times at the beginning of the line and save them.
		const times_regex = '\\[\\s*(\\d{1,2}:\\d{2})(?:\\s*-\\s*(\\d{1,2}:\\d{2}))?\\s*\\]';

		const regEx = new RegExp(times_regex, 'i');
		const times = inString.match(regEx);
		let fromTime;
		let toTime;
		if (times) {
			fromTime = times[1];
			toTime = times[2];
		}
		// log.debug('fromTime: ', fromTime, 'toTime: ', toTime);

		for (const [key, value] of Object.entries(date_emoji)) {
			// log.debug("--", dateEmojiKey, date_emoji[dateEmojiKey]);
			let dateItem = this.extractDates(key, inString, value, timeZone);
			if (dateItem) {
				if ((key == 'scheduled_date') || (key == 'startDate')) {
					if ((fromTime) && (!dateItem.hasATime)) {
						//they entered a time. Put it back. Assume either scheduled OR start date are populated.
						//Hopefully not both.
						dateItem.hasATime = true;
						dateItem.time = fromTime;
						const newDate = `${dateItem.date}T${fromTime}`;
						dateItem.isoDate = this.formatDateToISO(new Date(newDate));
					}
				}
				if (key == 'dueDate') {
					if (!dateItem.hasATime) {
						let timeToUSe = '';
						if ((fromTime) && (toTime)) {
							timeToUSe = toTime;
							dateItem.hasATime = true;
						} else if (fromTime) {
							timeToUSe = fromTime;
							dateItem.hasATime = true;
						}
						//they entered a time. Put it back. If they didn't, don't muck with it.
						if (timeToUSe) {
							dateItem.time = timeToUSe;
							const newDate = `${dateItem.date}T${timeToUSe}`;
							dateItem.isoDate = this.formatDateToISO(new Date(newDate));
						}
					}
				}
				//If any date has a time, then it's not an all day Task.
				if (dateItem.hasATime) {
					myDateHolder.isAllDay = !dateItem.hasATime;
				}
				myDateHolder[key] = dateItem;
			}
		}
		return myDateHolder;
	}

	/* 	input: a task string and a Task
		output: a task string

		Called from convertTaskToLine which is called either on Add or Update of a task.
	*/


	//Assume that dateholder is populated by the time we get here.
	addDatesToLine(inString: string, task: ITask): string {

		let dateStrings: string[] = [];
		let startDatetimeString: string = '';
		let dueDatetimeString: string = '';
		let dateKeys = null;

		if (task.dateHolder) {
			dateKeys = Object.keys(task.dateHolder);
		} else {
			log.warn('No DateHolder found: ', task.dateHolder);
			//Task probably added to a file after a move, with no dates.
			task.dateHolder = this.getEmptydateHolder();
		}

		// if (direction === 'OBSUpdating') {
		if (dateKeys) {
			for (let i = 0; i < dateKeys.length; i++) {
				const thisKey = dateKeys[i];
				if (thisKey == 'isAllDay') {
					continue;
				}
				const thisDate = task.dateHolder[thisKey] as date_time_type | null;
				if (thisDate && thisDate.isoDate) {

					const thisTimeString = this.buildDateLineComponent(thisDate.isoDate, thisDate.emoji ?? '', dateStrings);
					switch (thisKey) {
						case 'scheduled_date':
						case 'startDate':
							//It's going to be one or the other, and we don't care.
							startDatetimeString = thisTimeString;
							break;
						case 'dueDate':
							dueDatetimeString = thisTimeString;
							break;
					}
				}
			}
		} else {
			log.error('Date Holder Keys Not found.');
		}

		if (!task.isAllDay) {
			let startOfTask = inString.indexOf(']', 0); //assume the first ] is where we want to start adding stuff.
			startOfTask = startOfTask + 1;
			if ((startDatetimeString != '') && (dueDatetimeString != '')) {
				// [start time - due time]]
				inString = inString.substring(0, startOfTask) + ' [' + startDatetimeString + ' - ' + dueDatetimeString + '] ' + inString.substring(startOfTask);
			} else if (startDatetimeString != '') {
				// [start time]
				inString = inString.substring(0, startOfTask) + ' [' + startDatetimeString + ']' + inString.substring(startOfTask);
			} else if (dueDatetimeString != '') {
				// [end time]
				inString = inString.substring(0, startOfTask) + ' [' + dueDatetimeString + ']' + inString.substring(startOfTask);
			}
		}
		// else {

		// }

		if (dateStrings) {
			dateStrings.forEach(dateString => {
				inString += ' ' + dateString;
			});
		}

		return inString;
	}

	//Strip new data representation format is going to be.
	//      and also get the times right.
	stripDatesFromLine(inString: string): string | null {
		let retString;
		// log.debug('stripDatesFromLine - in :', inString);
		let datesRegEx = /[➕⏳🛫📅✅❌]\s(\d{4}-\d{2}-\d{2})(\s\d{1,}:\d{2})?/gus;
		retString = inString.replace(datesRegEx, '');
		// log.debug('stripDatesFromLine - dates :', retString);
		const times_regex = /\[\s*(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\s*\]/gus;
		retString = retString.replace(times_regex, '');
		// log.debug('stripDatesFromLine - out :', retString);
		return retString;
	}

	addDateHolderToTask(task: ITask, oldTask: ITask | undefined) {
		// log.debug('addDateStructToTask:', task.title, task.isAllDay, task.dueDate, task.startDate);

		let dates = this.getEmptydateHolder();
		if (!('isAllDay' in task)) {
			//Just a task with no dates.
			(task as { dateHolder: date_holder_type }).dateHolder = dates;
		} else {
			const dueDate = this.getDateAndTime(task.dueDate, task.isAllDay, date_emoji.dueDate);
			if (dueDate) {
				dates.dueDate = dueDate;
			}
			// TickTick may report empty/null dates for a task that simply has
			// no date (e.g. a completed task without a due date). Guard against
			// them -- getDateAndTime returns null for anything empty or invalid,
			// so an "empty" date can never masquerade as a real one (that used
			// to surface as 1970-01-01 / 'Invalid Date' and made the plugin
			// think a date changed on the pull-write-reparse round trip, which
			// pushed a task update back to TickTick and reset the completion
			// date -- issue #209).
			if (task.startDate && task.startDate !== task.dueDate) {
				//If they're different also save off the startdate because it's a duration.
				const startDate = this.getDateAndTime(task.startDate, task.isAllDay, date_emoji.startDate);
				if (startDate) {
					dates.startDate = startDate;
				}
			}
		}
		if (task.completedTime) {
			const completedTime = this.getDateAndTime(task.completedTime, false, date_emoji.completedTime);
			if (completedTime) {
				dates.completedTime = completedTime;
			}
		}
		//Pick up the times that TickTick doesn't care about, but Obsidian does.
		if (oldTask && oldTask.dateHolder) {
			if (oldTask.dateHolder.cancelled_date) {
				dates.cancelled_date = oldTask.dateHolder.cancelled_date;
			}
			if (oldTask.dateHolder.createdTime) {
				dates.createdTime = oldTask.dateHolder.createdTime;
			}
			if (oldTask.dateHolder.scheduled_date) {
				dates.scheduled_date = oldTask.dateHolder.scheduled_date;
			}
		}
		task.dateHolder = dates;

	}


	//Check all Dates
	areDatesChanged(lineTask: ITask, TickTickTask: ITask): boolean {
		//we're going to be bold and assume that both tasks have dateHolders.
		const editedTaskDates = lineTask.dateHolder;
		const cachedTaskDates = TickTickTask.dateHolder;
		if (!editedTaskDates) {
			log.error('Edited Task has no dateholder');
			//Did it used to have some kind of date?
			if (cachedTaskDates) {
				const dateKeys = Object.keys(cachedTaskDates);
				if (dateKeys) {
					for (let i = 0; i < dateKeys.length; i++) {
						const thisKey = dateKeys[i];
						if (thisKey == 'isAllDay') {
							continue;
						}
						if (cachedTaskDates[thisKey]) {
							//There was a date, they removed it.
							return true;
						}
					}
				}

			}
			//nothing's changed.
			return false;
		}
		if (!cachedTaskDates) {
			log.error('Cached Task has no dateholder');
			return true;
		}
		const dateKeys = Object.keys(editedTaskDates);

			if (dateKeys) {

			for (let i = 0; i < dateKeys.length; i++) {
				const thisKey = dateKeys[i];
				if (thisKey == 'isAllDay') {
					continue;
				}
				const editedDate = editedTaskDates[thisKey] as date_time_type | null;
				const cachedDate = cachedTaskDates[thisKey] as date_time_type | null;
				if (editedDate && !cachedDate) {
					return true;
				}
				if (editedDate) {
					let bChanged = false;
					if (editedDate.hasATime) {
						bChanged = this.areDatesDifferent(editedDate.isoDate ?? '', cachedDate!.isoDate ?? '');
					} else {
						bChanged = !(editedDate.date == cachedDate?.date);
					}
					if (bChanged) {
						log.debug('dateChanged', {
							key: thisKey,
							newDate: editedDate.isoDate,
							oldDate: cachedDate!.isoDate
						});
						return true;
					}
				}
				if (!editedDate && cachedDate) {
					return true;
				}
			}
		}

		//we're here, nothing's changed.
		return false;
	}

	//Format date to TickTick Accepted date.
	formatDateToISO(dateTime: Date) {
		// Check if the input is a valid date
		if (isNaN(dateTime.getTime())) {
			return 'Invalid Date';
		}
		const convertedDate = new Date(dateTime.getTime());
		return convertedDate.toISOString().replace(/Z$/, '+0000');
	}

	// Compute the UTC instant that corresponds to midnight of `dateString`
	// (YYYY-MM-DD) in the given IANA `timeZone`. Needed for all-day dates:
	// TickTick interprets an all-day task's date-only value relative to the
	// task's own timeZone field, not UTC, so a literal UTC midnight is only
	// correct for UTC-zone users -- everyone west of UTC would see the date
	// roll back a day. Uses the standard Intl.DateTimeFormat offset trick
	// since JS Date has no built-in IANA zone support.
	zonedMidnightToUTC(dateString: string, timeZone: string): Date {
		const naiveUTC = new Date(`${dateString}T00:00:00.000Z`);
		const dtf = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric', month: '2-digit', day: '2-digit',
			hour: '2-digit', minute: '2-digit', second: '2-digit'
		});
		const parts: Record<string, string> = {};
		for (const part of dtf.formatToParts(naiveUTC)) {
			parts[part.type] = part.value;
		}
		// What UTC instant would produce these same wall-clock digits?
		// The difference between that and naiveUTC is timeZone's offset
		// at this instant (DST-aware, since we evaluated at naiveUTC).
		const asIfUTC = Date.UTC(
			Number(parts.year), Number(parts.month) - 1, Number(parts.day),
			Number(parts.hour), Number(parts.minute), Number(parts.second)
		);
		const offsetMs = asIfUTC - naiveUTC.getTime();
		return new Date(naiveUTC.getTime() - offsetMs);
	}

	utcToLocal(utcDateString: string) {
		const date = new Date(utcDateString);
		//Regardless of host date/time format, we want to parse for "en-US" format
		const locale = 'en-US';
		const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const localDate = date.toLocaleString(locale, { timeZone: hostTimeZone });
		const [datePart, timePart] = localDate.split(', ');
		let [month, day, year] = datePart.split('/');
		month = String(month).padStart(2, '0');
		day = String(day).padStart(2, '0');
		if (timePart) {
			let [hours, minutes] = timePart.split(':');
			if (localDate.includes('PM' ) && hours !== '12') {
				hours = (Number(hours) + 12).toString();
			} else if ((localDate.includes('AM') && hours === '12')) {
				//TODO: Should we add one to the day, or do they really mean beginning of the day?
				hours = '00';
			}
			hours = String(hours).padStart(2, '0');
			minutes = String(minutes).padStart(2, '0');
			return `${year}-${month}-${day} ${hours}:${minutes}`;
		}

		return `${year}-${month}-${day}`;
	}

	cleanDate(dateString: string) {
		// log.debug('Clean Date: ', dateString);
		if (dateString.includes('+-')) {
			dateString = dateString.replace('+-', '-');

			let regex = /(.*)([+-])(\d*)/;
			const matchTime = dateString.match(regex);
			if (matchTime && matchTime[3].length < 4) {
				dateString = matchTime[1] + '-0' + matchTime[3];
			}
		}
		return new Date(dateString);
	}

	getEmptydateHolder() {
		let myDateHolder: date_holder_type = {
			cancelled_date: null,
			createdTime: null,
			completedTime: null,
			dueDate: null,
			scheduled_date: null,
			startDate: null,
			isAllDay: true //Assume dates don't have times until proven otherwise.
		};
		return myDateHolder;
	}

	getEmptyDate() {
		let myDateHolder: date_time_type = {
			hasATime: false,
			date: null,
			time: null,
			isoDate: null,
			emoji: null
		};
		return myDateHolder;
	}

	private getDateAndTime(inDate: string, isAllDay: boolean, emoji: string): date_time_type | null {
		if (!inDate) {
			//Empty or absent date -- never manufacture a real date from it.
			//A null input parses as the unix epoch and an empty string as
			//'Invalid Date' otherwise, both of which then masquerade as a real
			//date on the next comparison.
			return null;
		}
		const parsedDate = new Date(inDate);
		if (isNaN(parsedDate.getTime())) {
			log.warn('getDateAndTime: ignoring invalid date', inDate);
			return null;
		}
		let targetDate = this.getEmptyDate();
		targetDate.isoDate = this.formatDateToISO(parsedDate);
		let localDate = this.utcToLocal(inDate);
		const splitDates = localDate.split(' ');
		targetDate.date = splitDates[0];
		if (splitDates[1]) {
			targetDate.time = splitDates[1];
		} else {
			targetDate.time = '';
		}
		//trust TickTick, or whoever called this....
		//isAllDay == true means no times come into play. We want to keep track of times only when isAllDay == false
		targetDate.hasATime = !isAllDay;
		targetDate.emoji = emoji;
		return targetDate;
	}

	private buildDateLineComponent(date: string, emoji: string, dateStrings: string[]) {
		let dateTime = this.utcToLocal(date);
		let timeString: string = '';
		let dateComponents = dateTime.split(' ');
		let dateString = emoji + ' ' + dateComponents[0];
		dateStrings.push(dateString);

		if (dateComponents[1]) {
			// log.debug('Date component: ' + dateComponents[1] + ' - ' + dateString);
			timeString = dateComponents[1];
		}
		return timeString;
	}

	private extractDates(key: string, inString: string, dateEmoji: date_emoji, timeZone: string) {

		let dateItem: date_time_type | null = null;
		const date_regex = `(${dateEmoji})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;

		let dateData = inString.match(date_regex);

		if (dateData) {
			let returnDate: string;
			let bhasATime = false;
			if (!dateData[3]) {
				// TickTick interprets an all-day task's dueDate relative to
				// the task's own timeZone field, not UTC -- confirmed live
				// (#366 follow-up, 2026-07-27): a naive UTC midnight showed
				// up a day early in TickTick's own UI for a UTC-negative
				// host. Compute the actual UTC instant that corresponds to
				// midnight of this date in `timeZone`, so it round-trips as
				// the same calendar day in TickTick's UI regardless of host
				// OS timezone.
				bhasATime = false;
				returnDate = this.formatDateToISO(this.zonedMidnightToUTC(dateData[2], timeZone));
			} else {
				if (dateData[3].includes('24:')) {
					dateData[3] = dateData[3].replace('24:', '00:');
				}
				let [hours, minutes] = dateData[3].split(':');
				hours = String(hours).padStart(2, '0');
				minutes = String(minutes).padStart(2, '0');
				bhasATime = true;
				returnDate = this.formatDateToISO(new Date(`${dateData[2]}T${hours}:${minutes}`));
			}

			dateItem = {
				hasATime: bhasATime,
				date: dateData[2],
				time: dateData[3],
				isoDate: returnDate,
				emoji: dateData[1]
			};
		} else {
			dateItem = null;
		}
		return dateItem;
	}


	private areDatesDifferent(editedDate: string, cachedDate: string) {
		const utcDate1 = this.cleanDate(editedDate);
		const utcDate2 = this.cleanDate(cachedDate);

		if (utcDate1.getTime() === utcDate2.getTime()) {
			return false;
		} else {
			return true;
			// if (this.plugin.settings.debugMode) {
			// 	// Calculate the difference in minutes
			// 	const timeDifferenceInMilliseconds = Math.abs(utcDate2.getTime() - utcDate1.getTime());
			// 	const days = Math.floor(timeDifferenceInMilliseconds / (1000 * 60 * 60 * 24));
			// 	const hours = Math.floor((timeDifferenceInMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			// 	const minutes = Math.floor((timeDifferenceInMilliseconds % (1000 * 60 * 60)) / (1000 * 60));
			//
			// 	if (days > 0) {
			// 		log.debug(`The timestamps are ${days} days, ${hours} hours, and ${minutes} minutes apart.`);
			// 	} else if (hours > 0) {
			// 		log.debug(`The timestamps are ${hours} hours and ${minutes} minutes apart.`);
			// 	} else if (minutes > 0) {
			// 		log.debug(`The timestamps are ${minutes} minutes apart.`);
			// 	} else {
			// 		log.debug(`The timestamps are different, but not calculatable..`);
			// 	}
			// }
		}
	}
}
