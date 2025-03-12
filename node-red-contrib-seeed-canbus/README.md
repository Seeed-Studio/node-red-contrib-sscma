
# node-red-contrib-seeed-canbus

A set of simple nodes for CANBus management on linux machines based on `can-utils`.


It offers a collection of straightforward nodes dedicated to CANBus management on Linux-based machines, leveraging the capabilities of `can-utils`. `Can-utils` is a well-known and widely-used set of tools for CANBus in the Linux ecosystem, providing a solid foundation for this package.

1. CANBus Control

This package provides a series of easy-to-use nodes that enable users to interact with the CANBus effortlessly. Through these nodes, users can conveniently send and receive CAN messages, facilitating the monitoring, configuration, and control of the CANBus network. This functionality is highly valuable for applications in various fields such as industrial automation, automotive electronics, and smart home systems, where communication with CAN devices is essential.

2. reCamera Gimbal Motor Control

 Optimized Node "Gimbal Motor Control node" for controlling the motors of the reCamera Gimbal. For reCamera Gimbal, the MS3008 motor's ID is 141 for yaw controlling, and the MS3506 motor's ID of 142 for pitch controlling. With this package, users can precisely control the operation of these motors according to the CANBus control protocol, please refer to [CANBus protocol statement](https://github.com/litxaohu/OSHW-reCamera-Series/blob/main/reCamera_Gimbal/MotorTools/CN/通讯协议/控越电机CAN协议说明%V2.35.pdf). 

## Install

To install the stable version use the `Menu - Manage palette - Install` option and search for `node-red-contrib-seeed-canbus`, or run the following command in your Node-RED user directory, typically `~/.node-red`

```bash
npm install node-red-contrib-seeed-canbus
```

This node relies on the Linux backend tool `can-utils`, which is not included in this installation.

You can install `can-utils` on your terminal by running the following command:

```bash
sudo apt-get install can-utils
```

## Usage


### CAN read

Send out all the input data from CANBus.

- Name: Custom naming.
- CAN Bus: Configure and select CAN interface and baud rate.

The CAN id and data parameters can be filled in to filter the contents of the accepted packets.

Select the `Filter` option.

Fill in the `CAN id` and `data[num]` data to filter the input CAN data frame.

#### Output

The output format is json package:

```json
{
    id:"",
    data:""
}
```

For example:

```json
{
    id:"141",
    data:
    	0: "90"
    	1: "00"
    	2: "AB"
    	3: "02"
    	4: "3C"
    	5: "4C"
    	6: "91"
    	7: "49"
}
```


### CAN write

Read the response of the specified CAN request frame in CAN write node.

### Input

CAN standard frame format:

`ID#data[0].data[1].data[2].data[3].data[4].data[5].data[6].data[7]`

For example: `141#A4.00.2C.01.50.46.00.00`

### Output

The data returned by the reply frame is the content of the query frame.

Filter reply frames using CAN_id and data[0].

For example:

Inquiry frame(Input): `141#90.00.00.00.00.00.00.00`

Reply frame(Output):`141#90.00.AB.02.3C.4C.91.49`
