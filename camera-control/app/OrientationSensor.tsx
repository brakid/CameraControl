import { Accelerometer, Magnetometer } from 'expo-sensors';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Text, View } from 'react-native';

interface SensorData {
  x: number;
  y: number;
  z: number;
};

export interface Angles {
  //pitch: number; // phone rotation?
  roll: number; // up down
  yaw: number; // left right
};

const calculateAngles = (accel: SensorData, mag: SensorData, precision: number = 10**1): Angles => {
  let { x: ax, y: ay, z: az } = accel;
  let { x: mx, y: my, z: mz } = mag;

  //adjust for landscape mode
  const temp_ax = ax;
  const temp_ay = ay;
  const temp_mx = mx;
  const temp_my = my;
  
  ax = temp_ay;   // new X = old Y
  ay = -temp_ax;  // new Y = -old X  
  az = az;        // Z unchanged
  
  mx = temp_my;   // new X = old Y
  my = -temp_mx;  // new Y = -old X
  mz = mz;        // Z unchanged

  // Calculate pitch and roll from accelerometer
  const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
  const roll = Math.atan2(ay, az);

  // Tilt-compensated magnetometer readings for yaw calculation
  const mxComp = mx * Math.cos(pitch) + mz * Math.sin(pitch);
  const myComp = 
    mx * Math.sin(roll) * Math.sin(pitch) +
    my * Math.cos(roll) -
    mz * Math.sin(roll) * Math.cos(pitch);

  // Calculate yaw (heading relative to magnetic north)
  let yaw = Math.atan2(-myComp, mxComp);

  // Convert to degrees
  //const pitchDeg = (pitch * 180) / Math.PI;
  const rollDeg = -1 * (roll * 180) / Math.PI - 90;
  let yawDeg = - 1 * (yaw * 180) / Math.PI;

  return {
    roll: Math.round(rollDeg * precision) / precision,
    yaw: Math.round(normalizeAngle(yawDeg) * precision) / precision
  };
};

const formatAngle = (angle: number, label: string) => {
  const absAngle = Math.abs(angle);
  const sign = angle >= 0 ? '+' : '-';
  return `${label}: ${sign}${absAngle.toFixed(1)}°`;
};

const getAngleDifference = (angle1: number, angle2: number): number => {
  let diff = angle2 - angle1;
  
  while (diff > 180) {
    diff -= 360;
  }
  while (diff <= -180) {
    diff += 360;
  }
  
  return diff;
};

const normalizeAngle = (angle: number): number => {
  angle = angle % 360;
  if (angle < 0) {
    angle += 360;
  }
  return angle;
};

const updateAngles = (oldAngles: Angles, newAngles: Angles, updateRate: number = 0.8): Angles => {
  const yawDifference = getAngleDifference(oldAngles.yaw, newAngles.yaw);
  const rollDifference = getAngleDifference(oldAngles.roll, newAngles.roll);
  return { 
    yaw: normalizeAngle(oldAngles.yaw + updateRate * yawDifference),
    roll: oldAngles.roll + updateRate * rollDifference,
  };
};

const getAnglesDifference = (angles: Angles, zeroAngles: Angles): Angles => {
  return {
    yaw: getAngleDifference(angles.yaw, zeroAngles.yaw),
    roll: getAngleDifference(angles.roll, zeroAngles.roll)
  };
};

interface OrientationSensorProps {
  orientationCallback: (angles: Angles) => Promise<boolean>
};

const OrientationSensor = ({ orientationCallback }: OrientationSensorProps) => {
  const [accelerometerData, setAccelerometerData] = useState<SensorData>({ x: 0, y: 0, z: 0 });
  const [magnetometerData, setMagnetometerData] = useState<SensorData>({ x: 0, y: 0, z: 0 });
  const [angles, setAngles] = useState<Angles>({ roll: 0, yaw: 0 });
  const [zeroAngles, setZeroAngles] = useState<Angles>();
  const [isActive, setIsActive] = useState<boolean>(false);

  const differenceAngles = useMemo<Angles>(() => {
    const difference = getAnglesDifference(angles, zeroAngles || { roll: 0, yaw: 0 });
    if (isActive) {
      orientationCallback(difference).then(result => {
        if (!result) {
          setIsActive(false);
          Alert.alert('Network issue', 'Network issue, stopping orientation tracking');
        }
      });
    }
    return difference;
  }, [angles, zeroAngles, isActive]);
  
  // Start/stop sensors
  useEffect(() => {
    let accelerometerSubscription: { remove: () => void } | undefined;
    let magnetometerSubscription: { remove: () => void } | undefined;

    // Set update intervals (in milliseconds)
    Accelerometer.setUpdateInterval(500);
    Magnetometer.setUpdateInterval(500);

    // Subscribe to accelerometer
    accelerometerSubscription = Accelerometer.addListener((data) => {
      setAccelerometerData(data);
    });

    // Subscribe to magnetometer
    magnetometerSubscription = Magnetometer.addListener((data) => {
      setMagnetometerData(data);
    });

    return () => {
      if (accelerometerSubscription) {
        accelerometerSubscription.remove();
      }
      if (magnetometerSubscription) {
        magnetometerSubscription.remove();
      }
    };
  }, []);

  // Calculate angles when sensor data updates
  useEffect(() => {
    const newAngles = calculateAngles(accelerometerData, magnetometerData);
    setAngles(oldAngles => updateAngles(oldAngles, newAngles));
  }, [accelerometerData, magnetometerData]);

  return (
    <View style={{ margin: 0, padding: 0 }}>
      { !isActive && (
        <Button
          onPress={ () => { setIsActive(true); setZeroAngles(angles) } }
          color='green'
          title='Start Orientation'
        />
      ) }
      { isActive && (
        <Button
          onPress={ () => { setIsActive(false); setZeroAngles(undefined) } }
          color='red'
          title='Stop Orientation'
        />
      ) }
      { zeroAngles && isActive && (
        <Text>Left/Right: {differenceAngles.yaw.toFixed(1)}°, {formatAngle(differenceAngles.roll, 'Up/Down')}</Text>
      ) }
      { !isActive && (
        <Text>Orientation tracking stopped</Text>
      ) }
    </View>
  );
};

export default OrientationSensor;