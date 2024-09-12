module.exports = function(RED) {
   
    function PreviewNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.active     = (config.active === null || typeof config.active === "undefined") || config.active;
        
        function handleError(err, msg, statusText) {
            node.status({ fill:"red", shape:"dot", text:statusText });
            node.error(err, msg);
        }
        node.on("input", function(msg) {
            if (this.active !== true) { return; }
            RED.comms.publish("image", { id:node.id, data:msg.payload.data });
        });

        node.on("close", function() {
            RED.comms.publish("image", { id:this.id });
            node.status({});
        });
    }
    RED.nodes.registerType("preview", PreviewNode);
    
    // Via the button on the node (in the FLOW EDITOR), the image pushing can be enabled or disabled
    RED.httpAdmin.post("/image-output/:id/:state", RED.auth.needsPermission("image-output.write"), function(req,res) {
        var state = req.params.state;
        var node = RED.nodes.getNode(req.params.id);
        
        if(node === null || typeof node === "undefined") {
            res.sendStatus(404);
            return;  
        }
        if (state === "enable") {
            node.active = true;
            res.send('activated');
        }
        else if (state === "disable") {
            node.active = false;
            res.send('deactivated');
        }
        else {
            res.sendStatus(404);
        }
    });
};