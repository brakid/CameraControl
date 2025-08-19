import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Text,
  View
} from 'react-native';
import OrientationSensor, { Angles } from './OrientationSensor';
import { HTTP_URL, WS_URL } from './constants';

// Types
interface WebSocketMessage {
  type: string;
  data: string;
  timestamp: number;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

const sendAngles = async (angles: Angles): Promise<boolean> => {
  console.log(`Sending ${JSON.stringify(angles)}`);
  try {
    await fetch(`${HTTP_URL}/coordinates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(angles),
    });
    return true;
  } catch (error: any) {
    console.error('Network error:', JSON.stringify(error.message));
    return false;
  }
};

const WebcamStream = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const lastFrameTime = useRef<number>(0);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const connect = (): void => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');
    setFps(0);

    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = (): void => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
      };

      wsRef.current.onmessage = (event: WebSocketMessageEvent): void => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          if (message.type === 'frame') {
            // Update frame
            const frameData: string = `data:image/jpeg;base64,${message.data}`;
            requestAnimationFrame(() => setCurrentFrame(frameData));

            // Calculate FPS
            const currentTime: number = Date.now();
            if (lastFrameTime.current > 0) {
              const timeDiff: number = (currentTime - lastFrameTime.current) / 1000;
              const currentFps: number = 1 / timeDiff;
              setFps(currentFps);
            }
            lastFrameTime.current = currentTime;
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      wsRef.current.onclose = (event: WebSocketCloseEvent): void => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setConnectionStatus('disconnected');
        setCurrentFrame(null);
      };

      wsRef.current.onerror = (error: Event): void => {
        console.error('WebSocket error:', error);
        setConnectionStatus('disconnected');
        Alert.alert(
          'Connection Error',
          'Failed to connect to webcam stream. Make sure the server is running and the IP address is correct.'
        );
      };

    } catch (error) {
      console.error('Error creating WebSocket:', error);
      setConnectionStatus('disconnected');
      Alert.alert('Error', 'Failed to create WebSocket connection');
    }
  };

  const disconnect = (): void => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
    setCurrentFrame(null);
    setFps(0);
  };

  const isConnected: boolean = connectionStatus === 'connected';
  const isConnecting: boolean = connectionStatus === 'connecting';
  const isDisconnected: boolean = connectionStatus === 'disconnected';

  return (
    <View style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f5f5', padding: 10 }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000', overflow: 'hidden', elevation: 5 }}>
        {currentFrame && (
          <Image
            source={{ uri: currentFrame }}
            style={{ width: 640, height: 480 }}
            contentFit='contain'
            transition={0}
          />
        )}

      </View>

      <View style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', maxHeight: 70, margin: 0, padding: 10, paddingHorizontal: 30 }}>
         <View>
          { (isConnecting || isDisconnected) && <Button
            color={ (isConnected || isConnecting)? 'gray' : 'green' }
            onPress={connect}
            title={isConnecting ? 'Connecting...' : 'Connect'}
          /> }

          { isConnected && <Button
          color={ (isDisconnected)? 'gray' : 'red' }
            onPress={disconnect}
            title='Disconnect'
          /> }
          <Text>Video FPS: {fps.toFixed(1)}</Text>
        </View>
        <OrientationSensor orientationCallback={ angles => sendAngles(angles) }/>
      </View>
    </View>
  );
};

export default WebcamStream;