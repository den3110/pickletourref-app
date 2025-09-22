// Screen2.jsx
import React, { useCallback, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
  BackHandler,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";

export default function Screen2() {
  const navigation = useNavigation();
  const [open, setOpen] = useState(true); // mở ngay
  console.log(open);
  // Android back: đóng modal => quay lại
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (open) {
          handleClose();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [open])
  );

  const handleClose = () => {
    setOpen(false);
    navigation.goBack(); // quay lại ngay, không để màn “nền”
  };

  return (
    <Modal
      visible={open}
      transparent={false} // full-screen
      presentationStyle="fullScreen" // iOS đảm bảo full
      hardwareAccelerated // Android mượt hơn
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.iconBtn} hitSlop={10}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Xem ảnh</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Body: đặt Image/ImageViewing ở đây */}
        <View style={styles.body}>
          {/* ví dụ placeholder */}
          <View style={styles.placeholder}>
            <Text style={{ color: "#9ca3af" }}>Nội dung ảnh ở đây</Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#000" },
  header: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2937",
    backgroundColor: "#000",
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontWeight: "700",
    color: "#e5e7eb",
    fontSize: 16,
  },
  body: { flex: 1, backgroundColor: "#000" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center" },
});
