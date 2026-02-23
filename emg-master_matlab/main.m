% --- 1. Setup Connection ---
clear; clc;

% Connect to the ESP32 using the settings from your screenshot
% If 'a' already exists in the workspace, this line might error, so clear first.
try
    a = arduino('/dev/cu.usbserial-0001', 'ESP32-WROOM-DevKitC', 'Libraries', {'I2C', 'SPI', 'Servo'});
    disp('Connection Successful!');
catch e
    disp('Connection Failed or already open. Try clearing workspace (clear a).');
    rethrow(e);
end

% --- 1. Configuration ---
sensorPin = 'D34'; % Matches the variable in your screenshot workspace
windowSize = 20;   % Number of samples to average (Increase for smoother line, decrease for faster response)

% Initialize buffers for processing
rawBuffer = zeros(1, 100);     % Long buffer to find the DC baseline
smoothBuffer = zeros(1, windowSize); % Short buffer for smoothing

% --- 2. Setup Plot ---
figure('Name', 'EMG Signal Processing');

% Top Plot: Raw Data
subplot(2,1,1);
hRaw = animatedline('Color', [0 0 0]); % Grey for raw
title('Raw Signal');
ylabel('Voltage (V)');
ax1 = gca; 
% ax1.YLim = [-5 5];

% Bottom Plot: Processed Data (The clean one)
subplot(2,1,2);
hSmooth = animatedline('Color', 'r', 'LineWidth', 2); % Red for filtered
title('Filtered & Smoothed (Envelope)');
ylabel('Amplitude');
ax2 = gca; 
% ax2.YLim = [-5 5]; % Adjust scaling as needed

startTime = datetime('now');

disp('Filtering data... Close figure to stop.');

% --- 3. Processing Loop ---
while ishandle(hRaw)
    % A. Read Data
    try
        v_raw = readVoltage(a, sensorPin);
    catch
        break; % Stop if connection is lost
    end

    % B. Update Baseline Buffer (to find the "zero" center)
    rawBuffer = [rawBuffer(2:end), v_raw];
    baseline = mean(rawBuffer); 

    % C. Step 1: Remove DC Offset (High-Pass effect)
    v_ac = v_raw - baseline;

    % D. Step 2: Rectify (Absolute Value)
    v_rect = abs(v_ac);

    % E. Step 3: Smooth (Moving Average)
    smoothBuffer = [smoothBuffer(2:end), v_rect];
    v_envelope = mean(smoothBuffer);

    % F. Plotting
    t = seconds(datetime('now') - startTime);
    
    addpoints(hRaw, t, v_raw);
    addpoints(hSmooth, t, v_envelope);

    % Scroll X-axis (Keep last 10 seconds)
    if t > 10
        ax1.XLim = [t-10, t];
        ax2.XLim = [t-10, t];
    end

    drawnow limitrate;
end