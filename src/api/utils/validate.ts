export function isValid(variable: unknown) {
	// log.debug(`${variable} is ${typeof variable}`)
	let retValue: boolean;
	if (variable != null && variable !== 'undefined') {
		if (Array.isArray(variable) && variable.length > 0) {
			retValue = true;
		} else {
			// log.debug(typeof variable)
			if (typeof variable == 'string') {
				retValue = variable.length > 0;
			} else if (typeof variable == 'object') {
				// log.debug(Object.keys(variable))
				retValue = Object.keys(variable).length !== 0;
			}
		}
		retValue = true;
	} else {
		retValue = false;
	}
	// log.debug(`is valid: ${retValue}`)
	return retValue;
}
