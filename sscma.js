module.exports = function (RED) {
    "use strict";
    const { MsgType } = require('./constants');
    var mqtt = require("mqtt");

    function updateStatus(node, allNodes) {
        let setStatus = setStatusDisconnected
        if (node.connecting) {
            setStatus = setStatusConnecting
        } else if (node.connected) {
            setStatus = setStatusConnected
        }
        setStatus(node, allNodes)
    }

    function setStatusDisconnected(node, allNodes) {
        if (allNodes) {
            for (var id in node.users) {
                node.users[id].status({ fill: "red", shape: "ring", text: "node-red:common.status.disconnected" });
            }
        } else {
            node.status({ fill: "red", shape: "ring", text: "node-red:common.status.disconnected" });
        }
    }

    function setStatusConnecting(node, allNodes) {
        if (allNodes) {
            for (var id in node.users) {
                node.users[id].status({ fill: "yellow", shape: "ring", text: "node-red:common.status.connecting" });
            }
        } else {
            node.status({ fill: "yellow", shape: "ring", text: "node-red:common.status.connecting" });
        }
    }

    function setStatusConnected(node, allNodes) {
        if (allNodes) {
            for (var id in node.users) {
                node.users[id].status({ fill: "green", shape: "dot", text: "node-red:common.status.connected" });
            }
        } else {
            node.status({ fill: "green", shape: "dot", text: "node-red:common.status.connected" });
        }
    }

    function SSCMANode(config) {
        RED.nodes.createNode(this, config);

        const node = this;
        node.users = {};

        // Config node state
        node.host = config.host;
        node.port = config.port;
        node.autoConnect = config.autoConnect || true;
        node.connected = false;
        node.connecting = false;
        node.closing = false;
        node.options = {};
        node.queue = [];
        node.brokerurl = "mqtt://" + node.host;
        node.api = "v0";


        node.register = function (Node) {
            node.users[Node.id] = Node;
            if (Object.keys(node.users).length === 1) {
                if (node.autoConnect) {
                    node.connect();
                    //update nodes status
                    setTimeout(function () {
                        updateStatus(node, true)
                    }, 1)
                }
            }
            const create = {
                "type": Node.type,
                "config": Node.config,
            }
            node.request(Node.id, "create", create);
        };

        node.deregister = function (Node, done, autoDisconnect) {
            const destroy = {
                "type": Node.type,
            }
            node.request(Node.id, "destroy", destroy, done);
            delete node.users[Node.id];
            if (autoDisconnect && !node.closing && node.connected && Object.keys(node.users).length === 0) {
                node.disconnect(done);
            } else {
                done();
            }
        };

        node.canConnect = function () {
            return !node.connected && !node.connecting;
        }

        node.connect = function (callback) {
            if (node.canConnect()) {
                node.closing = false;
                node.connecting = true;
                setStatusConnecting(node, true);
                try {
                    if (node.client) {
                        //belt and braces to avoid left over clients
                        node.client.end(true);
                        node.clinet.removeAllListeners();
                        node.clientListeners = [];
                    }
                    node.client = mqtt.connect(node.brokerurl, node.options);
                    node.client.setMaxListeners(0);
                    let callbackDone = false;
                    node.client.on('connect', function (connack) {
                        node.closing = false;
                        node.connecting = false;
                        node.connected = true;
                        if (!callbackDone && typeof callback === "function") {
                            callback();
                        }
                        callbackDone = true;
                        setStatusConnected(node, true);
                        // Re-subscribe to stored topics
                        for (var s in node.subscriptions) {
                            if (node.subscriptions.hasOwnProperty(s)) {
                                for (var r in node.subscriptions[s]) {
                                    if (node.subscriptions[s].hasOwnProperty(r)) {
                                        node.subscribe(node.subscriptions[s][r])
                                    }
                                }
                            }
                        }
                        const topic = "sscma/" + node.api + "/recamera/node/out/+"
                        node.client.subscribe(topic, function (err) {
                            if (err) { console.log(err); }
                        });
                        // TODO: send connection acknowledgement to server
                    });
                    node.client.on("message", function (topic, message) {
                        const id = topic.split("/").slice(-1)[0];
                        if (node.users[id]) {
                            try {
                                var msg = {
                                    type: "sscma",
                                    payload: JSON.parse(message)
                                };
                                node.users[id].receive(msg);
                            } catch (err) {
                                console.log("Error parsing message: " + err);
                            }
                        }
                    });
                    node.client.on("reconnect", function () {
                        setStatusConnecting(node, true);
                    });
                    node.client.on("disconnect", function () {
                        node.connected = false;
                        setStatusDisconnected(node, true);
                    });
                    node.client.on('close', function () {
                        if (node.connected) {
                            node.connected = false;
                            setStatusDisconnected(node, true);
                        } else if (node.connecting) {
                            node.connecting = false;
                            setStatusConnecting(node, true);
                        }
                    });
                    node.client.on('error', function (err) {
                        console.log(err);
                    });
                } catch (err) {
                    console.log(err);
                }
            }
        }

        node.disconnect = function (callback) {
            const _callback = function () {
                if (node.connected || node.connecting) {
                    setStatusDisconnected(node, true);
                }
                if (node.client) { node.client.removeAllListeners(); }
                node.connecting = false;
                node.connected = false;
                callback && typeof callback == "function" && callback();
            };
            if (!node.client) { return _callback(); }
            if (node.closing) { return _callback(); }

            /**
             * Call end and wait for the client to end (or timeout)
             * @param {mqtt.MqttClient} client The broker client
             * @param {number} ms The time to wait for the client to end
             * @returns
             */
            let waitEnd = (client, ms) => {
                return new Promise((resolve, reject) => {
                    node.closing = true;
                    if (!client) {
                        resolve();
                    } else {
                        const t = setTimeout(() => {
                            //clean end() has exceeded WAIT_END, lets force end!
                            client && client.end(true);
                            resolve();
                        }, ms);
                        client.end(() => {
                            clearTimeout(t);
                            resolve()
                        });
                    }
                });
            };
            waitEnd(node.client, 2000).then(() => {
                _callback();
            }).catch((e) => {
                _callback();
            })

        }

        node.request = function (id, cmd, data, done) {
            
            const topic = "sscma/" + node.api + "/recamera/node/in/" + id;
            const msg = {
                name: cmd,
                type: MsgType.REQUEST,
                data: data
            };
            const options = {
                qos: 0
            };
            node.client.publish(topic, JSON.stringify(msg), options, function (err) {
                if (err) {
                    console.log("Error sending request: " + err);
                } else {
                    if (done) { done(); }
                }
            });

        }

        node.on('close', function (done) {
            node.disconnect(function () {
                done();
            });
        });
    }
    RED.nodes.registerType("sscma", SSCMANode);
}
