// app/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Ionicons } from "@expo/vector-icons";

type CrossIconProps = {
  name:
    | "calendar"
    | "list.bullet.clipboard"
    | "clock.fill"
    | "book.fill"
    | "person.crop.circle.fill";
  focused: boolean;
  color: string;
  size?: number;
};

// iOS: dùng IconSymbol; Android: map sang Ionicons
function CrossIcon({ name, focused, color, size = 28 }: CrossIconProps) {
  if (Platform.OS === "ios") {
    return <IconSymbol size={size} name={name} color={color} />;
  }
  const map: Record<CrossIconProps["name"], keyof typeof Ionicons.glyphMap> = {
    calendar: focused ? "calendar" : "calendar-outline",
    "list.bullet.clipboard": focused ? "clipboard" : "clipboard-outline",
    "clock.fill": focused ? "time" : "time-outline",
    "book.fill": focused ? "book" : "book-outline",
    "person.crop.circle.fill": focused
      ? "person-circle"
      : "person-circle-outline",
  };
  return <Ionicons name={map[name]} size={size} color={color} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        tabBarHideOnKeyboard: true,
        tabBarButton: HapticTab,
        tabBarBackground: Platform.OS === "ios" ? TabBarBackground : undefined,
        tabBarStyle: Platform.select({
          ios: { position: "absolute" },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Lịch phân công",
          tabBarIcon: ({ color, focused }) => (
            <CrossIcon name="calendar" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="assignments"
        options={{
          title: "Trận được giao",
          tabBarIcon: ({ color, focused }) => (
            <CrossIcon
              name="list.bullet.clipboard"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Lịch sử",
          tabBarIcon: ({ color, focused }) => (
            <CrossIcon name="clock.fill" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="rules"
        options={{
          title: "Luật",
          tabBarIcon: ({ color, focused }) => (
            <CrossIcon name="book.fill" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Hồ sơ",
          tabBarIcon: ({ color, focused }) => (
            <CrossIcon
              name="person.crop.circle.fill"
              focused={focused}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
