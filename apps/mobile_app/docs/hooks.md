# Hooks

## useBle (`app/hooks/useBle.ts`)

A reusable hook that encapsulates all Bluetooth Low Energy logic. Used by `SessionView` for device connection during workouts. Can also be used by `bletest.tsx` in the future to replace its inline BLE code.

**Returned state:**
| Field | Type | Description |
|-------|------|-------------|
| `bluetoothState` | `State` | Current adapter state (PoweredOn, PoweredOff, etc.) |
| `isScanning` | `boolean` | Whether a scan is in progress |
| `devices` | `ScannedDevice[]` | List of discovered devices |
| `connectedDevice` | `Device \| null` | Currently connected device, or null |
| `connectingId` | `string \| null` | ID of device currently being connected to |
| `isReady` | `boolean` | Shorthand for `bluetoothState === PoweredOn` |

**Returned functions:**
| Function | Description |
|----------|-------------|
| `startScan()` | Requests permissions, starts a 10-second BLE scan |
| `stopScan()` | Stops an active scan early |
| `connect(device)` | Connects to a device, requests 256-byte MTU, discovers services |
| `disconnect()` | Disconnects the current device and cleans up notification subscriptions |
| `reset()` | Convenience: stops scan + disconnects + clears device list |
| `getManager()` | Returns the `BleManager` singleton (lazy-created) |
| `cleanupNotifications()` | Removes all active characteristic notification subscriptions |

**Lifecycle:**
- On mount: creates a `BleManager`, subscribes to adapter state changes
- On unmount: stops scanning, destroys the manager, cleans up subscriptions
- The manager is lazy-created on first use and stored in a ref

**Permissions (Android):**
- API 31+: requests `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `ACCESS_FINE_LOCATION`
- API < 31: requests `ACCESS_FINE_LOCATION` only
- iOS: no runtime permissions needed (handled by Info.plist)

**Exported types:**
- `ScannedDevice` — `{ id, name, rssi, device }`
