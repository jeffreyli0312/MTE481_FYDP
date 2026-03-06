// --- 1. Configuration ---
const int sensorPin = 34;          // Matches 'D34' on ESP32
const int windowSize = 20;         // Number of samples for smoothing
const int rawBufferSize = 100;     // Number of samples for DC baseline

// Arrays for circular buffers
float rawBuffer[rawBufferSize] = {0};
float smoothBuffer[windowSize] = {0};

// Indices and running sums for efficient averaging
int rawIndex = 0;
int smoothIndex = 0;
float rawSum = 0;
float smoothSum = 0;

void setup() {
  // Initialize Serial Communication for Python to read
  Serial.begin(115200);
  
  // Optional: Pre-fill the baseline buffer to prevent a drop/spike on startup
  float initialRead = (analogRead(sensorPin) / 4095.0) * 3.3; 
  for (int i = 0; i < rawBufferSize; i++) {
    rawBuffer[i] = initialRead;
    rawSum += initialRead;
  }
}

void loop() {
  // A. Read Data
  // ESP32 ADC is 12-bit (0-4095). Multiply by 3.3 to get voltage.
  int rawADC = analogRead(sensorPin);
  float v_raw = (rawADC / 4095.0) * 3.3; 

  // B. Update Baseline Buffer (Circular Buffer technique)
  rawSum -= rawBuffer[rawIndex];            
  rawBuffer[rawIndex] = v_raw;              
  rawSum += rawBuffer[rawIndex];            
  rawIndex = (rawIndex + 1) % rawBufferSize;
  
  float baseline = rawSum / rawBufferSize;  

  // C. Step 1: Remove DC Offset (High-Pass effect)
  float v_ac = v_raw - baseline;

  // D. Step 2: Rectify (Absolute Value)
  float v_rect = abs(v_ac);

  // E. Step 3: Smooth (Moving Average)
  smoothSum -= smoothBuffer[smoothIndex];
  smoothBuffer[smoothIndex] = v_rect;
  smoothSum += smoothBuffer[smoothIndex];
  smoothIndex = (smoothIndex + 1) % windowSize;
  
  float v_envelope = smoothSum / windowSize;

  // F. Transmit Data to Python (Comma-separated)
  Serial.print(v_raw);
  Serial.print(",");
  Serial.println(v_envelope);

  // Add a small delay to set a stable sampling rate (~100Hz)
  delay(10); 
}