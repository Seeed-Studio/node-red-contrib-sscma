const { spawn } = require("child_process");

class CommandExecutor {
    constructor(command, args = [], options = {}) {
        this.command = command;
        this.args = args;
        this.options = options;
        this.process = null;
        this.isRunning = false;
    }

    start() {
        return new Promise((resolve, reject) => {
            try {
                // 启动进程
                this.process = spawn(this.command, this.args, this.options);
                this.isRunning = true;

                // 标准输出处理
                this.process.stdout.on("data", (data) => {
                    const output = data.toString().trim();
                    if (output) {
                        this.handleOutput("stdout", output);
                    }
                });

                // 标准错误处理
                this.process.stderr.on("data", (data) => {
                    this.handleOutput("stderr", data);
                });

                // 进程结束处理
                this.process.on("close", (code) => {
                    this.isRunning = false;
                    this.handleClose(code);
                });

                // 错误处理
                this.process.on("error", (error) => {
                    this.isRunning = false;
                    this.handleError(error);
                    reject(error);
                });

                resolve(this.process);
            } catch (error) {
                reject(error);
            }
        });
    }

    // eslint-disable-next-line no-unused-vars
    handleOutput(type, data) {}

    // eslint-disable-next-line no-unused-vars
    handleClose(code) {}

    // eslint-disable-next-line no-unused-vars
    handleError(error) {}

    on(event, handler) {
        switch (event) {
            case "close":
                this.handleClose = handler;
                break;
            case "error":
                this.handleError = handler;
                break;
            case "data":
                this.handleOutput = handler;
                break;
            default:
                console.warn(`未知事件：${event}`);
        }
    }

    stop() {
        if (this.isRunning && this.process) {
            this.process.kill();
            this.isRunning = false;
        }
    }

    // 获取进程状态
    getStatus() {
        return {
            isRunning: this.isRunning,
            pid: this.process ? this.process.pid : null,
        };
    }
}

module.exports = CommandExecutor;
