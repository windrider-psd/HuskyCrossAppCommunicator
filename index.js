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
 * @typedef {number} HuskyMessageType
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
 * @enum {HuskyMessageType} 
 */
let MESSAGETYPE = {
    COMMAND: 0,
    RESPONSE: 1,
}


/**
 * @typedef HuskyMessage
 * @property {HuskyMessageType} messageType
 * @property {String} arg
 */

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
 * @property {any} arg
 */

/**
 * @typedef HuskyResponse
 * @property {Number} commandId
 * @property {Number} responseStatus
 * @property {any} arg
 */

/**
 * @typedef ResponseWaitObject
 * @property {Number} id
 * @property {ResponseCallback} callback
 */

/**
 * @callback ResponseCallback
 * @param {Error} error
 * @param {HuskyResponse} response
 * @returns {void}
 */



/**
 * @callback OnCommandCallback
 * @param {HuskyCommand} command 
 * @param {Function} writeResponse
 */

/**
 * @typedef OnCommandWaitObject
 * @property {String} commandPath
 * @property {HuskyOperationType} operationType
 * @property {OnCommandCallback} OnCommandCallback
 */

/**
 * @callback WriteResponseCallback
 * @param {HuskyResponseStatus} responseStatus
 * @param {any} arg
 */

/**
 * @callback OnReadyCallback
 */

class CrossAppCommunicator {
    /**
     * 
     * @param {Number} port 
     */
    constructor(port) {
        this.nextCommandId = 1;
        /**
         * @type {Array.<ResponseWaitObject>}
         */
        this.responseWaitObjects = []

        /**
         * @type {Array.<OnCommandWaitObject>}
         */
        this.onCommandWaitObjects = []

        /**
         * @type {Array.<OnReadyCallback>}
         */
        this.onReadyCallbacks = []

        this.server = new net.Server();
        this.connected = false
        this.server.listen(port, ip.address(), () => {

        })

        this.server.on('connection', (client) => {
            if (this.connected) {
                client.end();
                return
            }
            this.connected = true;
            this.client = client;

            this.client.on('data', (data) => {
                
                let json = String(data);
                /**
                * @type {HuskyMessage}
                */
                let message
                try{
                    message = JSON.parse(json);
                }
                catch(ex)
                {
                    return
                }
                
                if (message.messageType == MESSAGETYPE.RESPONSE) {
                    /**
                     * @type {HuskyResponse}
                     */
                    let response = JSON.parse(message.arg)
                    /**
                     * @type {Array.<ResponseWaitObject>}
                     */
                    let called = []
                    lodash.forEach(this.responseWaitObjects, (w) => {
                        if (w.id == response.commandId) {
                            called.push(w)
                            w.callback(null, response)
                        }
                    })

                    lodash.remove(this.responseWaitObjects, (w) => {
                        return called.includes(w, 0)
                    })
                } else if (message.messageType == MESSAGETYPE.COMMAND) {
                    /**
                     * @type {HuskyCommand}
                     */
                    let command = JSON.parse(message.arg)
                    try
                    {
                        let arg = JSON.parse(command.arg)
                        command.arg = arg;
                    }
                    catch(ex){
                        console.log("ex")
                    }
                    let called = false;
                    lodash.forEach(this.onCommandWaitObjects, (w) => {

                        if (w.commandPath == command.commandPath && w.operationType == command.operationType) {

                            let func = new WriteResponseFunction(command, this);

                            w.OnCommandCallback(command, func.response)

                            called = true;
                        }
                    })
                    if (!called) {
                        /**
                         * @type {HuskyError}
                         */
                        let err = {
                            code: 'NRT',
                            message: "No route"
                        }

                        this.WriteResponse(command.commandId, RESPONSESTATUS.INVALID, err)
                    }

                }
            })

            this.client.on('end', () =>
             {
                this.client.destroy();
                this.client = null;
                this.connected = false;
            })
            this.client.on('timeout', () => {
                this.client.destroy();
                this.client = null;
                this.connected = false;
            })
            this.client.on('error', () => {
                this.client.destroy();
                this.client = null;
                this.connected = false;
            })

            lodash.each(this.onReadyCallbacks, (r) => {
                r();
            })
        })
    }
    /**
     * 
     * @param {String} commandPath 
     * @param {OPERATIONTYPE} operationType 
     * @param {any} arg 
     * @param {ResponseCallback} callback 
     */
    WriteCommand(commandPath, operationType, arg, callback) {
        if (typeof (arg) == "undefined") {
            callback(new Error("arg is undefined"), null)
        } else if (typeof (commandPath) != "string") {
            callback(new Error("commandPath must be a string"), null)
        } else if (typeof (operationType) != "number") {
            callback(new Error("operationType must be a number"), null)
        } else {

            /**
             * @type {String}
             */
            let argParam

            if (typeof (arg) == "object") {
                try {
                    argParam = JSON.stringify(arg);
                } catch (err) {
                    callback(err, null)
                }
            } else {
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
            this.responseWaitObjects.push({
                id: this.nextCommandId,
                callback: callback
            })
            this.nextCommandId++

            /**
             * @type {HuskyMessage}
             */
            let message = {
                arg: JSON.stringify(command),
                messageType: MESSAGETYPE.COMMAND
            }

            this.client.write(JSON.stringify(message))
        }
    }

    /**
     * 
     * @param {String} commandPath 
     * @param {HuskyOperationType} operationType 
     * @param {OnCommandCallback} callback 
     */
    OnCommand(commandPath, operationType, callback) {
        if (typeof (commandPath) != "string") {
            callback(new Error("commandPath must be a string"), null)
        } else if (typeof (operationType) != "number") {
            callback(new Error("operationType must be a number"), null)
        } else {
            /**
             * @type {OnCommandWaitObject}
             */
            let waitObject = {
                commandPath: commandPath,
                operationType: operationType,
                OnCommandCallback: callback
            }

            this.onCommandWaitObjects.push(waitObject);
        }
    }

    /**
     * 
     * @param {Number} commandId 
     * @param {HuskyResponseStatus} responseStatus 
     * @param {any} arg 
     */
    WriteResponse(commandId, responseStatus, arg) {

        /**
         * @type {String}
         */
        let argParam

        if (typeof (arg) == "object") {
            argParam = JSON.stringify(arg);
        } else {
            argParam = String(arg)
        }

        /**
         * @type {HuskyResponse}
         */
        let response = {
            arg: argParam,
            commandId: commandId,
            responseStatus: responseStatus
        }

        /**
         * @type {HuskyMessage}
         */
        let message = {
            arg: JSON.stringify(response),
            messageType: MESSAGETYPE.RESPONSE
        }
        this.client.write(JSON.stringify(message))
    }

    /**
     * 
     * @param {OnReadyCallback} callback 
     */
    OnReady(callback) {
        this.onReadyCallbacks.push(callback)
        if (this.connected) {
            callback();
        }
    }
}


class WriteResponseFunction {
    /**
     * 
     * @param {HuskyCommand} command 
     * @param {CrossAppCommunicator} server 
     */
    constructor(command, server) {
        this.command = command;

        /**
         * @type {WriteResponseCallback}
         */
        this.response = (responseStatus, arg) => {
            server.WriteResponse(this.command.commandId, responseStatus, arg);
        }
    }
}

module.exports = {
    OPERATIONTYPE: OPERATIONTYPE,
    RESPONSESTATUS: RESPONSESTATUS,
    MESSAGETYPE: MESSAGETYPE,
    CrossAppCommunicator: CrossAppCommunicator
}