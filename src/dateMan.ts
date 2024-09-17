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
	created_date = '➕',
	scheduled_date = '⏳',
	start_date = '🛫',
	due_date = '📅',
	done_date = '✅',
	cancelled_date = '❌'
};

interface date_time_type {
	isAllDay: boolean,
	date: string,
	time: string,
	isoDate: string,
	emoji: string
}

interface date_struct_type {
	[key: string]: date_time_type;
}

export interface date_holder_type {
	isAllDay: boolean,
	lineText: string,
	created_date: date_time_type|null,
	scheduled_date:date_time_type|null,
	start_date:date_time_type|null,
	due_date:date_time_type|null,
	done_date:date_time_type|null,
	cancelled_date:date_time_type|null
}

const date_strip_regex = `[${date_emoji.created_date}${date_emoji.scheduled_date}${date_emoji.start_date}${date_emoji.due_date}${date_emoji.done_date}${date_emoji.cancelled_date}]\\s((\\d{4}-\\d{2}-\\d{2})|)(\\d{1,}:\\d{2}|)`;

//objectives:
// 1. get the times
// 2. save the times
// 3. move the dates to the end
// 4. return a properly formatted line
// 5. Return trip too.
export class DateMan {

	/* 	input: a task string
		output: a dateholer struct

		Called when a task is being examined for changes, or ready for update.
	*/
	//TODO: parse for whatever the new date format is going to be.
	parseDates(inString: string): date_holder_type {
		console.log('parseDates: ', inString);
		let myDateHolder: date_holder_type = {
			cancelled_date: null,
			created_date: null,
			done_date: null,
			due_date: null,
			scheduled_date: null,
			start_date: null,
			isAllDay: false, lineText: inString};
		for (const [key, value] of Object.entries(date_emoji)) {
			console.log(`${key}: ${value}`);
			// console.log("--", dateEmojiKey, date_emoji[dateEmojiKey]);
			let dateItem = this.extractDates(inString, value);
			if (dateItem) {
				//If ANY of the dates have an isAllDay of false (ie: there's a time element)
				//      Then the whole task is considered to be NOT allDay.
				myDateHolder.isAllDay = dateItem.isAllDay;
				// @ts-ignore
				myDateHolder[key] = dateItem;
			}
		}
		console.log('parseDates Result: ', myDateHolder);
		//TODO: Adding a date logic, but should go elsewhere
		// if (bAddDates) {
		// 	if (dateStruct.length > 0) {
		// 		dateStruct.forEach(dateThing => {
		// 			if (dateThing.time) {
		// 				inString = inString + ' ' + dateThing.emoji + ' ' + dateThing.time;
		// 			}
		// 		});
		// 		dateStruct.forEach(dateThing => {
		// 			inString = inString + ' ' + dateThing.emoji + ' ' + dateThing.date;
		// 		});
		// 	}
		// }



		return myDateHolder;

	}

	/* 	input: a task string and a Task
		output: a task string

		Called from convertTaskToLine
	*/

	//todo: Add whatever the new data representation format is going to be.
	addDatesToLine(inString: string, task: ITask) : string {
		console.log("addDatesToLine - in :", inString);
		let dateStrings: string[] = []
		let startDatetimeString: string = '';
		let dueDatetimeString: string = '';
		let completedDatetimeString: string = '';
		//startDate
		//If the start date and the due date are equal, we're assuming that it's
		// not a time duration kind of thing and the start date is irrelevant.
		if (task.startDate && task.startDate != task.dueDate) {
			startDatetimeString = this.buildDateLineComponent(task.startDate, date_emoji.start_date, dateStrings);
		}
		//dueDate
		if (task.dueDate) {
			dueDatetimeString = this.buildDateLineComponent(task.dueDate, date_emoji.due_date,  dateStrings);
		}
		//completedTime
		if (task.completedTime) {
			completedDatetimeString = this.buildDateLineComponent(task.completedTime, date_emoji.done_date,  dateStrings);
		}

		if (!task.isAllDay) {
			let startOfTask = inString.indexOf("]", 0) ; //assume the first ] is where we want to start adding stuff.
			startOfTask = startOfTask + 1;
			if (startDatetimeString != '') {
				inString = inString.substring( 0 , startOfTask) + ' [Start Time: ' + startDatetimeString + ' ]' + inString.substring(startOfTask);
			}
			if (dueDatetimeString != '') {
				let endOfStartTime = inString.indexOf("]", startOfTask + 1); // Assume that the next ] is after start time.
				endOfStartTime = endOfStartTime + 1;
				inString = inString.substring( 0 , endOfStartTime) + '-[End Time: ' + dueDatetimeString + ' ]' + inString.substring(endOfStartTime);
			}
		}
		if (dateStrings) {
			dateStrings.forEach(dateString => {
				inString += ' ' + dateString;
			})
		}
		console.log("addDatesToLine - out :", inString);
		return inString;

	}

