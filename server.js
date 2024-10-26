import express from "express";
import https from "https";
import http from "http";
const app = express();
import fs from "fs";
import ip from "ip";
import { WebSocketServer } from "ws";
import * as BS from "brilliantsole/node";
import osc from "osc";
import * as THREE from "three";

// HTTPS SERVER
app.use(function (req, res, next) {
  res.header("Cross-Origin-Opener-Policy", "same-origin");
  res.header("x-frame-options", "same-origin");

  next();
});
app.use(express.static("./"));

const serverOptions = {
  key: fs.readFileSync("./sec/key.pem"),
  cert: fs.readFileSync("./sec/cert.pem"),
};

const httpServer = http.createServer(app);
httpServer.listen(80);
const httpsServer = https.createServer(serverOptions, app);
httpsServer.listen(443, () => {
  console.log(`server listening on https://${ip.address()}`);
});

// WEBSOCKET
const wss = new WebSocketServer({ server: httpsServer });
const webSocketServer = new BS.WebSocketServer();
webSocketServer.clearSensorConfigurationsWhenNoClients = false;
webSocketServer.server = wss;

const sendPort = 9000;
const receivePort = 9001;
const localAddress = "0.0.0.0";
const sendAddress = "192.168.1.201"; // replace with your IP

// OSC
const oscServer = new osc.UDPPort({
  localAddress: localAddress,
  localPort: receivePort,
  metadata: true,
});

oscServer.on("message", function (oscMsg, timeTag, info) {
  console.log("received message", oscMsg);

  const address = oscMsg.address.split("/").filter(Boolean);
  const { args } = oscMsg; // [...{type, value}]

  switch (address[0]) {
    case "setSensorConfiguration":
      /** @type {BS.SensorConfiguration} */
      const sensorConfiguration = {};

      /** @type {BS.SensorType} */
      let sensorType;

      args.forEach((arg) => {
        switch (arg.type) {
          case "s":
            if (BS.SensorTypes.includes(arg.value)) {
              sensorType = arg.value;
            }
            break;
          case "f":
          case "i":
            sensorConfiguration[sensorType] = arg.value;
            break;
        }
      });
      devicePair.setSensorConfiguration(sensorConfiguration);
      break;
    case "resetGameRotation":
      resetGameRotation();
      break;
    default:
      console.log(`uncaught address ${address[0]}`);
      break;
  }
});

oscServer.open();

const devicePair = BS.DevicePair.shared;

const eulers = {
  left: new THREE.Euler(0, 0, 0, "ZXY"),
  right: new THREE.Euler(0, 0, 0, "ZXY"),
};

const inverseGameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const gameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};
const gameRotationEuler = {
  left: new THREE.Euler(0, 0, 0, "YXZ"),
  right: new THREE.Euler(0, 0, 0, "YXZ"),
};
const latestGameRotation = {
  left: new THREE.Quaternion(),
  right: new THREE.Quaternion(),
};

function resetGameRotation() {
  BS.InsoleSides.forEach((side) => {
    gameRotationEuler[side].setFromQuaternion(latestGameRotation[side]);
    gameRotationEuler[side].x = gameRotation[side].z = 0;
    gameRotationEuler[side].y *= -1;
    inverseGameRotation[side].setFromEuler(gameRotationEuler[side]);
  });
}
app.get("/resetGameRotation", (req, res) => {
  console.log("resetting game rotation");
  resetGameRotation();
  res.send({});
});

const trackingIndex = {
  left: 1,
  right: 2,
};

oscServer.on("ready", function () {
  devicePair.addEventListener("deviceSensorData", (event) => {
    const { side, sensorType } = event.message;
    let args;
    let isRotation = false;
    switch (sensorType) {
      case "gameRotation":
        const quaternion = gameRotation[side];
        quaternion.copy(event.message.gameRotation);
        quaternion.premultiply(inverseGameRotation[side]);

        const euler = eulers[side];
        euler.setFromQuaternion(quaternion);
        const [pitch, yaw, roll, order] = euler.toArray();
        args = [-pitch, -yaw, roll].map((value) => {
          return {
            type: "f",
            value: THREE.MathUtils.radToDeg(value),
          };
        });

        latestGameRotation[side].copy(event.message.gameRotation);
        isRotation = true;
        break;
      case "linearAcceleration":
        // FILL
        break;
      case "gyroscope":
        // FILL
        break;
      case "magnetometer":
        // FILL
        break;
      case "pressure":
        // FILL
        break;
      default:
        break;
    }

    if (!args) {
      return;
    }

    if (isRotation) {
      oscServer.send(
        {
          address: `/tracking/trackers/${trackingIndex[side]}/rotation`,
          args,
        },
        sendAddress,
        sendPort
      );
      oscServer.send(
        {
          address: `/tracking/trackers/${trackingIndex[side]}/position`,
          args: [
            { type: "f", value: side == "left" ? -0.08 : 0.08 },
            { type: "f", value: -0.6 }, // fix
            { type: "f", value: 0 },
          ],
        },
        sendAddress,
        sendPort
      );
    }
  });
});
