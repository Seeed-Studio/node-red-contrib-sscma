![Platform Node-RED](https://img.shields.io/badge/Platform-Node--RED-red.png)

## Installation

To install the package in Node-RED, run the following command:

```bash
npm install node-red-contrib-seeed-recamera
```

Or install directly through the Node-RED interface.

### Motor Config

Input motor parameters value, and output control motor CAN data frame according to the protocol.

- Node Name: Custom naming.
- Input: Access node information.
- Output: Select the controlled motor and motor speed or position.

#### Input:

The input data type is number or string.

- The `output to` is chosen to be `Yaw axis angle (Left and right)` is the range : 0-360
- The `output to` is chosen to be `Yaw axis speed(Left and right)` is the range : 0-360
- The `output to` is chosen to be `Pitch axis angle (Up and down)` is the range : 0-180
- The `output to` is chosen to be `Pitch axis speed(Up and down)` is the range : 0-360

The Angle value controls the position of the device in degrees; The speed value controls how fast the device rotates in dps/LSB.

> note: Due to hardware errors, please do not use the configuration at the limit position: 0,180,360 these angles, it will make the motor overload.

#### Output:

Through the incoming speed and Angle instructions, the CAN instruction frame is packaged into a speed closed loop.

If no speed value is passed in, the default speed value is 300.

For example: 

- Yaw axis angle (Left and right): 180
- Yaw axis speed(Left and right): 300

output : `141#A4.00.2C.01.10.27.00.00`

For example: 

- Pitch axis angle (Left and right): 180
- Pitch axis speed(Left and right): 300

output : `142#A4.00.2C.01.10.27.00.00`

## License

This project is licensed under the Apache License 2.0. 