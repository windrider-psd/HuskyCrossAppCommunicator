let net = require('net');
let ip = require('ip')
let lodash = require('lodash')

/**
 * @typedef {number} HuskyOperationType
**/
/**
 * @typedef {number} HuskyResponseStatus
**/


/**
 * @enum {HuskyOperationType} 
 */
let OPERATIONTYPE = {
    READ: 0,
    WRITE: 1
}

/**
 * @enum {HuskyResponseStatus} 
 */
let RESPONSESTATUS = {
    OK: 0,
    INVALID: 1,
    ERROR: 2
}

/**
 * @typedef HuskyError
 * @property {String} code
 * @property {String} message
 */

/**
 * @typedef HuskyCommand
 * @property {Number} commandId
 * @property {String} commandPath
 * @property {Number} operationType
 * @property {String} arg
*/

/**
 * @typedef HuskyResponse
 * @property {Number} commandId
 * @property {Number} responseStatus
 * @property {any} arg
 */

/**
 * @typedef WaitObject
 * @property {Number} id
 * @property {WriteCallback} callback
 */

/**
 * @callback WriteCallback
 * @param {Error} error
 * @param {HuskyResponse} response
 * @returns {void}
 */


/**
 * 
 */
class CrossAppCommunicator {
    /**
     * 
     * @param {Number} port 
     */
    constructor(port) {
        this.nextCommandId = 1;
        /**
         * @type {Array.<WaitObject>}
         */
        this.waitObjects = []

        this.client = new net.Socket();
        this.conntected = false
        this.client.connect(port, ip.address(), () => {

        })

        this.client.on('connect', () => {
            this.conntected = true
        })


        this.client.on('data', (data) => {
            let json = String(data);
            /**
             * @type {HuskyResponse}
             */
            let response = JSON.parse(json);

            /**
             * @type {Array.<WaitObject>}
             */
            let called = []
            lodash.forEach(this.waitObjects, (w) => {
                if (w.id == response.commandId) {
                    called.push(w)
                    w.callback(null, response)
                }
            })

            lodash.remove(this.waitObjects, (w) => {
                return called.includes(w, 0)
            })
        })
    }
    /**
     * 
     * @param {String} commandPath 
     * @param {OPERATIONTYPE} operationType 
     * @param {any} arg 
     * @param {WriteCallback} callback 
     */
    WriteCommand(commandPath, operationType, arg, callback) {

        if (typeof (arg) == "undefined") {
            callback(new Error("arg is undefined"), null)
        }
        else if (typeof (commandPath) != "string") {
            callback(new Error("commandPath must be a string"), null)
        }
        else if (typeof (operationType) != "number") {
            callback(new Error("operationType must be a number"), null)
        }
        else {

            /**
             * @type {String}
             */
            let argParam

            if (typeof (arg) == "object") {
                try {
                    argParam = JSON.stringify(arg);
                }
                catch (err) {
                    callback(err, null)
                }
            }
            else {
                argParam = String(arg)
            }

            /**
             * @type {HuskyCommand}
             */
            let command = {
                arg: argParam,
                commandId: this.nextCommandId,
                commandPath: commandPath,
                operationType: operationType
            }
            this.waitObjects.push({ id: this.nextCommandId, callback: callback })
            this.nextCommandId++
            this.client.write(JSON.stringify(command))
        }
    }
}


module.exports = {
    OPERATIONTYPE: OPERATIONTYPE,
    RESPONSESTATUS: RESPONSESTATUS,
    CrossAppCommunicator: CrossAppCommunicator
}