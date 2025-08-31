import smbus
import time
from threading import Lock

class ServoBoard:
    CMD_SERVO1 = 0
    CMD_SERVO2 = 1
    CMD_SERVO3 = 2
    CMD_SERVO4 = 3
    # https://www.friendlywire.com/projects/ne555-servo-safe/SG90-datasheet.pdf
    SERVO_MAX_ANGLE = 180
    SERVO_MIN_ANGLE = 0
    # Servo PWM duty cycle in mu sec
    SERVO_MAX_PULSE_WIDTH = 2400
    SERVO_MIN_PULSE_WIDTH = 500
    def __init__(self, addr=0x18):
        self.address = addr
        self.bus=smbus.SMBus(1)
        self.bus.open(1)
        self.mutex = Lock()

    def _write_registers(self, target, value):
        with self.mutex:
            value = int(value)
            data = [value>>8, value&0xff]
            try:
                self.bus.write_i2c_block_data(self.address, target, data)
                time.sleep(0.001)
                self.bus.write_i2c_block_data(self.address, target, data)
                time.sleep(0.001)
                self.bus.write_i2c_block_data(self.address, target, data)
                time.sleep(0.001)
            except Exception as e:
                print('I2C Error :', e)

    def _calculate_pwm(self, value):
        return (self.SERVO_MAX_PULSE_WIDTH - self.SERVO_MIN_PULSE_WIDTH) * ((value - self.SERVO_MIN_ANGLE) / (self.SERVO_MAX_ANGLE - self.SERVO_MIN_ANGLE)) + self.SERVO_MIN_PULSE_WIDTH

    def set_angle(self, target, angle):
        if (angle < self.SERVO_MIN_ANGLE) or (angle > self.SERVO_MAX_ANGLE):
            raise Exception('Invalid angle')
        
        # Dead band-width: 7us -> ~1° resolution
        angle = round(angle)

        pwm = self._calculate_pwm(angle)
        self._write_registers(target, pwm)      