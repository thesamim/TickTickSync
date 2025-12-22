import log from 'loglevel';

/* Use loglevel to do our logging because it keeps the line numbers in the console clickable
*  with sincerest thanks to https://github.com/Mr0grog of https://github.com/pimterry for providing
*  https://github.com/pimterry/loglevel/issues/207*/

const prefix = '[TickTickSync]';

const originalFactory = log.methodFactory;
const timestamper = {
	toString() {
		return `[${window.moment().format('YYYY-MM-DD-HH:mm:ss')}]`;
	}
};
log.methodFactory = function(methodName, logLevel, loggerName) {
	//const levelText = Object.entries(log.levels).find(x => x[1] === logLevel)[0];
	const levelText = methodName;
	const rawMethod = originalFactory(methodName, logLevel, loggerName);

	return rawMethod.bind(console, `${prefix}[${levelText}]%s:`, timestamper);
};
log.rebuild();

export default log;
