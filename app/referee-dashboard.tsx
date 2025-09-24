// screens/RefereeListScreen.jsx
/*
✅ Màn LIST: chỉ hiển thị danh sách trận và điều hướng sang màn CONSOLE.
- Khi chọn 1 trận -> navigate("RefereeConsole", { matchId })
- Mặc định LIST giữ PORTRAIT (không lock gì ở đây)
*/
import RefereeConsoleScreen from "@/components/RefereeConsoleScreen";
import RefereeMatchesPanel from "@/components/RefereeMatchesPanel";
import React from "react";
import { SafeAreaView, View, StyleSheet, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// import RefereeMatchesPanel from "@/pages/referee/RefereeMatchesPanel"; // path của bạn

export default function RefereeListScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={{flex: 1}}>
      <RefereeConsoleScreen />
    </ScrollView>
  );
}

const stylesList = StyleSheet.create({
  container: { flex: 1 },
});
