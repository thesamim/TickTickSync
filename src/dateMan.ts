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
	dates: date_struct_type[]
}

const due_date_strip_regex = `[${date_emoji.created_date}${date_emoji.scheduled_date}${date_emoji.start_date}${date_emoji.due_date}${date_emoji.done_date}${date_emoji.cancelled_date}]\\s((\\d{4}-\\d{2}-\\d{2})|)(\\d{1,}:\\d{2}|)`;

//objectives:
// 1. get the times
// 2. save the times
// 3. move the dates to the end
// 4. return a properly formatted line
// 5. Return trip too.
export class DateMan {

	/* 	input: a task string
		output: a task string with any non-date content first, times next, dates last.
	*/
	parseDates(inString: string, bAddDates: boolean = false): date_holder_type {
		console.log('We start with: ', inString);
		let dateArray: date_struct_type[] = [];
		for (const [key, value] of Object.entries(date_emoji)) {
			console.log(`${key}: ${value}`);
			// console.log("--", dateEmojiKey, date_emoji[dateEmojiKey]);
			inString = this.extractDates(inString, key, value, dateArray);
		}
		console.log('after : ', inString);
		// console.log("str: ", inString);
		console.log('got: ', dateArray);
		if (bAddDates) {
			if (dateArray.length > 0) {
				dateArray.forEach(dateThing => {
					if (dateThing.time) {
						inString = inString + ' ' + dateThing.emoji + ' ' + dateThing.time;
					}
				});
				dateArray.forEach(dateThing => {
					inString = inString + ' ' + dateThing.emoji + ' ' + dateThing.date;
				});
			}
		}
		//There's only one isAllDay flag in ITask. Check all dates for isAllDay. If any are all day, then
		//set all date
		let bIsAllDay = false;
		dateArray.forEach((dateObjc) =>{
			if (dateObjc.isAllDay) {
				bIsAllDay = true;
			}
		})
		let myDateHolder: date_holder_type = {
			isAllDay: bIsAllDay,
			lineText: inString,
			dates: dateArray
		};
		console.log('returning : ', inString);
		return myDateHolder;

	}

	addDatesToLine(inString: string, task: ITask) : string {

		//createdTime
			//ignoring for now.
		let dateStrings: string[] = []
		let timeStrings: string[] = []
		//startDate
		//If the start date and the due date are equal, we're assuming that it's
		// not a time duration kind of thing and the start date is irrelevant.
		if (task.startDate && task.startDate != task.dueDate) {
			this.buildDateLineComponent(task.startDate, date_emoji.start_date, dateStrings, timeStrings);
		}
		//dueDate
		if (task.dueDate) {
			this.buildDateLineComponent(task.dueDate, date_emoji.due_date, dateStrings, timeStrings);
		}
		//completedTime
		if (task.completedTime) {
			this.buildDateLineComponent(task.completedTime, date_emoji.done_date, dateStrings, timeStrings);
		}

		if (timeStrings && !task.isAllDay) {
			timeStrings.forEach(time => {
				inString += ' ' + time;
			})
			inString += ' ';
		}
		if (dateStrings) {
			dateStrings.forEach(dateString => {
				inString += ' ' + dateString;
			})
			inString += ' ';
		}

		return inString;

	}

	stripDates(inString: string) : string | null {
		let stripRegEx = new RegExp(due_date_strip_regex, 'gmu');
		return inString.replace(stripRegEx, '');
	}
	private buildDateLineComponent(date: string, emoji: string, dateStrings: string[], timeStrings: string[]) {
		let dateTime = this.utcToLocal(date, false);
		let dateComponents = dateTime.split(' ');
		let dateString = emoji + ' ' + dateComponents[0];
		dateStrings.push(dateString);

		let timeString = dateComponents[1];
		if (timeString && timeString != '00:00') {
			timeStrings.push(emoji + ' ' + timeString);
		}
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

	private extractDates(inString: string, dateEmojiKey: string, dateEmojiElement: string, dateArray: date_struct_type[]) {
		const date_regex = `(${dateEmojiElement})\\s(\\d{4}-\\d{2}-\\d{2})\\s*(\\d{1,}:\\d{2})*`;

		let dateData = inString.match(date_regex);
		if (dateData) {
			inString = inString.replace(dateData[0], '');
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
			let dateObj: date_struct_type = {
				dateEmojiKey: {
					emoji: dateData[1],
					date: dateData[2],
					time: dateData[3],
					isAllDay: bIsAllDay,
					isoDate: returnDate
				}
			};
			dateArray.push(dateObj);

		}
		return inString;
	}

}
