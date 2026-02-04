/*
   Modified for Data Logging
   Outputs: Timestamp (ms), EMG_Envelope
*/

#if defined(ARDUINO) && ARDUINO >= 100
#include "Arduino.h"
#else
#include "WProgram.h"
#endif

#include "EMGFilters.h"

#define SensorInputPin A0   // sensor input pin number

/*
   Set threshold to 0 to log all raw data.
   If you set a threshold, values below it will be logged as 0.
*/
unsigned long threshold = 0; 

EMGFilters myFilter;

// Set sample rate and hum frequency
int sampleRate = 500;
int humFreq = 60; // Change to 60 for US/Canada

void setup()
{
  myFilter.init(sampleRate, humFreq, true, true, true);
  
  // 115200 is a good speed for high frequency data
  Serial.begin(115200); 
  
  // OPTIONAL: Print a header for the text file
  // Serial.println("Time_ms,EMG_Value"); 
}

void loop()
{
  int data = analogRead(SensorInputPin);
  int dataAfterFilter = myFilter.update(data);  // filter processing
  int envelope = sq(dataAfterFilter);   // Get envelope by squaring the input
  
  // Apply threshold logic
  envelope = (envelope > threshold) ? envelope : 0;

  // --- LOGGING CODE START ---
  
  // Print Timestamp
  Serial.print(millis());
  
  // Print Separator (Comma)
  Serial.print(",");
  
  // Print EMG Value and new line
  Serial.println(envelope);
  
  // --- LOGGING CODE END ---

  // Delay to control sampling rate slightly 
  // (delayMicroseconds(500) approximates 2kHz loop, minus overhead)
  delayMicroseconds(500);
}