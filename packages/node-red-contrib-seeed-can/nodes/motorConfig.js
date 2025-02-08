const { exec, spawn } = require("child_process");
const DATA_INDEX = 3;
const DATA_LENGTH = 8;
const CAN_BUS_INDEX = 0;
const CAN_ID_INDEX = 1;
const CAN_BUS = "can0";
const YAW_ID = "141";
const PITCH_ID = "142";
const GET_CURRENT_COMMAND_DATA = "90.00.00.00.00.00.00.00";

let timer = null; // 用于保存定时器
let candumpProcess = null; // 用于保存 candump 进程
function cleanTimer() {
    if (timer) {
        clearTimeout(timer);
        timer = null;
    }
}

function cleanCandumpProcess() {
    if (candumpProcess) {
        candumpProcess.kill();
        candumpProcess = null;
    }
}

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
        const sendCommandParam = `${CAN_BUS} ${canId}#${GET_CURRENT_COMMAND_DATA}`;
        /**
         * @type {import("child_process").ChildProcessWithoutNullStreams}
         */
        candumpProcess = spawn("timeout", [0.5, "candump", CAN_BUS], {});
        candumpProcess.stdout.on("data", (data) => {
            try {
                const lines = data.toString().trim().split("\n");
                lines.forEach((line) => {
                    const items = line.split(" ").filter((e) => e !== "");
                    const dataArr = items.slice(DATA_INDEX);
                    const resDataStr = `${items[CAN_BUS_INDEX]} ${items[CAN_ID_INDEX]}#${dataArr.join(".")}`;
                    if (items.length < DATA_INDEX + DATA_LENGTH) {
                        reject(new Error("No valid data found"));
                    } else if (items[CAN_BUS_INDEX] !== CAN_BUS) {
                        reject(new Error("No valid data found"));
                    }
                    if (resDataStr !== sendCommandParam) {
                        tempItems = items;
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
        candumpProcess.stderr.on("data", (data) => {
            reject(data);
        });
        candumpProcess.on("error", (error) => {
            reject(error);
        });
        timer = setTimeout(() => {
            resolve(tempItems);
            cleanTimer();
            cleanCandumpProcess();
        }, 550);
        exec(`cansend ${sendCommandParam}`, (error, stdout, stderr) => {
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
        node.on("input", async function (msg) {
            try {
                // 简化输入值获取
                const inputSources = {
                    msg: () => RED.util.getMessageProperty(msg, config.input),
                    flow: () => node.context().flow.get(config.input),
                    global: () => node.context().global.get(config.input),
                };
                const inputValue = inputSources[config["input-type"]]?.();
                if (!inputValue) {
                    node.error("Input value is empty");
                    return;
                }
                const numInputValue = Number(inputValue);
                // 映射输出类型到电机ID
                const motorIdMap = {
                    0: YAW_ID,
                    1: YAW_ID,
                    2: PITCH_ID,
                    3: PITCH_ID,
                };
                // 获取当前数据
                const motorId = motorIdMap[config.output];
                const currentData = await readCurrentData(motorId);
                if (currentData.length === 0) {
                    node.error("No valid data found");
                    return;
                }
                // 提取数据
                const angelHex = currentData.slice(DATA_INDEX + 4, DATA_INDEX + 6).join(".");
                const speedHex = currentData.slice(DATA_INDEX + 2, DATA_INDEX + 4).join(".");
                // 构建输出值
                const outputConfig = {
                    0: () => ({
                        id: YAW_ID,
                        value: intToHexString(numInputValue * 100),
                        useSpeed: true,
                    }),
                    1: () => ({
                        id: YAW_ID,
                        value: intToHexString(numInputValue),
                        useSpeed: false,
                    }),
                    2: () => ({
                        id: PITCH_ID,
                        value: intToHexString(numInputValue * 100),
                        useSpeed: true,
                    }),
                    3: () => ({
                        id: PITCH_ID,
                        value: intToHexString(numInputValue),
                        useSpeed: false,
                    }),
                };
                const tempConfig = outputConfig[config.output]?.();
                if (!tempConfig) {
                    node.error("Invalid output configuration");
                    return;
                }
                // 构建输出字符串
                const outputValue = tempConfig.useSpeed
                    ? `${tempConfig.id}#A4.00.${speedHex}.${tempConfig.value}.00.00`
                    : `${tempConfig.id}#A4.00.${tempConfig.value}.${angelHex}.00.00`;

                node.send({ payload: outputValue });
            } catch (error) {
                node.error(`Error processing: ${error.message}`);
            }
        });

        node.on("close", () => {
            cleanTimer();
            cleanCandumpProcess();
        });
    }

    RED.nodes.registerType("motor config", MotorConfigNode);
};
