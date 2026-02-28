// Define the pin where your EMG sensor is connected
// Matches 'D34' from your original MATLAB script
const int sensorPin = 34; 

void setup() {
  // Start serial communication at 115200 baud
  // This MUST match the 'baudrate' variable in your Python script
  Serial.begin(115200);
  
  // Optional: Add a small delay to let the serial connection stabilize
  delay(1000); 
}

void loop() {
  // Read the raw 12-bit ADC value (0 - 4095)
  int rawValue = analogRead(sensorPin);
  
  // Convert the raw value to Voltage (0.0V - 3.3V)
  // ESP32 ADC reference voltage is 3.3V, and resolution is 12-bit (4095)
  float voltage = rawValue * (3.3 / 4095.0);
  
  // Send the voltage value followed by a newline character (\n)
  Serial.println(voltage);
  
  // Delay slightly to prevent flooding the serial buffer and Python 
  // 5ms = ~200Hz sampling rate, which is generally good for EMG envelopes
  delay(5); 
}