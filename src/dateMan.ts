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

import { ITask } from './api/types/Task';

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

interface date_struct_type {
	[key: string]: date_time_type;
}

export interface date_holder_type {
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
	parseDates(inString: string): date_holder_type {
		// console.log('parseDates: ', inString);
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
		// console.log('fromTime: ', fromTime, 'toTime: ', toTime);

		for (const [key, value] of Object.entries(date_emoji)) {
			// console.log("--", dateEmojiKey, date_emoji[dateEmojiKey]);
			let dateItem = this.extractDates(inString, value);
			if (dateItem) {
				// console.log(`TRACETHIS: ${key}: ${value}`, dateItem);
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
						} else if (fromTime) {
							timeToUSe = fromTime;
						}
						//they entered a time. Put it back. If they didn't, don't muck with it.
						if (timeToUSe) {
							dateItem.hasATime = true;
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
				// @ts-ignore
				myDateHolder[key] = dateItem;
			}
		}
		// console.log('TRACETHIS parseDates Result: ', myDateHolder);
		return myDateHolder;
	}

	/* 	input: a task string and a Task
		output: a task string

		Called from convertTaskToLine which is called either on Add or Update of a task.
	*/


	//Assume that dateholder is populated by the time we get here.
	addDatesToLine(inString: string, task: ITask, direction: string | null): string {
		// console.log('TRACETHIS Direction: ', direction, 'addDatesToLine - in :', inString, 'and the task DH is: ', task.dateHolder);
		let dateStrings: string[] = [];
		let startDatetimeString: string = '';
		let dueDatetimeString: string = '';
		let dateKeys = null;

		if (task.dateHolder) {
			dateKeys = Object.keys(task.dateHolder);
		} else {
			console.error("No DateHolder found: ", task.dateHolder);
		}

		// if (direction === 'OBSUpdating') {
			if (dateKeys) {
				for (let i = 0; i < dateKeys.length; i++) {
					const thisKey = dateKeys[i];
					if (thisKey == 'isAllDay') {
						continue;
					}
					const thisDate = task.dateHolder[thisKey];
					if (thisDate && thisDate.isoDate) {
						// console.log('TRACETHIS here key is: ', thisKey, thisDate);
						const thisTimeString = this.buildDateLineComponent(thisDate.isoDate, thisDate.emoji, dateStrings);
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
				console.error('Date Holder Keys Not found.');
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
		// 	console.log('TRACETHIS Task was all day! Not going to mess with times.');
		// }

		if (dateStrings) {
			dateStrings.forEach(dateString => {
				inString += ' ' + dateString;
			});
		}
		// console.log('TRACETHIS addDatesToLine - out :', inString);
		return inString;
	}

	//Strip new data representation format is going to be.
	//      and also get the times right.
	stripDatesFromLine(inString: string): string | null {
		let retString;
		// console.log('stripDatesFromLine - in :', inString);
		let datesRegEx = /[➕⏳🛫📅✅❌]\s(\d{4}-\d{2}-\d{2})(\s\d{1,}:\d{2})?/gus;
		retString = inString.replace(datesRegEx, '');
		// console.log('stripDatesFromLine - dates :', retString);
		const times_regex = /\[\s*(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\s*\]/gus;
		retString = retString.replace(times_regex, '');
		// console.log('stripDatesFromLine - out :', retString);
		return retString;
	}

	addDateHolderToTask(task: ITask, oldTask: ITask|undefined) {
		// console.log('addDateStructToTask:', task.title, task.isAllDay, task.dueDate, task.startDate);

		let dates = this.getEmptydateHolder();
		if (!('isAllDay' in task)) {
			//Just a task with no dates.
			// @ts-ignore //we're relatively sure we're always going to get task.
			task.dateHolder = dates;
		} else {
			if ('dueDate' in task) {
				dates.dueDate = this.getDateAndTime(task.dueDate, task.isAllDay, date_emoji.dueDate);
				if (task.dueDate !== task.startDate) {
					//If they're different also save off the startdate because it's a duration.
					if (oldTask) {
						if (oldTask.dateHolder.scheduled_date) {
							//They used scheduled date. put the new start date in scheduled date.
							dates.scheduled_date = this.getDateAndTime(task.startDate, task.isAllDay, date_emoji.scheduled_date);
						} else {
							//They either didn't used to have a start date, or had a start date. put the new start date in scheduled date
							dates.startDate = this.getDateAndTime(task.startDate, task.isAllDay, date_emoji.startDate);
						}
						//pick up the rest of the dates from the old task.

					} else {
						//default to start date.
						//TODO: maybe make it a preference in the future?
						dates.startDate = this.getDateAndTime(task.startDate, task.isAllDay, date_emoji.startDate);
					}
				}
			}
		}
		if (task.completedTime) {
			dates.completedTime = this.getDateAndTime(task.completedTime, task.isAllDay, date_emoji.completedTime);
		}
		//Pick up the times that TickTick doesn't care about, but Obsidian does.
		if (oldTask && oldTask.dateHolder) {
			if ('cancelled_date' in oldTask.dateHolder && oldTask.dateHolder.cancelled_date) {
				dates.cancelled_date = oldTask.dateHolder.cancelled_date;
			}
			if ('createdTime' in oldTask.dateHolder && oldTask.dateHolder.createdTime) {
				dates.createdTime = oldTask.dateHolder.createdTime;
			}

		}
		task.dateHolder = dates;
		// console.log('TRACETHIS addDateHolderToTask:', task.dateHolder);
	}


	//Check all Dates
	areDatesChanged(lineTask: ITask, TickTickTask: ITask): boolean {
		//we're going to be bold and assume that both tasks have dateHolders.
		const editedTaskDates = lineTask.dateHolder;
		const cachedTaskDates = TickTickTask.dateHolder;
		if (!editedTaskDates) {
			// console.error('TRACETHIS edited Task has no dateholder');
			//Did it used to have some kind of date?
			if (cachedTaskDates) {
				const dateKeys = Object.keys(cachedTaskDates);
				if (dateKeys) {
					for (let i = 0; i < dateKeys.length; i++) {
						const thisKey = dateKeys[i];
						if (thisKey == 'isAllDay') {
							continue;
						}
						// @ts-ignore
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
			console.error('TRACETHIS cached Task has no dateholder');
			return true;
		}
		const dateKeys = Object.keys(editedTaskDates);

		if (dateKeys) {

			for (let i = 0; i < dateKeys.length; i++) {
				const thisKey = dateKeys[i];
				if (thisKey == 'isAllDay') {
					continue;
				}
				// @ts-ignore
				if ((editedTaskDates[thisKey]) && !(cachedTaskDates[thisKey])) {
					//they've added a date.
					return true;
				}
				// @ts-ignore
				if (editedTaskDates[thisKey]) {
					const bChanged= this.areDatesDifferent(editedTaskDates[thisKey].isoDate, cachedTaskDates[thisKey].isoDate)
					if (bChanged) {
						return true;
					}
				} if (!editedTaskDates[thisKey] && cachedTaskDates[thisKey]) {
					//they had a date. They removed it. Force change.
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
		const tzoffset = dateTime.getTimezoneOffset();
		const convertedDate = new Date(dateTime.getTime());
		return convertedDate.toISOString().replace(/Z$/, '+0000');
	}

	utcToLocal(utcDateString: string) {
		const date = new Date(utcDateString);
		//Regardless of host date/time format, we want to parse for "en-US" format
		const locale = 'en-US';
		const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const localDate = date.toLocaleString(locale, { timeZone: hostTimeZone });
		//console.log("@@@@ local date string: ", localDate);
		const [datePart, timePart] = localDate.split(', ');
		let [month, day, year] = datePart.split('/');
		month = String(month).padStart(2, '0');
		day = String(day).padStart(2, '0');
		if (timePart) {
			let [hours, minutes] = timePart.split(':');
			if (localDate.includes('PM')) {
				hours = (Number(hours) + 12).toString();
			} else if ((localDate.includes('AM') && hours === '12')) {
				hours = '24';
			}
			hours = String(hours).padStart(2, '0');
			minutes = String(minutes).padStart(2, '0');
			return `${year}-${month}-${day} ${hours}:${minutes}`;
		}

		return `${year}-${month}-${day}`;
	}

	cleanDate(dateString: string) {
		// console.log('Clean Date: ', dateString);
		if (dateString.includes('+-')) {
			dateString = dateString.replace('+-', '-');

			let regex = /(.*)([+-])(\d*)/;
			const matchTime = dateString.match(regex);
			if (matchTime && matchTime[3].length < 4) {
				dateString = matchTime[1] + '-0' + matchTime[3];
			}
		}
		return new Date(dateString);
		;
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

	private getDateAndTime(inDate: string, isAllDay: boolean, emoji: string) {
		let targetDate = this.getEmptyDate();
		targetDate.isoDate = this.formatDateToISO(new Date(inDate));
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
			// console.log('Date component: ' + dateComponents[1] + ' - ' + dateString);
			timeString = dateComponents[1];
		}
		return timeString;
	}

	private extractDates(inString: string, dateEmoji: string) {
		// @ts-ignore
		// console.log("TRACETHIS: ", inString, dateEmoji);
		let dateItem: date_time_type | null = {};
		const date_regex = `(${dateEmoji})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;

		let dateData = inString.match(date_regex);

		if (dateData) {
			// console.log("TRACETHIS extractDates", dateEmoji, dateData);
			let returnDate = null;
			let bhasATime = false;
			if (!dateData[3]) {
				returnDate = `${dateData[2]}T00:00:00.000`;
				bhasATime = false;
			} else {
				if (dateData[3].includes('24:')) {
					dateData[3] = dateData[3].replace('24:', '00:');
				}
				let [hours, minutes] = dateData[3].split(':');
				hours = String(hours).padStart(2, '0');
				minutes = String(minutes).padStart(2, '0');
				returnDate = `${dateData[2]}T${hours}:${minutes}`;
				bhasATime = true;
			}

			returnDate = this.formatDateToISO(new Date(returnDate));
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


	private areDatesDifferent(editedDate: string, cachedDate: string ) {
		const utcDate1 = this.cleanDate(editedDate);
		const utcDate2 = this.cleanDate(cachedDate);

		if (utcDate1.getTime() === utcDate2.getTime()) {
			return false;
		} else {
			// if (this.plugin.settings.debugMode) {
			// 	// Calculate the difference in minutes
			// 	const timeDifferenceInMilliseconds = Math.abs(utcDate2.getTime() - utcDate1.getTime());
			// 	const days = Math.floor(timeDifferenceInMilliseconds / (1000 * 60 * 60 * 24));
			// 	const hours = Math.floor((timeDifferenceInMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			// 	const minutes = Math.floor((timeDifferenceInMilliseconds % (1000 * 60 * 60)) / (1000 * 60));
			//
			// 	if (days > 0) {
			// 		console.log(`The timestamps are ${days} days, ${hours} hours, and ${minutes} minutes apart.`);
			// 	} else if (hours > 0) {
			// 		console.log(`The timestamps are ${hours} hours and ${minutes} minutes apart.`);
			// 	} else if (minutes > 0) {
			// 		console.log(`The timestamps are ${minutes} minutes apart.`);
			// 	} else {
			// 		console.log(`The timestamps are different, but not calculatable..`);
			// 	}
			// }
			return true;
		}
	}
}
