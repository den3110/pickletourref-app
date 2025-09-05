// app/(tabs)/profile.tsx
import { Stack, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";

import { logout as logoutAction } from "@/slices/authSlice";
import {
  useGetProfileQuery,
  useLogoutMutation,
  useUpdateUserMutation,
  useDeleteMeMutation as useDeleteAccountMutation,
} from "@/slices/usersApiSlice";
import { tournamentsApiSlice } from "@/slices/tournamentsApiSlice";

const EMPTY = {
  name: "",
  nickname: "",
  email: "",
  password: "",
};

export default function ProfileScreen() {
  const router = useRouter();
  const dispatch = useDispatch();

  const scheme = useColorScheme() ?? "light";
  const tint = scheme === "dark" ? "#7cc0ff" : "#0a84ff";
  const cardBg = scheme === "dark" ? "#16181c" : "#ffffff";
  const textPrimary = scheme === "dark" ? "#fff" : "#111";
  const textSecondary = scheme === "dark" ? "#c9c9c9" : "#444";
  const border = scheme === "dark" ? "#2e2f33" : "#dfe3ea";

  const userInfo = useSelector((s: any) => s.auth?.userInfo);
  const token = userInfo?.token;

  // Query/mutations (skip khi không có token)
  const {
    data: user,
    isLoading: fetching,
    refetch,
    error,
  } = useGetProfileQuery(undefined, { skip: !token });

  const [updateProfile, { isLoading }] = useUpdateUserMutation();
  const [logoutApiCall] = useLogoutMutation();
  const [deleteAccount, { isLoading: deleting }] = useDeleteAccountMutation();

  // 401 -> auto logout (KHÔNG điều hướng ở đây; handler chung sẽ điều hướng)
  useEffect(() => {
    const status = (error as any)?.status || (error as any)?.originalStatus;
    if (status === 401) {
      dispatch(logoutAction());
      dispatch(tournamentsApiSlice.util.resetApiState());
      router.dismissAll?.();
      router.replace("/login");
    }
  }, [error, dispatch, router]);

  // Form state
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const initialRef = useRef(EMPTY);

  useEffect(() => {
    if (!user) return;
    const init = {
      name: user.name || "",
      nickname: user.nickname || "",
      email: user.email || "",
      password: "",
    };
    initialRef.current = init;
    setForm(init);
  }, [user]);

  const validate = (d: typeof EMPTY) => {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = "Không được bỏ trống";
    else if (d.name.trim().length < 2) e.name = "Tối thiểu 2 ký tự";

    if (!d.nickname.trim()) e.nickname = "Không được bỏ trống";
    else if (d.nickname.trim().length < 2) e.nickname = "Tối thiểu 2 ký tự";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim()))
      e.email = "Email không hợp lệ";

    if (d.password && d.password.length < 6)
      e.password = "Mật khẩu tối thiểu 6 ký tự";

    return e;
  };
  useEffect(() => setErrors(validate(form)), [form]);

  const isDirty = useMemo(
    () =>
      Object.keys(form).some(
        (k) => (form as any)[k] !== (initialRef.current as any)[k]
      ),
    [form]
  );
  const isValid = useMemo(() => !Object.keys(errors).length, [errors]);

  const showErr = (f: keyof typeof EMPTY) => touched[f] && !!errors[f];
  const setField = (name: keyof typeof EMPTY, value: string) =>
    setForm((p) => ({ ...p, [name]: value }));
  const markTouched = (name: keyof typeof EMPTY) =>
    setTouched((t) => ({ ...t, [name]: true }));

  const diff = () => {
    const out: any = { _id: (user as any)?._id };
    (Object.keys(form) as (keyof typeof EMPTY)[]).forEach((k) => {
      if (form[k] !== initialRef.current[k]) out[k] = form[k];
    });
    if (!out.password) delete out.password;
    return out;
  };

  const submit = async () => {
    setTouched({ name: true, nickname: true, email: true, password: true });
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      return Alert.alert("Lỗi", "Vui lòng kiểm tra lại biểu mẫu.");
    }
    if (!isDirty) return Alert.alert("Thông tin", "Chưa có thay đổi.");

    try {
      const payload = diff();
      await updateProfile(payload).unwrap();
      await refetch();
      setTouched({});
      Alert.alert("Thành công", "Đã lưu hồ sơ.");
    } catch (err: any) {
      Alert.alert(
        "Lỗi",
        err?.data?.message || err?.error || "Cập nhật thất bại"
      );
    }
  };

  // ---- Logout ----
  const performLogout = useCallback(async () => {
    try {
      // Nếu có API logout server:
      try {
        await logoutApiCall(undefined).unwrap();
      } catch {}
      dispatch(logoutAction());
      dispatch(tournamentsApiSlice.util.resetApiState());
      router.dismissAll?.();
      router.replace("/login");
    } catch {
      router.replace("/login");
    }
  }, [dispatch, logoutApiCall, router]);

  const confirmLogout = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Bạn có chắc muốn đăng xuất?",
          options: ["Huỷ", "Đăng xuất"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          userInterfaceStyle: scheme,
        },
        (idx) => {
          if (idx === 1) performLogout();
        }
      );
    } else {
      Alert.alert("Đăng xuất", "Bạn có chắc muốn đăng xuất?", [
        { text: "Huỷ", style: "cancel" },
        { text: "Đăng xuất", style: "destructive", onPress: performLogout },
      ]);
    }
  };

  // ---- Delete Account (with action sheet) ----
  const performDelete = useCallback(async () => {
    try {
      await deleteAccount().unwrap();
      dispatch(logoutAction());
      dispatch(tournamentsApiSlice.util.resetApiState());
      router.dismissAll?.();
      router.replace("/login");
      Alert.alert("Thành công", "Tài khoản đã của bạn được xoá.");
    } catch (err: any) {
      Alert.alert("Lỗi", err?.data?.message || "Xoá tài khoản thất bại");
    }
  }, [deleteAccount, dispatch, router]);

  const confirmDeleteAccount = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Xoá tài khoản?",
          message:
            "Thao tác này không thể hoàn tác. Toàn bộ dữ liệu liên quan đến tài khoản sẽ bị xoá.",
          options: ["Huỷ", "Xoá tài khoản"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
          userInterfaceStyle: scheme,
        },
        (idx) => {
          if (idx === 1) performDelete();
        }
      );
    } else {
      Alert.alert(
        "Xoá tài khoản?",
        "Thao tác này không thể hoàn tác. Bạn chắc chắn muốn xoá?",
        [
          { text: "Huỷ", style: "cancel" },
          {
            text: "Xoá tài khoản",
            style: "destructive",
            onPress: performDelete,
          },
        ]
      );
    }
  };

  // Gate auth: nếu chưa có token, không render nội dung (tránh mount query)
  if (!token) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Hồ sơ", headerTitleAlign: "center" }}
        />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text>Vui lòng đăng nhập</Text>
        </View>
      </>
    );
  }

  if (fetching || !user) {
    return (
      <>
        <Stack.Screen
          options={{ title: "Hồ sơ", headerTitleAlign: "center" }}
        />
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Text>Đang tải…</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Hồ sơ", headerTitleAlign: "center" }} />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View
            style={[
              styles.card,
              { backgroundColor: cardBg, borderColor: border },
            ]}
          >
            <Text style={[styles.h1, { color: textPrimary }]}>
              Cập nhật hồ sơ
            </Text>

            <Field
              label="Họ và tên"
              value={form.name}
              onChangeText={(v: string) => setField("name", v)}
              onBlur={() => markTouched("name")}
              error={showErr("name") ? (errors as any).name : ""}
              required
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <Field
              label="Biệt danh"
              value={form.nickname}
              onChangeText={(v: string) => setField("nickname", v)}
              onBlur={() => markTouched("nickname")}
              error={showErr("nickname") ? (errors as any).nickname : ""}
              required
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <Field
              label="Email"
              value={form.email}
              onChangeText={(v: string) => setField("email", v)}
              onBlur={() => markTouched("email")}
              error={showErr("email") ? (errors as any).email : ""}
              keyboardType="email-address"
              required
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />
            <Field
              label="Mật khẩu mới"
              value={form.password}
              onChangeText={(v: string) => setField("password", v)}
              onBlur={() => markTouched("password")}
              error={showErr("password") ? (errors as any).password : ""}
              placeholder="Để trống nếu không đổi"
              secureTextEntry
              border={border}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
            />

            {/* Lưu */}
            <Pressable
              onPress={submit}
              disabled={!isDirty || !isValid || isLoading}
              style={({ pressed }) => [
                styles.btn,
                {
                  backgroundColor:
                    !isDirty || !isValid || isLoading ? "#9aa0a6" : tint,
                },
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={styles.btnTextWhite}>
                {isLoading ? "Đang lưu…" : "Lưu thay đổi"}
              </Text>
            </Pressable>
          </View>

          {/* Logout */}
          <Pressable
            onPress={confirmLogout}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              { borderColor: "#e53935" },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.btnText, { color: "#e53935" }]}>
              Đăng xuất
            </Text>
          </Pressable>

          {/* Xoá tài khoản */}
          <Pressable
            onPress={confirmDeleteAccount}
            disabled={deleting}
            style={({ pressed }) => [
              styles.btn,
              styles.btnOutline,
              {
                borderColor: "#b91c1c",
                marginBottom: 100,
                opacity: deleting ? 0.6 : 1,
              },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.btnText, { color: "#b91c1c" }]}>
              {deleting ? "Đang xoá…" : "Xoá tài khoản"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}

/* ======= Subcomponents ======= */
function Field({
  label,
  value,
  onChangeText,
  onBlur,
  error = "",
  required = false,
  placeholder = "",
  keyboardType = "default",
  secureTextEntry = false,
  maxLength,
  border,
  textPrimary,
  textSecondary,
}: any) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[styles.label, { color: textSecondary }]}>
        {label}
        {required ? " *" : ""}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor="#9aa0a6"
        style={[styles.input, { borderColor: border, color: textPrimary }]}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
      />
      {!!error && <Text style={styles.errText}>{error}</Text>}
    </View>
  );
}

/* ======= Styles ======= */
const styles = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 16, gap: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    gap: 8,
  },
  h1: { fontSize: 18, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.select({ ios: 12, android: 10 }),
    fontSize: 16,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { fontWeight: "700" },
  btnOutline: { borderWidth: 1 },
  btnTextWhite: { color: "#fff", fontWeight: "700" },
  errText: { color: "#e11d48", marginTop: 4, fontSize: 12 },
});
