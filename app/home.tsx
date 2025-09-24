import React from "react";
import { ScrollView, View } from "react-native";
import AdminRefereeConsole from "@/components/AdminRefereeConsole";
import RefereeMatchesPanel from "@/components/RefereeMatchesPanel";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24, flex: 1 }}>
      {/* <AdminRefereeConsole /> */}
      {/* Bạn có thể thêm các section khác phía dưới */}
      <RefereeMatchesPanel
        onPickMatch={(id) => {
          router.push({
            pathname: "/referee-dashboard",
            params: { matchId: id },
          });
        }}
      />
    </ScrollView>
  );
}
