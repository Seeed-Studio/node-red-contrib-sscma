const { exec, spawn } = require("child_process");
const YAW_ID = "141";
const PITCH_ID = "142";
const DEFAULT_SPEED = "5A.00";
const CURRENT_YAW_SPEED_KEY = "can$$currentYawSpeed";
const CURRENT_PITCH_SPEED_KEY = "can$$currentPitchSpeed";
const DATA_INDEX = 3;
const DATA_LENGTH = 8;
const CAN_BUS_INDEX = 0;
const CAN_ID_INDEX = 1;
const CAN_BUS = "can0";
const GET_CURRENT_STATUS_COMMAND_24 = "94.00.00.00.00.00.00.00";

module.exports = function (RED) {
    function MotorConfigNode(config) {
        let candumpProcess = null; // 用于保存 candump 进程

        function cleanCandumpProcess() {
            if (candumpProcess) {
                candumpProcess.kill();
                candumpProcess = null;
            }
        }

        function readCurrentData(canId, commandData) {
            return new Promise((resolve, reject) => {
                const sendCommandParam = `${CAN_BUS} ${canId}#${commandData}`;
                candumpProcess = spawn("timeout", [0.1, "candump", CAN_BUS], {});
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
                            if (resDataStr !== sendCommandParam && commandData.split(".")[0] === items[DATA_INDEX]) {
                                resolve(items);
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
                exec(`cansend ${sendCommandParam}`, (error, stdout, stderr) => {
                    if (error || stderr) {
                        reject(`exec error: ${error || stderr}`);
                    }
                });
            });
        }

        function speedToHexString(speed) {
            speed = Math.abs(Math.floor(speed));

            speed = Math.min(speed, 65535);

            const hex = speed.toString(16).toUpperCase().padStart(4, "0");

            const lowByte = hex.slice(2, 4);
            const highByte = hex.slice(0, 2);

            return `${lowByte}.${highByte}`;
        }

        function angleToHexString(angle) {
            const int32 = new Int32Array([angle])[0];

            const uint32 = new Uint32Array([int32])[0];

            const hex = uint32.toString(16).toUpperCase().padStart(8, "0");

            const byte1 = hex.slice(6, 8);
            const byte2 = hex.slice(4, 6);
            const byte3 = hex.slice(2, 4);
            const byte4 = hex.slice(0, 2);

            return `${byte1}.${byte2}.${byte3}.${byte4}`;
        }

        RED.nodes.createNode(this, config);
        const node = this;
        const globalContext = node.context().global;

        node.on("input", async function (msg) {
            try {
                // 简化输入值获取
                const inputSources = {
                    msg: () => RED.util.getMessageProperty(msg, config.input),
                    flow: () => node.context().flow.get(config.input),
                    global: () => node.context().global.get(config.input),
                };
                const inputValue = inputSources[config["input-type"]]?.();
                if (inputValue === undefined || inputValue === null) {
                    node.error("Input value is empty");
                    return;
                }
                const numInputValue = Number(inputValue);
                if (isNaN(numInputValue)) {
                    node.error("Input value is not a number");
                    return;
                }

                const output = config.output;
                // 确定电机ID和是否为速度控制
                const isYawMotor = output == "0" || output == "1" || output == "2";
                const motorId = isYawMotor ? YAW_ID : PITCH_ID;
                const isSpeedControl = output == "2" || output == "5";

                if (isSpeedControl) {
                    const speedHex = speedToHexString(numInputValue);
                    if (output == "2") {
                        globalContext.set(CURRENT_YAW_SPEED_KEY, speedHex);
                    } else {
                        globalContext.set(CURRENT_PITCH_SPEED_KEY, speedHex);
                    }
                } else {
                    const isAbsolute = output == "0" || output == "3";
                    const speedHex = globalContext.get(isYawMotor ? CURRENT_YAW_SPEED_KEY : CURRENT_PITCH_SPEED_KEY) ?? DEFAULT_SPEED;
                    const currentStatusData = await readCurrentData(motorId, GET_CURRENT_STATUS_COMMAND_24);
                    if (currentStatusData.length === 0) {
                        node.error("Conversion failed");
                        return;
                    }
                    const currentAngelHex = currentStatusData
                        .slice(DATA_INDEX + 4, DATA_INDEX + 6)
                        .reverse()
                        .join("");
                    let currentAngelValue = parseInt(currentAngelHex, 16);
                    if (currentAngelValue > 35600) {
                        currentAngelValue = 0;
                    }
                    let angelValue = numInputValue * 100;
                    let offsetHex;
                    const YAW_MIN_VALUE = 300;
                    const YAW_MAX_VALUE = 34500;
                    const PITCH_MIN_VALUE = 300;
                    const PITCH_MAX_VALUE = 18000;
                    if (isAbsolute) {
                        // 限制目标绝对角度
                        let targetAngle = angelValue;
                        if (motorId == YAW_ID) {
                            targetAngle = Math.max(YAW_MIN_VALUE, Math.min(YAW_MAX_VALUE, targetAngle));
                        } else {
                            targetAngle = Math.max(PITCH_MIN_VALUE, Math.min(PITCH_MAX_VALUE, targetAngle));
                        }
                        // 计算偏移量
                        let offsetValue = targetAngle - currentAngelValue;
                        offsetHex = angleToHexString(offsetValue);
                    } else {
                        // 相对偏移模式，需要检查最终位置是否会超限
                        let finalPosition = currentAngelValue + angelValue;
                        // 根据电机类型检查限制
                        if (motorId == YAW_ID) {
                            if (finalPosition < YAW_MIN_VALUE) {
                                angelValue = YAW_MIN_VALUE - currentAngelValue;
                            } else if (finalPosition > YAW_MAX_VALUE) {
                                angelValue = YAW_MAX_VALUE - currentAngelValue;
                            }
                        } else {
                            if (finalPosition < PITCH_MIN_VALUE) {
                                angelValue = PITCH_MIN_VALUE - currentAngelValue;
                            } else if (finalPosition > PITCH_MAX_VALUE) {
                                angelValue = PITCH_MAX_VALUE - currentAngelValue;
                            }
                        }
                        offsetHex = angleToHexString(angelValue);
                    }
                    const outputValue = `${motorId}#A8.00.${speedHex}.${offsetHex}`;
                    node.send({ payload: outputValue });
                }
            } catch (error) {
                node.error(`Error processing: ${error.message}`);
            }
        });

        node.on("close", function () {
            cleanCandumpProcess();
        });
    }

    RED.nodes.registerType("motor-config", MotorConfigNode);
};
