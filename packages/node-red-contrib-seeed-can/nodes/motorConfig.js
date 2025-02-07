const { exec, spawn } = require("child_process");
const DATA_INDEX = 3;
const DATA_LENGTH = 8;
const CAN_BUS_INDEX = 0;
const CAN_BUS = "can0";
const YAW_ID = "141";
const PITCH_ID = "142";
const GET_CURRENT_COMMAND_DATA = "90.00.00.00.00.00.00.00";
function intToHexString(num) {
    // 确保输入是整数
    num = Math.floor(num);
    // 获取低位和高位
    const lowByte = num & 0xff;
    const highByte = (num >> 8) & 0xff;
    // 转换成两位16进制，不足补0
    const lowHex = lowByte.toString(16).padStart(2, "0");
    const highHex = highByte.toString(16).padStart(2, "0");
    // 返回格式：低位.高位
    return `${lowHex}.${highHex}`;
}

/**
 * 读取当前数据
 * @param {string} canId CAN id
 * @returns {Promise<string[]>}
 * @example
 * readCurrentData("141").then((data) => {
 *     console.log(data);
 * }).catch((error) => {
 *     console.error(error);
 * }
 */
function readCurrentData(canId) {
    return new Promise((resolve, reject) => {
        let tempItems = [];
        /**
         * @type {import("child_process").ChildProcessWithoutNullStreams}
         */
        const candumpProcess = spawn("timeout", [0.5, "candump", CAN_BUS], {});
        candumpProcess.stdout.on("data", (data) => {
            const lines = data.toString().trim().split("\n");
            const lastLine = lines[lines.length - 1];
            const items = lastLine.split(" ").filter((e) => e !== "");
            if (items.length < DATA_INDEX + DATA_LENGTH) {
                reject(new Error("No valid data found"));
            } else if (items[CAN_BUS_INDEX] !== "can0") {
                reject(new Error("No valid data found"));
            } else {
                tempItems = items;
            }
        });
        candumpProcess.stderr.on("data", (data) => {
            reject(data);
        });
        candumpProcess.on("error", (error) => {
            reject(error);
        });
        setTimeout(() => {
            candumpProcess.kill();
            resolve(tempItems);
        }, 600);
        exec(`cansend ${CAN_BUS} ${canId}#${GET_CURRENT_COMMAND_DATA}`, (error, stdout, stderr) => {
            if (error || stderr) {
                reject(`exec error: ${error || stderr}`);
            }
        });
    });
}

module.exports = function (RED) {
    function MotorConfigNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        console.log("MotorConfigNode", config);
        node.on("input", function (msg) {
            let inputValue;
            switch (config["input-type"]) {
                case "msg":
                    // 从 msg 对象获取
                    inputValue = RED.util.getMessageProperty(msg, config.input);
                    break;

                case "flow":
                    // 从 flow context 获取
                    inputValue = node.context().flow.get(config.input);
                    break;

                case "global":
                    // 从 global context 获取
                    inputValue = node.context().global.get(config.input);
                    break;
            }
            if (!inputValue) {
                node.error("Input value is empty");
                return;
            }
            let outputValue = "";
            const numInputValue = Number(inputValue);
            (async () => {
                try {
                    let currentData = [];
                    if (["0", "1"].includes(config.output)) {
                        currentData = await readCurrentData(YAW_ID);
                    } else if (["2", "3"].includes(config.output)) {
                        currentData = await readCurrentData(PITCH_ID);
                    }
                    if (currentData.length === 0) {
                        node.error("No valid data found");
                        return;
                    }
                    const angelHex = currentData.slice(DATA_INDEX + 4, DATA_INDEX + 6).join(".");
                    const speedHex = currentData.slice(DATA_INDEX + 2, DATA_INDEX + 4).join(".");
                    const otherHex = currentData.slice(-2).join(".");
                    switch (config.output) {
                        case "0":
                            {
                                const tempAngelHex = intToHexString(numInputValue * 100);
                                outputValue = `${YAW_ID}#A4.00.${speedHex}.${tempAngelHex}.${otherHex}`;
                            }
                            break;
                        case "1":
                            {
                                const tempSpeedHex = intToHexString(numInputValue);
                                outputValue = `${YAW_ID}#A4.00.${tempSpeedHex}.${angelHex}.${otherHex}`;
                            }
                            break;
                        case "2":
                            {
                                const tempAngelHex = intToHexString(numInputValue * 100);
                                outputValue = `${PITCH_ID}#A4.00.${speedHex}.${tempAngelHex}.${otherHex}`;
                            }
                            break;
                        case "3":
                            {
                                const tempSpeedHex = intToHexString(numInputValue);
                                outputValue = `${PITCH_ID}#A4.00.${tempSpeedHex}.${angelHex}.${otherHex}`;
                            }
                            break;
                    }
                    if (!outputValue) {
                        node.error("Invalid output value");
                        return;
                    }
                    node.send({ payload: outputValue });
                } catch (error) {
                    node.error(`Error reading current data: ${error.message}`);
                }
            })();
        });
    }

    RED.nodes.registerType("motor config", MotorConfigNode);
};
