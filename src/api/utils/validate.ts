
export function isValid(variable: any)
{
    // console.log(`${variable} is ${typeof variable}`)
    let retValue = false;
    if (variable != null && variable !== 'undefined') {
        if (Array.isArray(variable) && variable.length > 0) {
            retValue = true;
        } else {
            // console.log(typeof variable)
            if (typeof variable == 'string') {
                retValue = variable.length > 0;
            } else if (typeof variable == 'object') {
                // console.log(Object.keys(variable))
                retValue = Object.keys(variable).length !== 0;
            }
        }
        retValue = true;
    } else {
        retValue = false;
    }
    // console.log(`is valid: ${retValue}`)
    return retValue;
}