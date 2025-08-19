from board import ServoBoard
import threading
import time
import queue

class ServoController:
    def __init__(self, board, servo, invert=False, update_rate=100, initial_angle=90, min_angle=-90, max_angle=90):
        self.servo = servo
        self.board = board
        self.board.set_angle(self.servo, initial_angle)
        self.update_rate = update_rate
        self.update_interval = 1.0 / update_rate
        self.invert = invert
        self.initial_angle = initial_angle
        self.min_angle = min_angle
        self.max_angle = max_angle
        
        # Thread control
        self.running = False
        self.thread = None
        self.command_queue = queue.Queue()
        
        # Current state
        self.current_angle = 0.0  # degrees
        self.target_angle = 0.0   # degrees
    
    def start(self):
        """Start the servo control thread"""
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self._control_loop, daemon=True)
            self.thread.start()
            print("Servo controller started")
    
    def stop(self):
        """Stop the servo control thread"""
        self.running = False
        if self.thread:
            self.thread.join()
        print("Servo controller stopped")
    
    def set_target_angle(self, angle):
        """Set target angle (thread-safe)"""
        angle = max(self.min_angle, min(self.max_angle, angle))  # Clamp to valid range
        self.command_queue.put(('set_target', angle))

    def _control_loop(self):
        """Main servo control loop (runs in separate thread)"""
        print("Servo control loop started")
        
        while self.running:
            start_time = time.time()
            
            # Process any pending commands
            try:
                while not self.command_queue.empty():
                    command, value = self.command_queue.get_nowait()
                    if command == 'set_target':
                        self.target_angle = value
                        if self.invert:
                            self.target_angle *= -1.0
                        #print(f"Target angle set to: {self.target_angle}°")
            except queue.Empty:
                pass

            self.current_angle = self.target_angle
            self.board.set_angle(self.servo, self.current_angle + self.initial_angle)

            #direction = 0
            #if self.target_angle > self.current_angle:
            #    direction = min((self.target_angle - self.current_angle) / 2, 1)
            #elif self.target_angle < self.current_angle:
            #    direction = -1 * min((self.current_angle - self.target_angle) / 2, 1)
                
            #if direction != 0:
            #    self.current_angle += direction
            #    self.current_angle = max(-90, min(90, self.current_angle))
                
            #    self.board.set_angle(self.servo, self.current_angle + 90)
                
            # Maintain update rate
            elapsed = time.time() - start_time
            sleep_time = max(0, self.update_interval - elapsed)
            time.sleep(sleep_time)
        
        print("Servo control loop stopped")