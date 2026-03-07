import React from "react";
import { View } from "react-native";
import { Card, Text, ActivityIndicator } from "react-native-paper";
import { useAppTheme } from "../theme";

interface ListStateProps {
  loading: boolean;
  error?: string | null;
  empty: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
}

export default function ListState({
  loading,
  error,
  empty,
  emptyMessage = "Nothing here yet.",
  children,
}: ListStateProps) {
  const { colors } = useAppTheme();

  if (loading) {
    return (
      <View style={{ padding: 16, alignItems: "center" }}>
        <ActivityIndicator />
        <Text
          variant="bodySmall"
          style={{ marginTop: 10, color: colors.onSurfaceVariant }}
        >
          Loading...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <Card mode="outlined" style={{ borderRadius: 12, borderColor: colors.error }}>
        <Card.Content>
          <Text variant="bodySmall" style={{ color: colors.error, textAlign: "center" }}>
            {error}
          </Text>
        </Card.Content>
      </Card>
    );
  }

  if (empty) {
    return (
      <Card
        mode="outlined"
        style={{ borderRadius: 12, borderColor: colors.infoBorder }}
      >
        <Card.Content
          style={{ backgroundColor: colors.infoBg, borderRadius: 12 }}
        >
          <Text
            variant="bodySmall"
            style={{ color: colors.infoText, textAlign: "center" }}
          >
            {emptyMessage}
          </Text>
        </Card.Content>
      </Card>
    );
  }

  return <>{children}</>;
}