	//todo: strip whatever the new data representation format is going to be.
	stripDatesFromLine(inString: string) : string | null {
		console.log("stripDatesFromLine - in :", inString);
		let stripRegEx = new RegExp(date_strip_regex, 'gmu');
		const retString = inString.replace(stripRegEx, '');
		console.log("stripDatesFromLine - out :", retString);
		return retString
	}

	private buildDateLineComponent(date: string, emoji: string, dateStrings: string[]) {
		let dateTime = this.utcToLocal(date, false);
		let timeString: string = '';
		let dateComponents = dateTime.split(' ');
		let dateString = emoji + ' ' + dateComponents[0];
		dateStrings.push(dateString);

		if (dateComponents[1]) {
			console.log("Date Compent: " + dateComponents[1] + " - " + dateString);
			timeString = dateComponents[1];
		}
		return timeString;
	}

	//Format date to TickTick Accepted date.
	formatDateToISO(dateTime: Date) {
		// Check if the input is a valid date
		if (isNaN(dateTime.getTime())) {
			return 'Invalid Date';
		}
		const tzoffset = dateTime.getTimezoneOffset();
		const convertedDate = new Date(dateTime.getTime());
		const result = convertedDate.toISOString().replace(/Z$/, '+0000');
		return result;
	}

	utcToLocal(utcDateString: string, bIsAllDay: boolean) {
		const date = new Date(utcDateString);
		//Regardless of host date/time format, we want to parse for "en-US" format
		const locale = "en-US";
		const hostTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
		const localDate = date.toLocaleString(locale, {timeZone: hostTimeZone});
		//console.log("@@@@ local date string: ", localDate);
		const [datePart, timePart] = localDate.split(', ');
		let [month, day, year] = datePart.split('/');
		month = String(month).padStart(2, '0');
		day = String(day).padStart(2, '0');
		let [hours, minutes] = timePart.split(':');
		if (localDate.includes('PM')) {
			hours = (Number(hours) + 12).toString();
		} else if ((localDate.includes('AM') && hours === '12')) {
			hours = '24';
		}
		hours = String(hours).padStart(2, '0');
		minutes = String(minutes).padStart(2, '0');
		if (!bIsAllDay) {
			return `${year}-${month}-${day} ${hours}:${minutes}`;
		} else {
			return `${year}-${month}-${day}`;
		}

	}

	private extractDates(inString: string, dateEmoji: string) {
		// @ts-ignore
		let dateItem: date_time_type|null = {};
		const date_regex = `(${dateEmoji})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;

		let dateData = inString.match(date_regex);
		if (dateData) {
			let returnDate = null;
			let bIsAllDay = false;
			if (!dateData[3]) {
				returnDate = `${dateData[2]}T00:00:00.000`;
				bIsAllDay = true;
			} else {
				if (dateData[3].includes('24:')) {
					dateData[3] = dateData[3].replace('24:', '00:');
				}
				returnDate = `${dateData[2]}T${dateData[3]}`;
				bIsAllDay = false;
			}
			returnDate = this.formatDateToISO(new Date(returnDate));
			dateItem = {
				isAllDay: bIsAllDay,
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

}
