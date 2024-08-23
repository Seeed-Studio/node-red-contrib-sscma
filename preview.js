module.exports = function (RED) {
    var connections = [];
    function PreviewNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.on('input', function (msg) {
            if (connections.length > 0) {
                connections.forEach(connection => {
                    connection.res.write(`data: ${JSON.stringify(msg)}\n\n`);
                });
            }
        });

        node.on('close', function () {
            //connections = [];
        });

        RED.httpAdmin.get(`/preview-data/${node.id}`, function (req, res) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            const connection = { req, res };
            connections.push(connection);
            console.log('Client connected', connections.length);
            req.on('close', () => {
                console.log('Client disconnected');
                connections = connections.filter(c => c !== connection);
                res.end();
            });
        });


        console.log(`Serving preview at http://localhost:1880/preview/${node.id}`);
        RED.httpAdmin.get(`/preview/${node.id}`, function (req, res) {
            res.sendFile(__dirname + '/public/index.html');
        });
    }
    RED.nodes.registerType("preview", PreviewNode);

}
