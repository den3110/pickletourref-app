import React from "react";
import { ScrollView, View } from "react-native";
import AdminRefereeConsole from "@/components/AdminRefereeConsole";

export default function HomeScreen() {
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 24 , flex: 1}}>
      <AdminRefereeConsole />
      {/* Bạn có thể thêm các section khác phía dưới */}
    </ScrollView>
  );
}
