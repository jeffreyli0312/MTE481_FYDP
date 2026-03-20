import React from "react";
import { View, StyleSheet } from "react-native";
import {
  Card,
  Text,
  Button,
  ActivityIndicator,
} from "react-native-paper";
import { Feather } from "@expo/vector-icons";
import { useAppTheme } from "../theme";
import type { useBle } from "../hooks/useBle";

interface DeviceConnectionCardProps {
  ble: ReturnType<typeof useBle>;
}

export default function DeviceConnectionCard({ ble }: DeviceConnectionCardProps) {
  const { colors } = useAppTheme();

  return (
    <Card style={[styles.card, ble.connectedDevice && styles.cardCompact]} mode="outlined">
      <Card.Content style={ble.connectedDevice ? styles.contentCompact : undefined}>
        {ble.connectedDevice ? (
          <View style={styles.connectedRow}>
            <View
              style={[
                styles.dot,
                { backgroundColor: colors.success },
              ]}
            />
            <Feather name="bluetooth" size={14} color={colors.success} />
            <Text variant="bodySmall" style={{ color: colors.onSurface, flex: 1 }}>
              {ble.connectedDevice.name || ble.connectedDevice.id}
            </Text>
            <Button
              mode="text"
              onPress={ble.disconnect}
              compact
              textColor={colors.error}
              style={styles.disconnectBtn}
            >
              Disconnect
            </Button>
          </View>
        ) : (
          <>
            <View style={styles.headerRow}>
              <Text
                variant="titleMedium"
                style={{ color: colors.onSurface, fontWeight: "900" }}
              >
                Device Connection
              </Text>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: colors.error },
                ]}
              />
            </View>
            <Card
              style={[styles.warningCard, { borderColor: colors.warningBorder }]}
              mode="outlined"
            >
              <Card.Content
                style={{ backgroundColor: colors.warningBg, borderRadius: 12 }}
              >
                <Text
                  variant="bodySmall"
                  style={{ color: colors.warningText, textAlign: "center" }}
                >
                  Connect a device to record sensor data.
                </Text>
              </Card.Content>
            </Card>

            <Button
              mode="contained"
              onPress={ble.isScanning ? ble.stopScan : ble.startScan}
              disabled={!ble.isReady || !!ble.connectingId}
              icon={ble.isScanning ? undefined : "magnify"}
              loading={ble.isScanning}
              style={styles.scanBtn}
              buttonColor={colors.primary}
              textColor={colors.onPrimary}
            >
              {ble.isScanning ? "Stop Scan" : "Scan for Devices"}
            </Button>

            {ble.devices.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text
                  variant="labelLarge"
                  style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}
                >
                  Devices ({ble.devices.length})
                </Text>
                {ble.devices.map((item) => {
                  const isConnecting = ble.connectingId === item.id;
                  return (
                    <Card
                      key={item.id}
                      style={[
                        styles.deviceCard,
                        { opacity: isConnecting ? 0.7 : 1 },
                      ]}
                      mode="outlined"
                      onPress={() =>
                        !ble.connectingId && ble.connect(item.device)
                      }
                    >
                      <Card.Content style={styles.deviceContent}>
                        <View style={styles.deviceLeft}>
                          <Feather
                            name="bluetooth"
                            size={16}
                            color={colors.onSurfaceVariant}
                          />
                          <View>
                            <Text
                              variant="bodyMedium"
                              style={{ color: colors.onSurface }}
                            >
                              {item.name || "Unknown"}
                            </Text>
                            {item.rssi != null && (
                              <Text
                                variant="labelSmall"
                                style={{ color: colors.onSurfaceVariant }}
                              >
                                RSSI: {item.rssi}
                              </Text>
                            )}
                          </View>
                        </View>
                        {isConnecting ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        ) : (
                          <Feather
                            name="chevron-right"
                            size={18}
                            color={colors.onSurfaceVariant}
                          />
                        )}
                      </Card.Content>
                    </Card>
                  );
                })}
              </View>
            )}

            {ble.devices.length === 0 && !ble.isScanning && (
              <Text
                variant="bodySmall"
                style={{
                  color: colors.onSurfaceVariant,
                  marginTop: 8,
                  textAlign: "center",
                  fontStyle: "italic",
                }}
              >
                Tap scan to find devices
              </Text>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginBottom: 18,
  },
  cardCompact: {
    marginBottom: 12,
  },
  contentCompact: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  disconnectBtn: {
    marginVertical: -8,
    marginRight: -8,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  warningCard: {
    borderRadius: 12,
    marginBottom: 12,
  },
  scanBtn: {
    borderRadius: 10,
  },
  deviceCard: {
    borderRadius: 12,
    marginBottom: 8,
  },
  deviceContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  deviceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
});
