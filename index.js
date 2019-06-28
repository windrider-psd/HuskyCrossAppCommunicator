let net = require('net');
let ip = require('ip')

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
    WRITE : 1
}

/**
 * @enum {HuskyResponseStatus} 
 */
let RESPONSESTATUS = {
    OK: 0,
    INVALID : 1,
    ERROR : 2
}

/**
 * @typedef HuskyError
 * @property {String} code
 * @property {String} message
 */

/**
 * @typedef HuskyCommand
 * @property {String} commandPath
 * @property {Number} operationType
 * @property {String} arg
*/

/**
 * @typedef HuskyResponse
 * @property {Number} responseStatus
 * @property {any} arg
 */



class CrossAppCommunicator
{
    constructor(port)
    {
        this.client = new net.Socket();
        this.client.connect(port, ip.address(), () => {
            
        })
        this.client.on('connect', () => {
            let command = {
                arg : '',
                commandPath : "user",
                operationType: OPERATIONTYPE.READ
            };
            this.client.write(JSON.stringify(command));
        })
        this.client.on('data', (data) => {
            let json = String(data);
            /**
             * @type {HuskyResponse}
             */
            let response = JSON.parse(json);
            console.log(response);
            response.arg.id = "Christian"
            let command = {
                arg : JSON.stringify(response.arg),
                commandPath : "user",
                operationType: OPERATIONTYPE.WRITE
            };
            this.client.write(JSON.stringify(command), () => {
                console.log("Ending")
                this.client.listeners = []
                this.client.end();
            });

            
        })
    }
}

let communicator = new CrossAppCommunicator(42228);



