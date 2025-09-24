// app/_layout.tsx (RootLayout)
import "react-native-gesture-handler";
import "react-native-reanimated";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Link, Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import {
  ActivityIndicator,
  View,
  Pressable,
  Text,
  useWindowDimensions,
} from "react-native";
import "react-native-reanimated";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { useColorScheme } from "@/hooks/useColorScheme";
import { setCredentials } from "@/slices/authSlice";
import store from "@/store";
import { loadUserInfo } from "@/utils/authStorage";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Provider } from "react-redux";
import { SocketProvider } from "../context/SocketContext";
import { Buffer } from "buffer";
import { MaterialIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

(global as any).Buffer = (global as any).Buffer || Buffer;

if (__DEV__) {
  require("../dev/reactotron");
  require("../dev/ws-logger");
}

/** Kiểm tra JWT còn hạn không (có leeway 5s) */
function isJwtValid(token?: string | null) {
  if (!token) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payloadStr = Buffer.from(
      parts[1].replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");
    const payload = JSON.parse(payloadStr);
    if (!payload || typeof payload !== "object") return false;
    if (!payload.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp > now + 5;
  } catch {
    return false;
  }
}

function Boot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    (async () => {
      try {
        const cached = await loadUserInfo();
        const valid = isJwtValid(cached?.token);
        if (valid && cached) {
          store.dispatch(setCredentials(cached));
          router.replace("/home");
        } else {
          router.replace("/login");
        }
      } catch (e) {
        console.log(e);
      } finally {
        setReady(true);
      }
    })();
  }, [router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const pathname = usePathname();

  if (!loaded)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );

  return (
    <Provider store={store}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <SocketProvider>
            <Boot>
              <SafeAreaProvider>
                <SafeAreaView
                  style={{ flex: 1 }}
                  edges={["top", "left", "right"]}
                >
                  <ThemeProvider
                    value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
                  >
                    <Stack>
                      <Stack.Screen
                        name="login"
                        options={{ headerShown: false }}
                      />
                      <Stack.Screen
                        name="preview-image"
                        options={{
                          headerShown: false,
                          presentation: "fullScreenModal",
                        }}
                      />

                      {/* HOME: ẩn header khi landscape, hiện khi portrait */}
                      <Stack.Screen
                        name="home"
                        options={{
                          headerShown: !isLandscape,
                          title: "Bảng điều khiển",
                          headerBackVisible: false, // ⬅️ Ẩn nút back
                          headerLeft: () => null, // ⬅️ Chặn hẳn headerLeft
                          headerTitleAlign: "center",
                          headerRight: ({ tintColor }) =>
                            !isLandscape ? (
                              <Link
                                href="/(tabs)/schedule"
                                replace
                                asChild
                                onPress={(e) => {
                                  // Nếu đã ở trong tabs thì không điều hướng nữa
                                  if (pathname?.startsWith("/(tabs)")) {
                                    e.preventDefault();
                                  }
                                }}
                              >
                                <Pressable
                                  style={{
                                    paddingHorizontal: 12,
                                    paddingVertical: 6,
                                    borderRadius: 999,
                                    borderWidth: 1,
                                    borderColor: "#ccc",
                                  }}
                                  android_ripple={{
                                    color: "#ddd",
                                    borderless: true,
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontWeight: "600",
                                      color: tintColor || "#0f172a",
                                    }}
                                  >
                                    Khám phá
                                  </Text>
                                </Pressable>
                              </Link>
                            ) : null,
                        }}
                      />

                      <Stack.Screen name="+not-found" />
                      <Stack.Screen
                        name="referee-dashboard"
                        options={{
                          headerShown: false,
                        }}
                      />

                      {/* TABS: header "Khám phá", không có nút back, có icon bảng điều khiển bên phải */}
                      <Stack.Screen
                        name="(tabs)"
                        options={{
                          headerShown: !isLandscape,
                          title: "Khám phá",
                          headerTitleAlign: "center",
                          headerBackVisible: false, // ⬅️ Ẩn nút back
                          headerLeft: () => null, // ⬅️ Chặn hẳn headerLeft
                          headerRight: ({ tintColor }) =>
                            !isLandscape ? (
                              <Pressable
                                onPress={() => router.push("/home")} // đổi route nếu cần
                                hitSlop={{
                                  top: 8,
                                  bottom: 8,
                                  left: 8,
                                  right: 8,
                                }}
                                android_ripple={{
                                  color: "#ddd",
                                  borderless: true,
                                }}
                                style={{
                                  paddingHorizontal: 8,
                                  paddingVertical: 6,
                                  borderRadius: 999,
                                }}
                              >
                                <MaterialIcons
                                  name="dashboard"
                                  size={22}
                                  color={tintColor || "#0f172a"}
                                />
                              </Pressable>
                            ) : null,
                        }}
                      />
                    </Stack>
                    <StatusBar style="auto" />
                  </ThemeProvider>
                </SafeAreaView>
              </SafeAreaProvider>
            </Boot>
          </SocketProvider>
        </BottomSheetModalProvider>
        <Toast />
      </GestureHandlerRootView>
    </Provider>
  );
}
