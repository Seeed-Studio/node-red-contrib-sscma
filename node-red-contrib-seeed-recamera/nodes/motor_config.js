const YAW_ID = "141";
const PITCH_ID = "142";
const DEFAULT_SPEED = "5A.00";
const CURRENT_YAW_SPEED_KEY = "can$$currentYawSpeed";
const CURRENT_PITCH_SPEED_KEY = "can$$currentPitchSpeed";

module.exports = function (RED) {
    function MotorConfigNode(config) {
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
                const isYawMotor = output == "0" || output == "1";
                const motorId = isYawMotor ? YAW_ID : PITCH_ID;
                const isSpeedControl = output == "1" || output == "3";
                // 构建输出字符串
                const value = isSpeedControl ? intToHexString(numInputValue) : intToHexString(numInputValue * 100);
                // 如果是速度控制，更新全局上下文
                if (isSpeedControl) {
                    if (output == "1") {
                        globalContext.set(CURRENT_YAW_SPEED_KEY, value);
                    } else {
                        globalContext.set(CURRENT_PITCH_SPEED_KEY, value);
                    }
                } else {
                    let speedHex = "";
                    if (output == "0") {
                        speedHex = globalContext.get(CURRENT_YAW_SPEED_KEY) ?? DEFAULT_SPEED;
                    } else {
                        speedHex = globalContext.get(CURRENT_PITCH_SPEED_KEY) ?? DEFAULT_SPEED;
                    }
                    const outputValue = `${motorId}#A4.00.${speedHex}.${value}.00.00`;
                    // 只在节点有输出端口时发送数据
                    node.send({ payload: outputValue });
                }
            } catch (error) {
                node.error(`Error processing: ${error.message}`);
            }
        });
    }

    RED.nodes.registerType("motor-config", MotorConfigNode);
};
