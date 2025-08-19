import asyncio
import websockets
import cv2
import base64
import json
from threading import Thread
import queue
import time
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from servo_controller import ServoController
from board import ServoBoard

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class WebcamStreamer:
    def __init__(self, camera_index=0, width=640, height=480, fps=30):
        self.camera_index = camera_index
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_queue = queue.Queue(maxsize=10)
        self.running = False
        self.cap = None
        
    def start_camera(self):
        '''Initialize and start the camera capture'''
        self.cap = cv2.VideoCapture(self.camera_index)
        if not self.cap.isOpened():
            raise RuntimeError(f'Could not open camera {self.camera_index}')
            
        # Set camera properties
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.height)
        self.cap.set(cv2.CAP_PROP_FPS, self.fps)
        
        self.running = True
        
        # Start capture thread
        capture_thread = Thread(target=self._capture_frames)
        capture_thread.daemon = True
        capture_thread.start()
        
    def _capture_frames(self):
        '''Capture frames in a separate thread'''
        while self.running:
            ret, frame = self.cap.read()
            if ret:
                # Encode frame as JPEG
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                frame_data = base64.b64encode(buffer).decode('utf-8')
                
                # Add to queue (drop old frames if queue is full)
                try:
                    self.frame_queue.put_nowait(frame_data)
                except queue.Full:
                    try:
                        self.frame_queue.get_nowait()  # Remove old frame
                        self.frame_queue.put_nowait(frame_data)
                    except queue.Empty:
                        pass
                        
            time.sleep(1/self.fps)
            
    def get_frame(self):
        '''Get the latest frame'''
        try:
            return self.frame_queue.get_nowait()
        except queue.Empty:
            return None
            
    def stop(self):
        '''Stop the camera and cleanup'''
        self.running = False
        if self.cap:
            self.cap.release()

async def handle_client(websocket):
    '''Handle WebSocket client connections'''
    logger.info(f'Client connected: {websocket.remote_address}')
    
    try:
        while True:
            # Get latest frame
            frame_data = webcam.get_frame()
            
            if frame_data:
                # Send frame to client
                message = {
                    'type': 'frame',
                    'data': frame_data,
                    'timestamp': time.time()
                }
                await websocket.send(json.dumps(message))
                
            # Control frame rate
            await asyncio.sleep(1/30)  # 30 FPS
            
    except websockets.exceptions.ConnectionClosed:
        logger.info(f'Client disconnected: {websocket.remote_address}')
    except Exception as e:
        logger.info(f'Error handling client {websocket.remote_address}: {e}')

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
webcam = WebcamStreamer(fps=30)
board = ServoBoard()
servo1_controller = ServoController(board, board.CMD_SERVO1, update_rate=200, initial_angle=60, min_angle=-45, max_angle=45)
servo2_controller = ServoController(board, board.CMD_SERVO2, update_rate=200, initial_angle=90, min_angle=-90, max_angle=90)

@app.route('/coordinates', methods=['POST'])
def receive_coordinates():
    try:
        if not request.is_json:
            return jsonify({'error': 'Content-Type must be application/json'}), 400
        
        data = request.get_json()
        
        if 'yaw' not in data or 'roll' not in data:
            return jsonify({'error': 'Both yaw and roww coordinates are required'}), 400
        
        yaw = float(data['yaw'])
        roll = float(data['roll'])
        
        logger.info(f'Received coordinates: yaw={yaw}, roll={roll}')
        
        servo2_controller.set_target_angle(yaw)
        servo1_controller.set_target_angle(roll)
        
        return jsonify({'status': 'success'}), 200
        
    except Exception as e:
        logger.error(f'Error: {str(e)}')
        return jsonify({'error': 'Internal server error'}), 500

async def webcam_main():
    # Start webcam
    try:
        webcam.start_camera()
        logger.info('Webcam started successfully')
    except RuntimeError as e:
        logger.info(f'Failed to start webcam: {e}')
        return
    
    # Start WebSocket server
    server = await websockets.serve(handle_client, '0.0.0.0', 8765)
    logger.info('WebSocket server started on ws://localhost:8765')
    
    try:
        await server.wait_closed()
    except KeyboardInterrupt:
        logger.info('\nShutting down...')
    finally:
        webcam.stop()
        server.close()
        await server.wait_closed()

def orientation_main():
    try:
        logger.info("Starting Flask server on http://localhost:8780")
        app.run(debug=False, host='0.0.0.0', port=8780, threaded=True, use_reloader=False)
    except Exception as e:
        logger.error(f"Failed to start Flask server: {e}")

async def main():
    try:
        # Start Flask in a separate thread
        flask_thread = Thread(target=orientation_main, daemon=True)
        flask_thread.start()
        
        # Give Flask a moment to start
        await asyncio.sleep(1)

        # Run Servo
        servo1_controller.start()
        servo2_controller.start()
        
        # Run WebSocket server
        await webcam_main()
    except KeyboardInterrupt:
        logger.info("Shutting down servers...")
    except Exception as e:
        logger.error(f"Error in main: {e}")
    finally:
        servo1_controller.stop()
        servo2_controller.stop()

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info('\nServer stopped')