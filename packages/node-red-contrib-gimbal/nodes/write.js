const fs = require("fs").promises;
const path = require("path");

module.exports = function (RED) {
    async function writeToFile(filePath, content) {
        try {
            const directory = path.dirname(filePath);
            await fs.mkdir(directory, { recursive: true });
            await fs.writeFile(filePath, content);
            RED.log.warn("文件写入成功");
        } catch (error) {
            RED.log.error(`写入文件时发生错误:${error}`);
            throw error;
        }
    }
    function writeNode(config) {
        RED.nodes.createNode(this, config);

        const node = this;
        let timer = null;
        let count = 1;
        const clean = () => {
            if (timer) {
                clearInterval(timer);
            }
            timer = null;
            count = 1;
        };
        node.on("input", function (msg) {
            if (typeof msg?.payload !== "object") {
                return;
            }
            const { yaw_axis, pitch_axis } = msg.payload;
            console.log(yaw_axis, pitch_axis);
            let action = "";
            if (yaw_axis) {
                action += `1_${yaw_axis}_90`;
            }
            if (pitch_axis) {
                if (action) {
                    action += "+";
                }
                action += `2_${pitch_axis}_90`;
            }
            clean();
            timer = setInterval(() => {
                if (count === 5) {
                    clean();
                }
                if (count < 5) {
                    count += 1;
                }
                writeToFile("/home/recamera/jiaodu.txt", action);
            }, 80);
        });
    }

    RED.nodes.registerType("write", writeNode);
};
