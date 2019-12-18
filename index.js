let net = require('net');
let ip = require('ip')
let lodash = require('lodash')
let mosca = require('mosca')

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
 * @property {any} args
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

        this.connected = false


        let moscaSettings = {
            port: port,
        }
        this.mosca = new mosca.Server(moscaSettings);

        let authenticate = function (client, username, password, callback) {
            let authorized = this.client == null;
            callback(null, authorized);
        }

        this.mosca.on('ready', () => {
            this.mosca.authenticate = authenticate
        })

        this.subResponse = false;
        this.subCommand = false;
        /**
         * @type {mosca.Client}
         */
        this.client = null
        this.readyBefore = null;
        this.mosca.on('clientConnected', (client) => {
            console.log("A client has connected");
            this.client = client
        })
        this.mosca.on('clientDisconnected', () => {
            console.log("A client has disconnected")
            this.subResponse = false;
            this.subCommand = false;
            this.client = null
        })
        this.mosca.on('published', (packet, client) => {
            try {
                let topicSplit = packet.topic.split('/');
                if (topicSplit[2] == 'new' && topicSplit[3] == 'subscribes') {
                    let obj = JSON.parse(packet.payload);

                    if (obj.topic == `java/command`) {
                        this.subCommand = true;
                    }
                    if (obj.topic == `java/response`) {
                        this.subResponse = true;
                    }
                    if (this.subCommand && this.subCommand) {
                        
                        if(this.readyBefore == null)
                        {
                            this.readyBefore = false;
                        }
                        else if(this.readyBefore == false)
                        {
                            this.readyBefore = true;
                        }

                        lodash.each(this.onReadyCallbacks, (r) => {
                            r();
                        })
                    }
                }
            } catch (ex) {
                console.log(ex);
            }

            let json = String(packet.payload);
            let toAgent = packet.topic.split('/')[0];
            /*if(packet.topic.split('/')[0] == "master")
            {
                return
            }
            /**
            * @type {HuskyMessage}
            */
            let message
            try {
                message = JSON.parse(json);
            } catch (ex) {
                return
            }

            if (typeof (message.messageType) == "undefined" || message.messageType == null) {
                return;
            }

            if (message.messageType == MESSAGETYPE.RESPONSE && toAgent == "master") {
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
                        if (response.responseStatus == RESPONSESTATUS.OK) {
                            w.callback(null, response)
                        } else {
                            w.callback(new Error(response.arg.message), response)
                        }

                    }
                })

                lodash.remove(this.responseWaitObjects, (w) => {
                    return called.includes(w, 0)
                })
            } else if (message.messageType == MESSAGETYPE.COMMAND && toAgent == "master") {
                /**
                 * @type {HuskyCommand}
                 */
                let command = JSON.parse(message.arg)
                try {
                   // let arg = JSON.parse(command.argas)
                    let obj = {}
                    for(let key in command.args)
                    {
                        obj[key] = JSON.parse(command.args[key]);
                    }
                    command.args = obj;
                } catch (ex) {
                    console.log(ex)
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
                        message: `No route for ${command.commandPath}`
                    }

                    this.WriteResponse(command.commandId, RESPONSESTATUS.INVALID, err)
                }

            }
        });

    }
    /**
     * 
     * @param {String} commandPath 
     * @param {OPERATIONTYPE} operationType 
     * @param {Object} args 
     * @param {ResponseCallback} callback 
     */
    WriteCommand(commandPath, operationType, args, callback) {
        if (typeof (args) != "object") {
            callback(new Error("args must be a object"), null)
        } else if (typeof (commandPath) != "string") {
            callback(new Error("commandPath must be a string"), null)
        } else if (typeof (operationType) != "number") {
            callback(new Error("operationType must be a number"), null)
        } else {

            /**
             * @type {Object}
             */
            let argParam = {}

            try {
                for (let key in args) {
                    if(typeof(args[key]) === 'object')
                    {
                        argParam[key] = JSON.stringify(args[key]);
                    }
                    else{
                        argParam[key] = args[key]
                    }
                    
                }
            } catch (err) {
                callback(err, null)
                return
            }

            /**
             * @type {HuskyCommand}
             */
            let command = {
                args: argParam,
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
            this.mosca.publish({
                payload: JSON.stringify(message),
               // topic: "java/command",
                topic : `java/command`,
                qos: 1
            });

        }
    }

    /**
     * 
     * @param {String} commandPath 
     * @param {HuskyOperationType} operationType 
     * @param {Boolean} force
     * @param {OnCommandCallback} callback 
     */
    OnCommand(commandPath, operationType, force, callback) {
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
            if(force || (this.readyBefore == null || this.readyBefore == false))
            {
                this.onCommandWaitObjects.push(waitObject);
            }
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
        this.mosca.publish({
            payload: JSON.stringify(message),
            topic: "java/response"
        });
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

let c = new CrossAppCommunicator(961);


c.OnReady(() => {
    console.log("ready")

    
    /*c.WriteCommand('printa', OPERATIONTYPE.WRITE, {usuario: {nome: "christian", idade : 21}}, (err, resposta) =>{
        if(err)
        {
            console.log("erro", err.message)
        }
        else
        {
            console.log(resposta)
        }
    })

    c.WriteCommand('printa', OPERATIONTYPE.WRITE, {name: "christian"}, (err, resposta) =>{
        if(err)
        {
            console.log("erro", err.message)
        }
        else
        {
            console.log(resposta)
        }
    })*/

    c.OnCommand('pog', OPERATIONTYPE.READ, false, (command, writeResponse) => {
        console.log(command.args);
        writeResponse(RESPONSESTATUS.OK, "kakakakak");

    })
})
