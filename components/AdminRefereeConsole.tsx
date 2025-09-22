/* eslint-disable react/prop-types */
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  Modal,
  SafeAreaView,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { Image, Image as ExpoImage } from "expo-image";
import ImageViewing from "react-native-image-viewing";
import { MaterialIcons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";
import Ripple from "react-native-material-ripple";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";

import {
  useGetMatchQuery,
  useRefereeIncPointMutation,
  useRefereeSetGameScoreMutation,
  useRefereeSetStatusMutation,
  useRefereeSetWinnerMutation,
  useRefereeNextGameMutation,
  // ⬇️ NEW: APIs liên quan đến sân (đổi theo slice của bạn nếu khác)
  useGetCourtsForMatchQuery,
  useRefereeAssignCourtMutation,
  useRefereeUnassignCourtMutation,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import RefereeMatchesPanel from "./RefereeMatchesPanel";
import { useHeaderHeight } from "@react-navigation/elements";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { normalizeUrl } from "@/utils/normalizeUri";
import { useOrientationUnlock } from "@/hooks/useOrientationUnlock";
import { useOrientationFree } from "@/hooks/useOrientationFree";

/* ===== helpers giữ nguyên tên (rút gọn ở đây cho ngắn) ===== */

export const VI_MATCH_STATUS = {
  all: "Tất cả",
  scheduled: "Chưa xếp",
  queued: "Trong hàng đợi",
  assigned: "Đã gán sân",
  live: "Đang thi đấu",
  finished: "Đã kết thúc",
};
export const getMatchStatusChip = (s) => {
  const c =
    s === "live"
      ? "#f59e0b"
      : s === "assigned"
      ? "#0a84ff"
      : s === "queued"
      ? "#06b6d4"
      : s === "finished"
      ? "#10b981"
      : s === "scheduled"
      ? "#64748b"
      : "#94a3b8";
  return { label: VI_MATCH_STATUS[s] || s || "—", color: c };
};
const isGroupType = (m) =>
  (m?.format || "").toLowerCase() === "group" ||
  (m?.bracket?.type || "").toLowerCase() === "group";
export const displayOrder = (m) => {
  const has = Number.isFinite(Number(m?.order));
  const ord = has ? Number(m.order) : null;
  return ord === null
    ? isGroupType(m)
      ? 1
      : 0
    : isGroupType(m)
    ? ord + 1
    : ord;
};

// Helpers nhỏ
const toInt = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (v == null ? "" : String(v).trim());
const typeOf = (m) => str(m?.bracket?.type || m?.format).toLowerCase();
const bracketOrderOf = (m) =>
  toInt(m?.bracket?.order) ??
  toInt(m?.bracketOrder) ??
  toInt(m?.stageOrder) ??
  toInt(m?.round) ??
  1;
const groupLabelOf = (m) => {
  const gi = toInt(m?.groupIndex);
  if (gi != null) return String(gi);
  const name = str(m?.pool?.name || m?.groupName);
  if (!name) return "?";
  return name.replace(/^bảng\s*/i, "") || "?";
};
const orderInGroupOf = (m) =>
  toInt(m?.orderInGroup) ??
  toInt(m?.groupOrder) ??
  toInt(m?.poolOrder) ??
  toInt(m?.displayOrderInGroup) ??
  toInt(m?.order) ??
  toInt(m?.displayOrder) ??
  0;

export function matchCode(m) {
  const t = typeOf(m);
  const round = toInt(m?.round);
  const ordGlobal = toInt(m?.order) ?? toInt(m?.displayOrder) ?? 0;

  if (
    [
      "knockout",
      "ko",
      "roundElim",
      "roundelim",
      "singleElim",
      "single_elim",
    ].includes(t)
  ) {
    return `R${round ?? "?"}#${ordGlobal?.toString() || "?"}`;
  }
  if (t === "group") {
    const v = bracketOrderOf(m);
    const g = groupLabelOf(m);
    const og = orderInGroupOf(m);
    return `V${v}-B${g}#${parseInt(og) + 1 || "?"}`;
  }
  return `R${round ?? "?"}#${ordGlobal?.toString() || "?"}`;
}

export const poolNote = (m) => {
  const g =
    (m?.format || "").toLowerCase() === "group" ||
    (m?.bracket?.type || "").toLowerCase() === "group";
  if (!g) return "";
  const pool = m?.pool?.name ? `Bảng ${m.pool.name}` : "Vòng bảng";
  const rr = Number.isFinite(Number(m?.rrRound)) ? ` • Lượt ${m.rrRound}` : "";
  return `${pool}${rr}`;
};
const nick = (p) =>
  p?.nickname ||
  p?.nick ||
  p?.shortName ||
  p?.fullName ||
  p?.name ||
  "Chưa có đội";
export function pairLabel(reg, eventType = "double") {
  if (!reg) return "Chưa có đội";
  const p1 = nick(reg.player1 || reg.p1 || reg);
  const p2 = nick(reg.player2 || reg.p2);
  return eventType === "single" || !p2 ? p1 : `${p1} & ${p2}`;
}
const playersOf = (reg, eventType = "double") => {
  if (!reg) return [];
  const et = (eventType || "double").toLowerCase();
  if (et === "single") {
    const u = reg.player1 || reg.p1 || reg.user || reg;
    return u ? [u] : [];
  }
  const p1 =
    reg.player1 ||
    reg.p1 ||
    (Array.isArray(reg.players) ? reg.players[0] : null);
  const p2 =
    reg.player2 ||
    reg.p2 ||
    (Array.isArray(reg.players) ? reg.players[1] : null);
  return [p1, p2].filter(Boolean);
};
const displayNick = (u) =>
  u?.nickname || u?.nick || u?.shortName || u?.fullName || u?.name || "—";
const getCccdImages = (u) => {
  const ci = u?.cccdImages;
  const front =
    (ci && (ci.front || ci.frontUrl)) ||
    u?.cccdFront ||
    (Array.isArray(ci) ? ci[0] : null);
  const back =
    (ci && (ci.back || ci.backUrl)) ||
    u?.cccdBack ||
    (Array.isArray(ci) ? ci[1] : null);
  return { front, back };
};

// ===== NEW: id helper + slot helpers =====
const userIdOf = (u) =>
  String(u?.user?._id || u?.user || u?._id || u?.id || "") || "";

const flipSlot = (n) => (n === 1 ? 2 : 1);
const currentSlotFromBase = (base, teamScore) =>
  teamScore % 2 === 0 ? base : flipSlot(base);

// Tính slot hiện tại cho 1 user theo base + điểm đội
function getCurrentSlotOfUser({
  user,
  teamKey,
  baseA = {},
  baseB = {},
  scoreA = 0,
  scoreB = 0,
}) {
  const uid = userIdOf(user);
  const base = teamKey === "A" ? baseA?.[uid] : baseB?.[uid];
  if (!base) return null;
  const ts = teamKey === "A" ? Number(scoreA || 0) : Number(scoreB || 0);
  return currentSlotFromBase(Number(base), ts);
}

function PlayerLine({
  prefix,
  user,
  onPressInfo,
  slotNow,
  isServer,
  isReceiver,
  onPressSetServer,
}) {
  return (
    <View
      style={[
        styles.row,
        { justifyContent: "center", alignItems: "center", gap: 8 },
      ]}
    >
      {/* Dot trạng thái */}
      <Pressable onPress={() => onPressSetServer?.(user)} hitSlop={8}>
        <View
          style={[
            styles.dotNeutral,
            isServer && styles.dotServer,
            !isServer && isReceiver && styles.dotReceiver,
          ]}
        />
      </Pressable>

      {/* Chip ô hiện tại */}
      <View
        style={[
          styles.chipSoft,
          {
            backgroundColor: "#f8fafc",
            borderWidth: 1,
            borderColor: "#e5e7eb",
            paddingVertical: 2,
            paddingHorizontal: 6,
            borderRadius: 8,
          },
        ]}
      >
        <MaterialIcons name="grid-on" size={12} color="#111827" />
        <Text
          style={{
            marginLeft: 4,
            color: "#0f172a",
            fontWeight: "800",
            fontSize: 11,
          }}
        >
          Ô {slotNow ?? "—"}
        </Text>
      </View>

      {/* Nickname + nút info */}
      <Text style={styles.h5}>{user?.nickname || user?.name || "—"}</Text>
      <Ripple onPress={() => onPressInfo?.(user)} style={styles.iconBtnTiny}>
        <MaterialIcons name="info-outline" size={14} color="#111827" />
        <Text
          style={{
            marginLeft: 4,
            color: "#111827",
            fontWeight: "600",
            fontSize: 11,
          }}
        >
          Xem
        </Text>
      </Ripple>
    </View>
  );
}

function PlayerInfoModal({ visible, onClose, user }) {
  const [openFront, setOpenFront] = useState(false);
  const [openBack, setOpenBack] = useState(false);
  useOrientationFree(visible || openFront || openBack);

  const { front, back } = getCccdImages(user);

  const frontUri = front ? normalizeUrl(front) : null; // ✅ chỉ dùng khi có
  const backUri = back ? normalizeUrl(back) : null;

  const row = (label, value) => (
    <View style={[styles.row, { marginTop: 6 }]}>
      <Text style={{ width: 110, color: "#6b7280" }}>{label}</Text>
      <Text style={{ fontWeight: "700", color: "#0f172a", flexShrink: 1 }}>
        {value || "—"}
      </Text>
    </View>
  );

  const handleOpenFront = () => setOpenFront(true);
  const handleOpenBack = () => setOpenBack(true);
  const handleCloseViewer = async () => {
    setOpenFront(false);
    setOpenBack(false);
  };

  if (!user) return null;

  return (
    <View style={{ flex: 1 }}>
      {/* ❗️Ẩn Modal thông tin khi viewer mở */}
      <Modal
        visible={visible && !openFront && !openBack} // ✅ quan trọng
        transparent
        animationType="fade"
        onRequestClose={onClose}
        supportedOrientations={[
          "portrait",
          "landscape-left",
          "landscape-right",
          "portrait-upside-down",
        ]}
        presentationStyle="overFullScreen"
        statusBarTranslucent // ✅ Android đẹp hơn
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 520 }]}>
            <View style={[styles.rowBetween, { marginBottom: 8 }]}>
              <Text style={styles.h6}>Thông tin VĐV</Text>
              <Ripple onPress={onClose} style={styles.iconBtn}>
                <MaterialIcons name="close" size={18} color="#111827" />
              </Ripple>
            </View>

            {row("Họ tên", user?.name || user?.fullName)}
            {row("Nickname", user?.nickname)}
            {row("Số điện thoại", user?.phone)}
            {row("Số CCCD", user?.cccd)}

            <Text style={[styles.h6, { fontSize: 14, marginTop: 10 }]}>
              Ảnh CCCD
            </Text>
            {frontUri || backUri ? (
              <View style={[styles.row, { gap: 8, marginTop: 8 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.caption}>Mặt trước</Text>
                  {frontUri ? (
                    <Ripple onPress={handleOpenFront}>
                      <ExpoImage
                        source={{ uri: frontUri }}
                        cachePolicy="memory-disk"
                        transition={300}
                        contentFit="cover"
                        style={styles.cccdImg}
                      />
                    </Ripple>
                  ) : (
                    <View
                      style={[
                        styles.cccdImg,
                        styles.centerBox,
                        { backgroundColor: "#f1f5f9" },
                      ]}
                    >
                      <Text style={styles.muted}>Chưa có ảnh</Text>
                    </View>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.caption}>Mặt sau</Text>
                  {backUri ? (
                    <Ripple onPress={handleOpenBack}>
                      <ExpoImage
                        source={{ uri: backUri }}
                        cachePolicy="memory-disk"
                        transition={300}
                        contentFit="cover"
                        style={styles.cccdImg}
                      />
                    </Ripple>
                  ) : (
                    <View
                      style={[
                        styles.cccdImg,
                        styles.centerBox,
                        { backgroundColor: "#f1f5f9" },
                      ]}
                    >
                      <Text style={styles.muted}>Chưa có ảnh</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={[styles.alertInfo, { marginTop: 8 }]}>
                <Text style={styles.alertText}>Chưa có ảnh CCCD.</Text>
              </View>
            )}

            <View style={[styles.rowBetween, { marginTop: 12 }]}>
              <View />
              <Ripple onPress={onClose} style={styles.btnPrimary}>
                <Text style={styles.btnPrimaryText}>Đóng</Text>
              </Ripple>
            </View>
          </View>
        </View>
      </Modal>

      {/* ✅ Viewer chỉ render khi có URI & state bật */}
      {frontUri && (
        <ImageViewing
          images={[{ uri: frontUri }]}
          visible={openFront}
          onRequestClose={handleCloseViewer}
          ImageComponent={ExpoImage}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
          animationType="fade"
          presentationStyle="overFullScreen"
          HeaderComponent={() => (
            <View style={{ paddingTop: 40, paddingHorizontal: 12 }}>
              <TouchableOpacity
                onPress={handleCloseViewer}
                style={{
                  alignSelf: "flex-end",
                  backgroundColor: "rgba(0,0,0,0.4)",
                  padding: 8,
                  borderRadius: 999,
                }}
              >
                <MaterialIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {backUri && (
        <ImageViewing
          images={[{ uri: backUri }]}
          visible={openBack}
          onRequestClose={handleCloseViewer}
          ImageComponent={ExpoImage}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
          animationType="fade"
          presentationStyle="overFullScreen"
          HeaderComponent={() => (
            <View style={{ paddingTop: 40, paddingHorizontal: 12 }}>
              <TouchableOpacity
                onPress={handleCloseViewer}
                style={{
                  alignSelf: "flex-end",
                  backgroundColor: "rgba(0,0,0,0.4)",
                  padding: 8,
                  borderRadius: 999,
                }}
              >
                <MaterialIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const needWins = (bestOf = 3) => Math.floor(bestOf / 2) + 1;
const isGameWin = (a = 0, b = 0, ptw = 11, wbt = true) => {
  const max = Math.max(a, b),
    min = Math.min(a, b);
  if (max < ptw) return false;
  return wbt ? max - min >= 2 : max - min >= 1;
};
function computeEarlyFinalizeScore(
  curA,
  curB,
  { pointsToWin = 11, winByTwo = true },
  winner
) {
  const gap = winByTwo ? 2 : 1;
  if (winner === "A") {
    const base = Math.max(pointsToWin, curA, curB + gap);
    return { a: base, b: Math.min(curB, base - gap) };
  } else {
    const base = Math.max(pointsToWin, curB, curA + gap);
    return { a: Math.min(curA, base - gap), b: base };
  }
}

/* ============ Coin toss (ẩn/hiện) ============ */
function ColorCoinToss({ hidden, onToggle }) {
  const [phase, setPhase] = useState("idle"); // idle|running|done
  const [active, setActive] = useState("blue");
  const [result, setResult] = useState(null);
  const flipRef = useRef(null),
    stopRef = useRef(null),
    startAtRef = useRef(0),
    activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const clearTimers = useCallback(() => {
    if (flipRef.current) {
      clearTimeout(flipRef.current);
      flipRef.current = null;
    }
    if (stopRef.current) {
      clearTimeout(stopRef.current);
      stopRef.current = null;
    }
  }, []);
  useEffect(() => () => clearTimers(), [clearTimers]);
  const tickFlip = useCallback(() => {
    const elapsed = Date.now() - startAtRef.current;
    const delay = Math.round(90 + 700 * Math.min(1, elapsed / 5000));
    setActive((p) => (p === "blue" ? "red" : "blue"));
    flipRef.current = setTimeout(tickFlip, delay);
  }, []);
  const start = useCallback(() => {
    if (phase === "running") return;
    clearTimers();
    setResult(null);
    setPhase("running");
    setActive(Math.random() < 0.5 ? "blue" : "red");
    startAtRef.current = Date.now();
    tickFlip();
    stopRef.current = setTimeout(() => {
      if (flipRef.current) clearTimeout(flipRef.current);
      const finalColor = activeRef.current;
      setPhase("done");
      setResult(finalColor);
      setActive(finalColor);
    }, 5000);
  }, [phase, clearTimers, tickFlip]);
  const reset = useCallback(() => {
    clearTimers();
    setPhase("idle");
    setActive("blue");
    setResult(null);
  }, [clearTimers]);

  if (hidden) {
    return (
      <View style={[styles.card, styles.rowBetween]}>
        <Text style={styles.h6}>Bốc thăm màu</Text>
        <Ripple onPress={onToggle} style={styles.btnOutline}>
          <MaterialIcons name="visibility" size={16} color="#111827" />
          <Text style={styles.btnOutlineText}>Hiện</Text>
        </Ripple>
      </View>
    );
  }

  const barColor =
    phase === "idle" ? "#e5e7eb" : active === "blue" ? "#0a84ff" : "#ef4444";
  const Panel = ({ kind }) => {
    const label = kind === "blue" ? "ĐỘI XANH" : "ĐỘI ĐỎ";
    const borderColor =
      phase === "done" && result === kind
        ? kind === "blue"
          ? "#0a84ff"
          : "#ef4444"
        : "#e5e7eb";
    const pulse =
      phase === "running" && active === kind
        ? { shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8 }
        : null;
    return (
      <View style={[styles.coinPanel, { borderColor }, pulse]}>
        <Text style={styles.coinTitle}>{label}</Text>
        <View
          style={[
            styles.chipSoft,
            {
              backgroundColor: (kind === "blue" ? "#0a84ff" : "#ef4444") + "22",
            },
          ]}
        >
          <Text
            style={{
              color: kind === "blue" ? "#0a84ff" : "#ef4444",
              fontWeight: "700",
            }}
          >
            {label}
          </Text>
        </View>
        {phase === "done" && result === kind && (
          <View
            style={[
              styles.badge,
              { backgroundColor: kind === "blue" ? "#0a84ff" : "#ef4444" },
            ]}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
              KẾT QUẢ
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      <View style={[styles.rowBetween, { marginBottom: 8 }]}>
        <View
          style={[
            styles.topBar,
            { backgroundColor: barColor, flex: 1, marginRight: 10 },
          ]}
        />
        <Ripple onPress={onToggle} style={styles.btnOutline}>
          <MaterialIcons name="visibility-off" size={16} color="#111827" />
          <Text style={styles.btnOutlineText}>Ẩn</Text>
        </Ripple>
      </View>

      <View style={[styles.row, { justifyContent: "center", marginBottom: 8 }]}>
        {phase === "running" && (
          <View style={[styles.chipSoft, { backgroundColor: "#0a84ff11" }]}>
            <Text style={{ color: "#0a84ff" }}>
              Đang bốc thăm: {active === "blue" ? "Đội Xanh" : "Đội Đỏ"}
            </Text>
          </View>
        )}
        {phase === "done" && result && (
          <View
            style={[
              styles.chipSoft,
              {
                backgroundColor:
                  (result === "blue" ? "#0a84ff" : "#ef4444") + "22",
              },
            ]}
          >
            <Text
              style={{
                color: result === "blue" ? "#0a84ff" : "#ef4444",
                fontWeight: "700",
              }}
            >
              KẾT QUẢ: {result === "blue" ? "Đội Xanh" : "Đội Đỏ"}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.rowBetween, { marginBottom: 8 }]}>
        <Text style={styles.h6}>Bốc thăm màu (5s)</Text>
        <View style={styles.row}>
          <Ripple
            onPress={start}
            disabled={phase === "running"}
            style={styles.btnPrimary}
          >
            <MaterialIcons name="casino" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>Bắt đầu</Text>
          </Ripple>
          <Ripple
            onPress={reset}
            disabled={phase === "running"}
            style={[styles.btnOutline, { marginLeft: 8 }]}
          >
            <MaterialIcons name="restart-alt" size={16} color="#111827" />
            <Text style={styles.btnOutlineText}>Reset</Text>
          </Ripple>
        </View>
      </View>

      <View style={[styles.row, { gap: 12 }]}>
        <Panel kind="blue" />
        <Panel kind="red" />
      </View>
    </View>
  );
}

/* ===== FE-only: chọn bên hiển thị Trái/Phải cho đội A/B ===== */
/* ===== FE-only: selector Trái/Phải tối giản ===== */
function CourtSidesSelector({ value, onChange }) {
  const left = value?.left === "B" ? "B" : "A";
  const right = left === "A" ? "B" : "A";

  const swap = () =>
    onChange?.({
      left: right,
      right: left,
    });

  return (
    <View
      style={[styles.row, { gap: 8, flexWrap: "wrap", alignItems: "center" }]}
    >
      <MaterialIcons name="swap-horiz" size={16} color="#111827" />
      <Text style={{ fontWeight: "700", color: "#0f172a" }}>Vị trí sân</Text>

      {/* Hiển thị mapping chỉ đọc */}
      <View style={[styles.row, { gap: 10, alignItems: "center" }]}>
        <Text style={{ color: "#6b7280" }}>Trái:</Text>
        <View
          style={[
            styles.chipSoft,
            {
              backgroundColor: "#f8fafc",
              borderWidth: 1,
              borderColor: "#e5e7eb",
              paddingVertical: 6,
              paddingHorizontal: 10,
            },
          ]}
        >
          <Text style={{ color: "#0f172a", fontWeight: "800", fontSize: 12 }}>
            {left}
          </Text>
        </View>

        <Text style={{ color: "#6b7280" }}>Phải:</Text>
        <View
          style={[
            styles.chipSoft,
            {
              backgroundColor: "#f8fafc",
              borderWidth: 1,
              borderColor: "#e5e7eb",
              paddingVertical: 6,
              paddingHorizontal: 10,
            },
          ]}
        >
          <Text style={{ color: "#0f172a", fontWeight: "800", fontSize: 12 }}>
            {right}
          </Text>
        </View>
      </View>

      {/* Nút đổi trái/phải */}
      <Ripple
        onPress={swap}
        style={[
          styles.btnOutline,
          { paddingVertical: 6, paddingHorizontal: 10 },
        ]}
      >
        <MaterialIcons name="cached" size={14} color="#111827" />
        <Text style={[styles.btnOutlineText, { fontSize: 12 }]}>
          Đổi trái/phải
        </Text>
      </Ripple>
    </View>
  );
}

/* ====== NEW: Modal chọn sân ====== */
function CourtPickerModal({
  visible,
  onClose,
  matchId, // ⬅️ NEW: lấy theo match (tự biết bracket)
  currentCourtId,
  onAssigned,
}) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  // debounce search nhỏ
  const useDebounced = (v, d = 350) => {
    const [s, setS] = useState(v);
    useEffect(() => {
      const t = setTimeout(() => setS(v), d);
      return () => clearTimeout(t);
    }, [v, d]);
    return s;
  };

  const [query, setQuery] = useState("");
  const q = useDebounced(query);
  // useOrientationUnlock(visible);
  const { data, isLoading, error, refetch } = useGetCourtsForMatchQuery(
    { matchId, includeBusy: false },
    { skip: !visible || !matchId }
  );

  const [assignCourt, { isLoading: assigning }] =
    useRefereeAssignCourtMutation();
  const [unassignCourt, { isLoading: unassigning }] =
    useRefereeUnassignCourtMutation();

  const courts = useMemo(() => {
    const arr = data?.items || [];
    if (!q) return arr;
    const canon = (s) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, "");
    const qq = canon(q);
    return arr.filter((c) => canon(c.name).includes(qq));
  }, [data, q]);

  const doAssign = async (courtId) => {
    try {
      await assignCourt({ matchId, courtId }).unwrap();
      onAssigned?.({ courtId });
      onClose?.();
    } catch (e) {
      onAssigned?.({
        error: e?.data?.message || e?.error || "Không thể gán sân",
      });
    }
  };

  const clearAssign = async () => {
    try {
      await unassignCourt({ matchId }).unwrap();
      onAssigned?.({ courtId: null });
      onClose?.();
    } catch (e) {
      onAssigned?.({
        error: e?.data?.message || e?.error || "Không thể bỏ gán sân",
      });
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      // 👇 giữ orientation khi modal mở
      supportedOrientations={[
        "portrait",
        "landscape",
        "landscape-left",
        "landscape-right",
      ]}
      presentationStyle="overFullScreen"
    >
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { maxWidth: 460 }]}>
          <View style={[styles.rowBetween, { marginBottom: 8 }]}>
            <Text style={styles.h6}>Gán sân</Text>
            <Ripple onPress={onClose} style={styles.iconBtn}>
              <MaterialIcons name="close" size={18} color="#111827" />
            </Ripple>
          </View>

          {/* search */}
          {/* <View style={[styles.row, { gap: 8, marginBottom: 8 }]}>
            <View
              style={[
                styles.chipSoft,
                { flex: 1, borderWidth: 1, borderColor: "#e5e7eb" },
              ]}
            >
              <MaterialIcons name="search" size={16} color="#6b7280" />
              <Pressable style={{ flex: 1 }}>
                <Text
                  onPress={() => {}}
                  style={{ color: "#6b7280" }}
                  // TextInput nhẹ: nếu bạn muốn TextInput thực sự, thay component này
                >
                  {query ? query : "Tìm tên sân..."}
                </Text>
              </Pressable>
            </View>
          </View> */}

          {isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator />
            </View>
          ) : error ? (
            <View style={styles.alertError}>
              <Text style={styles.alertText}>
                {error?.data?.message ||
                  error?.error ||
                  "Lỗi tải danh sách sân"}
              </Text>
            </View>
          ) : !(courts || []).length ? (
            <View style={styles.centerBox}>
              <Text>Không có sân khả dụng.</Text>
            </View>
          ) : (
            <View style={{ maxHeight: 360 }}>
              {courts.map((c) => {
                const selected =
                  String(currentCourtId || "") === String(c._id || c.id);
                return (
                  <Ripple
                    key={c._id || c.id}
                    onPress={() => !assigning && doAssign(c._id || c.id)}
                    style={[
                      styles.rowBetween,
                      {
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: "#f1f5f9",
                      },
                    ]}
                  >
                    <View style={[styles.row, { gap: 8 }]}>
                      <MaterialIcons name="stadium" size={18} color="#111827" />
                      <Text style={{ fontWeight: "700", color: "#0f172a" }}>
                        {c.name}
                      </Text>
                    </View>
                    {selected ? (
                      <MaterialIcons
                        name="check-circle"
                        size={18}
                        color="#10b981"
                      />
                    ) : (
                      <MaterialIcons
                        name="chevron-right"
                        size={20}
                        color="#9ca3af"
                      />
                    )}
                  </Ripple>
                );
              })}
            </View>
          )}

          <View style={[styles.rowBetween, { marginTop: 10 }]}>
            <Ripple onPress={clearAssign} style={styles.btnOutline}>
              <MaterialIcons name="block" size={16} color="#111827" />
              <Text style={styles.btnOutlineText}>Bỏ gán sân</Text>
            </Ripple>
            <Ripple onPress={onClose} style={styles.btnPrimary}>
              <Text style={styles.btnPrimaryText}>Đóng</Text>
            </Ripple>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ===================== MAIN ===================== */
export default function AdminRefereeConsole() {
  const navHeaderH = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const kbOffset = Platform.OS === "ios" ? navHeaderH + insets.top : 0;
  const [selectedId, setSelectedId] = useState(null);
  const [infoUser, setInfoUser] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const openUserInfo = (u) => {
    if (!u) return;
    setInfoUser(u);
    setInfoOpen(true);
  };

  const [showCoin, setShowCoin] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(-1);
  const bsRef = useRef(null);
  const snapPoints = useMemo(() => ["45%", "98%"], []);
  const [refreshTick, setRefreshTick] = useState(0);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  useEffect(() => {
    setSheetIndex(selectedId ? 1 : -1);
  }, [selectedId]);

  const {
    data: match,
    isLoading: detailLoading,
    isFetching: detailFetching,
    error: detailErr,
    refetch: refetchDetail,
  } = useGetMatchQuery(selectedId, { skip: !selectedId });

  const [incPoint] = useRefereeIncPointMutation();
  const [setGame] = useRefereeSetGameScoreMutation();
  const [setStatus] = useRefereeSetStatusMutation();
  const [setWinner] = useRefereeSetWinnerMutation();
  const [nextGame] = useRefereeNextGameMutation();
  // FE-only: A ở Trái, B ở Phải (mặc định)
  const [courtSide, setCourtSide] = useState({ left: "A", right: "B" });

  // Reset về mặc định khi chọn trận khác
  useEffect(() => {
    setCourtSide({ left: "A", right: "B" });
  }, [selectedId]);
  const socket = useSocket();
  const [snack, setSnack] = useState({ open: false, type: "success", msg: "" });
  const showSnack = (type, msg) => {
    setSnack({ open: true, type, msg });
    setTimeout(() => setSnack((s) => ({ ...s, open: false })), 2500);
  };

  const [autoNextGame, setAutoNextGame] = useState(false);
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [earlyWinner, setEarlyWinner] = useState("A");
  const [useCurrentScore, setUseCurrentScore] = useState(false);
  // useOrientationUnlock(earlyOpen);

  // ===== ngay trong AdminRefereeConsole =====
  const [serveLocal, setServeLocal] = useState(null);

  // khi match.serve từ server đổi => đồng bộ và xóa optimistic
  useEffect(() => {
    if (match?.serve) setServeLocal(null);
  }, [match?.serve]);

  // giá trị serve dùng để render (local ưu tiên hơn)
  const serveLive = serveLocal ?? match?.serve ?? { side: null, server: null };

  // helper đặt serve có ACK để chỉ refetch khi server confirm
  // helper đặt serve có ACK để chỉ refetch khi server confirm

  const flipSlot = (n) => (n === 1 ? 2 : 1);

  const guessServerId = (sideNorm) => {
    const list = sideNorm === "A" ? playersA : playersB;
    const baseMap = sideNorm === "A" ? baseA : baseB;
    const ids = list.map(userIdOf);
    const idBase1 = ids.find((uid) => Number(baseMap[uid]) === 1);
    return idBase1 || ids[0] || "";
  };

  const guessReceiverId = (sideNorm, srvUid) => {
    if (!srvUid) return "";
    const teamScore = sideNorm === "A" ? Number(curA) : Number(curB);
    const otherScore = sideNorm === "A" ? Number(curB) : Number(curA);
    const baseSrv =
      sideNorm === "A"
        ? Number(baseA[srvUid] || 1)
        : Number(baseB[srvUid] || 1);
    const srvNow = teamScore % 2 === 0 ? baseSrv : flipSlot(baseSrv);

    const otherList = sideNorm === "A" ? playersB : playersA;
    const otherBase = sideNorm === "A" ? baseB : baseA;
    for (const u of otherList) {
      const uid = userIdOf(u);
      const b = Number(otherBase[uid] || 1);
      const now = otherScore % 2 === 0 ? b : flipSlot(b);
      if (now === srvNow) return uid;
    }
    return "";
  };

  const setServeWithAck = useCallback(
    ({ side, server, serverId }) => {
      const sideNorm = side ?? serveLive.side ?? "A";
      const serverNorm = Number(server ?? serveLive.server ?? 2);
      let srvUid = serverId ?? serveLive.serverId;
      if (!srvUid) srvUid = guessServerId(sideNorm); // 👈 đoán ngay để highlight
      const rcvUid = guessReceiverId(sideNorm, srvUid);

      // optimistic: set cả receiverId để dot xanh lam sáng tức thì
      setServeLocal({
        side: sideNorm,
        server: serverNorm,
        serverId: srvUid,
        receiverId: rcvUid,
      });

      // gửi kèm serverId để BE khỏi phải đoán lại
      socket?.emit(
        "serve:set",
        {
          matchId: match._id,
          side: sideNorm,
          server: serverNorm,
          serverId: srvUid,
        },
        (ack) => {
          if (ack?.ok) {
            refetchDetail();
            setServeLocal(null);
          } else {
            setServeLocal(null);
            showSnack("error", ack?.message || "Không đặt được giao bóng");
          }
        }
      );
    },

    [
      socket,
      match?._id,
      serveLive.side,
      serveLive.server,
      serveLive.serverId,
      refetchDetail,
      baseA,
      baseB,
      curA,
      curB,
      playersA,
      playersB,
    ]
  );

  useEffect(() => {
    if (!socket || !selectedId) return;
    socket.emit("match:join", { matchId: selectedId });
    const onPatched = (p) => {
      const id = p?.matchId || p?.data?._id || p?._id;
      if (id === selectedId) {
        refetchDetail();
        const nextStatus =
          p?.status || p?.data?.status || p?.payload?.status || null;
        if (nextStatus === "finished") {
          setRefreshTick((x) => x + 1);
        }
      }
    };
    socket.on("status:updated", onPatched);
    socket.on("winner:updated", onPatched);
    socket.on("match:patched", onPatched);
    socket.on("match:update", onPatched);
    socket.on("match:snapshot", onPatched);
    return () => {
      socket.emit("match:leave", { matchId: selectedId });
      socket.off("status:updated", onPatched);
      socket.off("winner:updated", onPatched);
      socket.off("match:patched", onPatched);
      socket.off("match:update", onPatched);
      socket.off("match:snapshot", onPatched);
    };
  }, [socket, selectedId, refetchDetail]);

  // ===== derived =====
  const rules = match?.rules || {
    bestOf: 3,
    pointsToWin: 11,
    winByTwo: true,
    cap: { mode: "none", points: null },
  };

  const isStartDisabled = match?.status === "live";
  const isFinishDisabled = match?.status === "finished";
  const COLOR_ENABLED = "#111827";
  const COLOR_DISABLED = "#9ca3af";

  const [confirmFinishOpen, setConfirmFinishOpen] = useState(false);
  const openConfirmFinish = () => setConfirmFinishOpen(true);
  const closeConfirmFinish = () => setConfirmFinishOpen(false);

  const capNote = useMemo(() => {
    const mode = String(rules?.cap?.mode || "none");
    const pts = Number(rules?.cap?.points);
    if (mode === "none" || !Number.isFinite(pts)) return "";
    return mode === "hard" ? ` • Cap cứng ${pts}` : ` • Cap mềm ${pts}`;
  }, [rules]);

  const eventType = (match?.tournament?.eventType || "double").toLowerCase();
  const isSingles = eventType === "single",
    isDoubles = !isSingles;
  const gs = match?.gameScores || [];
  const needSetWinsVal = needWins(rules.bestOf);
  const currentIndex = Math.max(0, gs.length - 1);
  const curA = gs[currentIndex]?.a ?? 0;
  const curB = gs[currentIndex]?.b ?? 0;
  const serve = serveLive || { side: "A", server: 2 };
  const callout = isDoubles
    ? serve.side === "A"
      ? `${curA}-${curB}-${serve.server}`
      : `${curB}-${curA}-${serve.server}`
    : "";

  // ===== NEW: chuẩn bị slot hiện tại + server/receiver =====
  const eventTypeLower = (
    match?.tournament?.eventType || "double"
  ).toLowerCase();
  const playersA = playersOf(match?.pairA, eventTypeLower);
  const playersB = playersOf(match?.pairB, eventTypeLower);

  // base từ server (key là userId): match.slots.base.A/B có thể là Object từ Mongo
  const slotsBase = match?.slots?.base || match?.meta?.slots?.base || {};
  const baseA = useMemo(() => {
    const raw = slotsBase?.A || {};
    const out = { ...raw };
    const ids = playersA.map(userIdOf);
    if (ids[0] && !out[ids[0]]) out[ids[0]] = 1;
    if (ids[1] && !out[ids[1]]) out[ids[1]] = 2;
    return out;
  }, [slotsBase?.A, playersA]);
  const baseB = useMemo(() => {
    const raw = slotsBase?.B || {};
    const out = { ...raw };
    const ids = playersB.map(userIdOf);
    if (ids[0] && !out[ids[0]]) out[ids[0]] = 1;
    if (ids[1] && !out[ids[1]]) out[ids[1]] = 2;
    return out;
  }, [slotsBase?.B, playersB]);

  // slot hiện tại (fallback tự tính nếu BE chưa trả slots.last)
  const slotsNowA = {};
  const slotsNowB = {};
  playersA.forEach(
    (u) =>
      (slotsNowA[userIdOf(u)] = getCurrentSlotOfUser({
        user: u,
        teamKey: "A",
        baseA,
        baseB,
        scoreA: curA,
        scoreB: curB,
      }))
  );
  playersB.forEach(
    (u) =>
      (slotsNowB[userIdOf(u)] = getCurrentSlotOfUser({
        user: u,
        teamKey: "B",
        baseA,
        baseB,
        scoreA: curA,
        scoreB: curB,
      }))
  );

  // server/receiver
  const liveServe = serveLocal ?? match?.serve ?? {};
  const serverUid = String(liveServe.serverId || match?.slots?.serverId || "");
  const servingSide = liveServe?.side === "B" ? "B" : "A";
  let receiverUid = String(
    liveServe?.receiverId || match?.slots?.receiverId || ""
  );

  // slot hiện tại của server
  let serverSlotNow = null;
  if (serverUid) {
    serverSlotNow =
      servingSide === "A"
        ? slotsNowA[serverUid] ?? null
        : slotsNowB[serverUid] ?? null;
  }

  // receiver từ server (ưu tiên BE nếu có)
  if (!receiverUid && serverSlotNow) {
    // tìm người đội còn lại đứng cùng số ô
    const other = servingSide === "A" ? playersB : playersA;
    for (const u of other) {
      const uid = userIdOf(u);
      const sNow = servingSide === "A" ? slotsNowB[uid] : slotsNowA[uid];
      if (sNow === serverSlotNow) {
        receiverUid = uid;
        break;
      }
    }
  }

  // handler đặt người giao khi bấm dot cạnh tên
  const setServerByUser = (user, teamKey) => {
    const uid = userIdOf(user);
    if (!uid) return;
    const sideNeed =
      teamKey || (playersA.some((u) => userIdOf(u) === uid) ? "A" : "B");
    setServeWithAck({ side: sideNeed, serverId: uid });
  };
  const gameDone = isGameWin(curA, curB, rules.pointsToWin, rules.winByTwo);
  const aWins = gs.filter(
    (g) => isGameWin(g?.a, g?.b, rules.pointsToWin, rules.winByTwo) && g.a > g.b
  ).length;
  const bWins = gs.filter(
    (g) => isGameWin(g?.a, g?.b, rules.pointsToWin, rules.winByTwo) && g.b > g.a
  ).length;
  const matchPointReached =
    aWins === needSetWinsVal || bWins === needSetWinsVal;

  const [flashA, setFlashA] = useState(false);
  const [flashB, setFlashB] = useState(false);
  const prevRef = useRef({ matchId: null, gi: 0, a: 0, b: 0 });
  useEffect(() => {
    if (!match) return;
    const gi = currentIndex,
      a = curA,
      b = curB;
    if (prevRef.current.matchId === match._id && prevRef.current.gi === gi) {
      if (a > prevRef.current.a) {
        setFlashA(true);
        setTimeout(() => setFlashA(false), 700);
      }
      if (b > prevRef.current.b) {
        setFlashB(true);
        setTimeout(() => setFlashB(false), 700);
      }
    }
    prevRef.current = { matchId: match._id, gi, a, b };
  }, [match?._id, currentIndex, curA, curB]);

  // ===== actions =====
  const onStart = async () => {
    if (!match) return;
    try {
      await setStatus({ matchId: match._id, status: "live" }).unwrap();
      socket?.emit("status:updated", { matchId: match._id, status: "live" });
      socket?.emit("match:started", {
        matchId: match._id,
        autoNext: autoNextGame,
      });

      if (gs.length === 0)
        await setGame({
          matchId: match._id,
          gameIndex: 0,
          a: 0,
          b: 0,
          autoNext: autoNextGame,
        }).unwrap();
    } catch (e) {
      showSnack("error", e?.data?.message || e?.error || "Không thể start");
    }
  };

  const onFinish = async () => {
    if (!match) return;
    let w = match.winner || "";
    if (aWins !== bWins) w = aWins > bWins ? "A" : "B";
    try {
      if (w) await setWinner({ matchId: match._id, winner: w }).unwrap();
      await setStatus({ matchId: match._id, status: "finished" }).unwrap();
      socket?.emit("status:updated", {
        matchId: match._id,
        status: "finished",
        winner: w,
      });
      setRefreshTick((x) => x + 1);
    } catch (e) {
      showSnack("error", e?.data?.message || e?.error || "Không thể finish");
    }
  };

  const onPickWinner = async (w) => {
    if (!match) return;
    try {
      await setWinner({ matchId: match._id, winner: w }).unwrap();
      socket?.emit("winner:updated", { matchId: match._id, winner: w });
      showSnack("success", `Đã đặt winner: ${w || "—"}`);
    } catch (e) {
      showSnack(
        "error",
        e?.data?.message || e?.error || "Không thể đặt winner"
      );
    }
  };

  const inc = async (side) => {
    if (!match || match.status !== "live") return;
    try {
      await incPoint({
        matchId: match._id,
        side,
        delta: +1,
        autoNext: autoNextGame,
      }).unwrap();
      socket?.emit("score:inc", {
        matchId: match._id,
        side,
        delta: +1,
        autoNext: autoNextGame,
      });
      (side === "A" ? setFlashA : setFlashB)(true);
      setTimeout(() => (side === "A" ? setFlashA : setFlashB)(false), 700);
    } catch (e) {
      showSnack("error", e?.data?.message || e?.error || "Không thể cộng điểm");
    }
  };

  const dec = async (side) => {
    if (!match || match.status === "finished") return;
    try {
      await incPoint({
        matchId: match._id,
        side,
        delta: -1,
        autoNext: autoNextGame,
      }).unwrap();
      socket?.emit("score:inc", {
        matchId: match._id,
        side,
        delta: -1,
        autoNext: autoNextGame,
      });
    } catch (e) {
      showSnack("error", e?.data?.message || e?.error || "Không thể trừ điểm");
    }
  };

  const startNextGame = async () => {
    if (!match) return;
    try {
      await nextGame({ matchId: match._id, autoNext: autoNextGame }).unwrap();
      await refetchDetail();
      socket?.emit("match:patched", {
        matchId: match._id,
        autoNext: autoNextGame,
      });
    } catch (e) {
      showSnack(
        e?.status === 409 ? "info" : "error",
        e?.data?.message || e?.error || "Không thể tạo ván mới"
      );
    }
  };

  const onClickStartNext = () => {
    if (!match) return;
    if (autoNextGame) {
      startNextGame();
    } else {
      if (isGameWin(curA, curB, rules.pointsToWin, rules.winByTwo)) {
        startNextGame();
      } else {
        setEarlyWinner("A");
        setUseCurrentScore(false);
        setEarlyOpen(true);
      }
    }
  };

  const confirmEarlyEnd = async () => {
    if (!match) return;
    try {
      if (useCurrentScore) {
        if (curA === curB) {
          showSnack(
            "error",
            "Đang hòa, không thể ghi nhận đúng tỉ số hiện tại."
          );
          return;
        }
        await setGame({
          matchId: match._id,
          gameIndex: currentIndex,
          a: curA,
          b: curB,
          autoNext: autoNextGame,
        }).unwrap();
      } else {
        const winner = curA === curB ? earlyWinner : curA > curB ? "A" : "B";
        const fin = computeEarlyFinalizeScore(curA, curB, rules, winner);
        await setGame({
          matchId: match._id,
          gameIndex: currentIndex,
          a: fin.a,
          b: fin.b,
          autoNext: autoNextGame,
        }).unwrap();
      }
      try {
        await nextGame({ matchId: match._id, autoNext: autoNextGame }).unwrap();
      } catch {}
      socket?.emit("match:patched", {
        matchId: match._id,
        autoNext: autoNextGame,
      });
      setEarlyOpen(false);
      showSnack("success", `Đã chốt ván #${currentIndex + 1}`);
    } catch (e) {
      showSnack(
        "error",
        e?.data?.message || e?.error || "Không thể kết thúc ván sớm"
      );
    }
  };

  const startBtnDisabled = match?.status !== "live";

  const toggleOrientation = async () => {
    try {
      if (isLandscape) {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
      } else {
        await ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.LANDSCAPE
        );
      }
    } catch (e) {
      showSnack("error", "Không thể đổi hướng màn hình");
    }
  };

  const sidePanelMaxW = Math.min(240, Math.max(180, Math.floor(width * 0.22)));
  const scoreFontLandscape = Math.min(
    64,
    Math.max(36, Math.floor(Math.min(width, height) * 0.12))
  );
  const controlFont = 12;
  const compactPadding = 10;

  /* ===== NEW: state & handlers — Court assign ===== */
  const [courtModalOpen, setCourtModalOpen] = useState(false);
  const onAssignedCourt = async ({ courtId, error }) => {
    if (error) {
      showSnack("error", error);
      return;
    }
    await refetchDetail();
    socket?.emit("match:patched", { matchId: match?._id, courtId });
    socket?.emit("court:assigned", { matchId: match?._id, courtId });
    showSnack("success", courtId ? "Đã gán sân" : "Đã bỏ gán sân");
  };

  // man doc
  /* ===== Portrait scoreboard (có chọn bên trái/phải FE-only) ===== */
  const PortraitScoreboard = () => {
    const leftSide = courtSide.left; // 'A' | 'B' (state FE-only)
    const rightSide = courtSide.right; // 'A' | 'B'

    const TeamPanelPortrait = ({ sideKey }) => {
      const isA = sideKey === "A";
      const score = isA ? curA : curB;
      const flash = isA ? flashA : flashB;
      const serveSide = serveLive?.side === sideKey;

      return (
        <View
          style={[
            styles.teamCard,
            serveSide && { borderColor: "#0a84ff", shadowOpacity: 0.15 },
            flash && { borderColor: "#0a84ff" },
          ]}
        >
          <Text style={styles.teamName}>
            {sideKey}){" "}
            {pairLabel(
              isA ? match.pairA : match.pairB,
              (match?.tournament?.eventType || "double").toLowerCase()
            )}
          </Text>

          <View style={styles.scoreRow}>
            <Ripple
              onPress={() => dec(sideKey)}
              disabled={match?.status === "finished"}
            >
              <MaterialIcons name="remove" size={28} color="#111827" />
            </Ripple>

            <Text
              style={[
                styles.bigScore,
                flash && {
                  color: "#0a84ff",
                  textShadowColor: "#0a84ff",
                  textShadowRadius: 6,
                },
              ]}
            >
              {score}
            </Text>

            <Ripple
              onPress={() => inc(sideKey)}
              disabled={
                match?.status !== "live" || matchPointReached || gameDone
              }
            >
              <MaterialIcons name="add" size={28} color="#111827" />
            </Ripple>
          </View>
        </View>
      );
    };

    return (
      <View style={[styles.card, { gap: 12 }]}>
        {/* Hàng trên: A/B theo mapping Trái/Phải */}
        <View style={[styles.row, { gap: 12, alignItems: "stretch" }]}>
          <TeamPanelPortrait sideKey={leftSide} />

          <View className="setBox" style={styles.setBox}>
            <Text style={styles.h6}>SET #{currentIndex + 1 || 1}</Text>
            <Text style={styles.caption}>(cần thắng {needSetWinsVal} set)</Text>
          </View>

          <TeamPanelPortrait sideKey={rightSide} />
        </View>

        {/* FE-only: widget chọn bên Trái/Phải (độc lập sân vật lý/BE) */}
        <CourtSidesSelector value={courtSide} onChange={setCourtSide} />

        {/* Callout & giao bóng (giữ nguyên, chỉ hiện giải đôi) */}
        {eventType !== "single" && (
          <View
            style={[
              styles.row,
              { gap: 8, flexWrap: "wrap", alignItems: "center" },
            ]}
          >
            <View style={[styles.chipSoft, { backgroundColor: "#0a84ff11" }]}>
              <Text style={{ color: "#0a84ff", fontWeight: "700" }}>
                Cách đọc điểm: {callout} (đội giao - đội nhận - người giao)
              </Text>
            </View>

            <View style={[styles.row, { gap: 6, flexWrap: "wrap" }]}>
              <Ripple
                onPress={() => {
                  setServeWithAck({ side: "A" });
                  showSnack("info", "Đã đặt đội giao: A");
                }}
                style={[
                  styles.btnOutline,
                  { paddingVertical: 6 },
                  serveLive.side === "A" && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    { fontSize: 12 },
                    serveLive.side === "A" && styles.btnOutlineTextActive,
                  ]}
                >
                  Giao: A
                </Text>
              </Ripple>

              <Ripple
                onPress={() => {
                  setServeWithAck({ side: "B" });
                  showSnack("info", "Đã đặt đội giao: B");
                }}
                style={[
                  styles.btnOutline,
                  { paddingVertical: 6 },
                  serveLive.side === "B" && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    { fontSize: 12 },
                    serveLive.side === "B" && styles.btnOutlineTextActive,
                  ]}
                >
                  Giao: B
                </Text>
              </Ripple>

              <Ripple
                onPress={() => {
                  setServeWithAck({ server: 1 });
                  showSnack("info", "Đã đặt người giao: #1");
                }}
                style={[
                  styles.btnOutline,
                  { paddingVertical: 6 },
                  Number(serveLive.server) === 1 && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    { fontSize: 12 },
                    Number(serveLive.server) === 1 &&
                      styles.btnOutlineTextActive,
                  ]}
                >
                  Người #1
                </Text>
              </Ripple>

              <Ripple
                onPress={() => {
                  setServeWithAck({ server: 2 });
                  showSnack("info", "Đã đặt người giao: #2");
                }}
                style={[
                  styles.btnOutline,
                  { paddingVertical: 6 },
                  Number(serveLive.server) === 2 && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    { fontSize: 12 },
                    Number(serveLive.server) === 2 &&
                      styles.btnOutlineTextActive,
                  ]}
                >
                  Người #2
                </Text>
              </Ripple>
            </View>
          </View>
        )}

        {/* Tỷ số từng ván */}
        <View
          style={[
            styles.row,
            { gap: 8, flexWrap: "wrap", alignItems: "center" },
          ]}
        >
          <MaterialIcons name="sports-score" size={16} color="#111827" />
          <Text style={{ fontWeight: "700" }}>Tỷ số từng ván</Text>
          {Array.from({ length: Math.max(gs.length, rules.bestOf) }).map(
            (_, i) => {
              const a = gs[i]?.a,
                b = gs[i]?.b;
              const done = isGameWin(a, b, rules.pointsToWin, rules.winByTwo);
              const capped = !!gs[i]?.capped;
              const lbl =
                typeof a === "number" && typeof b === "number"
                  ? `#${i + 1} ${a}-${b}${capped ? " (cap)" : ""}`
                  : `#${i + 1} —`;
              return (
                <View
                  key={i}
                  style={[
                    styles.chipSoft,
                    {
                      backgroundColor: done ? "#10b98122" : "#e5e7eb",
                      borderWidth: done ? 0 : 1,
                      borderColor: "#e5e7eb",
                    },
                  ]}
                >
                  <Text style={{ color: "#111827" }}>{lbl}</Text>
                </View>
              );
            }
          )}
        </View>

        {/* Điều khiển ván + sân vật lý (chip tên sân) + hành động */}
        <View
          style={[
            styles.row,
            { gap: 12, alignItems: "center", flexWrap: "wrap" },
          ]}
        >
          <View style={[styles.row, { gap: 8, alignItems: "center" }]}>
            <Switch value={autoNextGame} onValueChange={setAutoNextGame} />
            <Text>Tự động sang ván tiếp theo khi ván hiện tại kết thúc</Text>
          </View>

          {/* Chip sân vật lý (từ server) */}
          {!!(match?.court?.name || match?.courtName) && (
            <View
              style={[
                styles.chipSoft,
                {
                  backgroundColor: "#f8fafc",
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                },
              ]}
            >
              <MaterialIcons name="stadium" size={16} color="#111827" />
              <Text
                style={{ marginLeft: 6, fontWeight: "700", color: "#0f172a" }}
              >
                {match?.court?.name || match?.courtName}
              </Text>
            </View>
          )}

          <Ripple
            onPress={onClickStartNext}
            disabled={startBtnDisabled || match?.status === "finished"}
            style={[
              styles.btnPrimary,
              (startBtnDisabled || match?.status === "finished") &&
                styles.btnDisabled,
            ]}
          >
            <Text style={styles.btnPrimaryText}>Bắt đầu ván tiếp theo</Text>
          </Ripple>

          <Ripple
            onPress={openConfirmFinish}
            disabled={match?.status === "finished"}
            style={[
              styles.btnSuccess,
              match?.status === "finished" && styles.btnDisabled,
              { marginLeft: 4 },
            ]}
          >
            <Text style={styles.btnSuccessText}>Kết thúc trận</Text>
          </Ripple>

          {/* Nếu muốn bật modal gán sân vật lý ngay tại đây thì mở comment dưới: */}
          {/*
        <Ripple onPress={() => setCourtModalOpen(true)} style={styles.btnOutline}>
          <MaterialIcons name="edit-location" size={16} color="#111827" />
          <Text style={styles.btnOutlineText}>
            {match?.court ? "Đổi sân" : "Gán sân"}
          </Text>
        </Ripple>
        */}
        </View>
      </View>
    );
  };

  // man ngang
  /* ===== Landscape scoreboard (có chọn bên trái/phải FE-only, giữ sân vật lý) ===== */
  /* ===== Landscape scoreboard (nút to, tròn; score trong badge tròn; căn giữa) ===== */
  const LandscapeScoreboard = () => {
    const leftSide = courtSide.left; // 'A' | 'B'
    const rightSide = courtSide.right; // 'A' | 'B'

    const TeamPanelLandscape = ({ sideKey }) => {
      const isA = sideKey === "A";
      const score = isA ? curA : curB;
      const flash = isA ? flashA : flashB;
      const serveSide = serveLive?.side === sideKey;

      // Kích thước nút & badge
      const BTN = Math.max(
        64,
        Math.min(92, Math.round(scoreFontLandscape * 0.95))
      );
      const ICON = Math.round(BTN * 0.48);
      const SCORE_D = Math.max(
        110,
        Math.min(150, Math.round(scoreFontLandscape * 1.7))
      );

      const circleBtnStyle = {
        width: BTN,
        height: BTN,
        borderRadius: BTN / 2,
        backgroundColor: "#f8fafc",
        borderWidth: 2,
        borderColor: "#e5e7eb",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
      };

      const scoreCircleStyle = {
        width: SCORE_D,
        height: SCORE_D,
        borderRadius: SCORE_D / 2,
        backgroundColor: "#fff",
        borderWidth: 3,
        borderColor: "#e5e7eb",
        alignItems: "center",
        justifyContent: "center",
        marginVertical: 8,
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
      };

      const decDisabled = match?.status === "finished";
      const incDisabled =
        match?.status !== "live" || matchPointReached || gameDone;

      return (
        <View
          style={[
            styles.teamCard,
            { maxWidth: sidePanelMaxW, padding: compactPadding },
            serveSide && { borderColor: "#0a84ff", shadowOpacity: 0.15 },
            flash && { borderColor: "#0a84ff" },
          ]}
        >
          <Text
            style={[
              styles.teamName,
              {
                marginBottom: 8,
                fontSize: 13,
                lineHeight: 16,
                textAlign: "center",
              },
            ]}
            numberOfLines={2}
          >
            {sideKey}){" "}
            {pairLabel(
              isA ? match.pairA : match.pairB,
              (match?.tournament?.eventType || "double").toLowerCase()
            )}
          </Text>

          {/* Cụm điều khiển căn giữa: + ở TRÊN, điểm ở GIỮA, − ở DƯỚI */}
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 6,
            }}
          >
            {/* Nút cộng (trên) */}
            <Ripple
              onPress={() => inc(sideKey)}
              disabled={incDisabled}
              rippleContainerBorderRadius={BTN / 2}
              style={[circleBtnStyle, incDisabled && { opacity: 0.45 }]}
            >
              <MaterialIcons name="add" size={ICON} color="#111827" />
            </Ripple>

            {/* Badge tròn hiển thị điểm (giữa) */}
            <View
              style={[scoreCircleStyle, flash && { borderColor: "#0a84ff" }]}
            >
              <Text
                style={[
                  styles.bigScore,
                  {
                    fontSize: scoreFontLandscape,
                    lineHeight: scoreFontLandscape + 2,
                  },
                  flash && {
                    color: "#0a84ff",
                    textShadowColor: "#0a84ff",
                    textShadowRadius: 6,
                  },
                ]}
              >
                {score}
              </Text>
            </View>

            {/* Nút trừ (dưới) */}
            <Ripple
              onPress={() => dec(sideKey)}
              disabled={decDisabled}
              rippleContainerBorderRadius={BTN / 2}
              style={[circleBtnStyle, decDisabled && { opacity: 0.45 }]}
            >
              <MaterialIcons name="remove" size={ICON} color="#111827" />
            </Ripple>
          </View>
        </View>
      );
    };

    return (
      <View style={[styles.card, { gap: 8, padding: compactPadding }]}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "stretch" }}>
          {/* BÊN TRÁI (mapping FE-only) */}
          <TeamPanelLandscape sideKey={leftSide} />

          {/* TRUNG TÂM (giữ nguyên nội dung cũ: status, pool, sân vật lý, selector trái/phải, luật, tỷ số set, điều khiển, callout...) */}
          <View
            style={[
              styles.teamCard,
              {
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: compactPadding,
              },
            ]}
          >
            <Text style={[styles.h6, { fontSize: 18 }]} numberOfLines={1}>
              {match?.tournament?.name} • Nhánh {match?.bracket?.name} (
              {match?.bracket?.type})
            </Text>
            <Text style={[styles.caption, { fontSize: 11 }]} numberOfLines={1}>
              Giai đoạn {match?.bracket?.stage} • Ván {match?.round} • Trận #
              {displayOrder(match)}
            </Text>

            {/* chips: status, pool */}
            <View
              style={{
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
                marginTop: 2,
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              <View
                style={[
                  styles.chipSoft,
                  {
                    backgroundColor:
                      getMatchStatusChip(match?.status).color + "22",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  },
                ]}
              >
                <Text
                  style={{
                    color: getMatchStatusChip(match?.status).color,
                    fontWeight: "700",
                    fontSize: controlFont,
                  }}
                >
                  {getMatchStatusChip(match?.status).label}
                </Text>
              </View>

              {!!poolNote(match) && (
                <View
                  style={[
                    styles.chipSoft,
                    { backgroundColor: "#06b6d422", paddingVertical: 2 },
                  ]}
                >
                  <MaterialIcons name="grid-view" size={14} color="#06b6d4" />
                  <Text
                    style={{
                      marginLeft: 4,
                      color: "#06b6d4",
                      fontWeight: "600",
                      fontSize: controlFont,
                    }}
                  >
                    {poolNote(match)}
                  </Text>
                </View>
              )}

              {!!(match?.court?.name || match?.courtName) && (
                <View
                  style={[
                    styles.chipSoft,
                    {
                      backgroundColor: "#f8fafc",
                      borderWidth: 1,
                      borderColor: "#e5e7eb",
                      paddingVertical: 2,
                    },
                  ]}
                >
                  <MaterialIcons name="stadium" size={14} color="#111827" />
                  <Text
                    style={{
                      marginLeft: 4,
                      color: "#0f172a",
                      fontWeight: "700",
                      fontSize: controlFont,
                    }}
                  >
                    {match?.court?.name || match?.courtName}
                  </Text>
                </View>
              )}

              <Ripple
                onPress={() => setCourtModalOpen(true)}
                style={[
                  styles.btnOutline,
                  { paddingVertical: 4, paddingHorizontal: 8 },
                ]}
              >
                <MaterialIcons name="edit-location" size={14} color="#111827" />
                <Text
                  style={[styles.btnOutlineText, { fontSize: controlFont }]}
                >
                  {match?.court ? "Đổi sân" : "Gán sân"}
                </Text>
              </Ripple>
            </View>

            {/* FE-only: chọn Trái/Bải (chỉ đọc + nút đổi) */}
            <View style={{ marginTop: 6 }}>
              <CourtSidesSelector value={courtSide} onChange={setCourtSide} />
            </View>

            <Text style={[styles.caption, { marginTop: 2, fontSize: 11 }]}>
              Thắng {Math.ceil(rules.bestOf / 2)}/{rules.bestOf} ván • Tới{" "}
              {rules.pointsToWin} điểm{" "}
              {rules.winByTwo ? "(hơn 2 điểm)" : "(không cần hơn 2 điểm)"}
              {capNote}
            </Text>

            {/* Tỷ số từng ván */}
            <View
              style={[
                styles.row,
                {
                  gap: 6,
                  flexWrap: "wrap",
                  justifyContent: "center",
                  marginTop: 6,
                },
              ]}
            >
              <MaterialIcons name="sports-score" size={14} color="#111827" />
              <Text style={{ fontWeight: "700", fontSize: controlFont + 1 }}>
                Tỷ số từng ván
              </Text>
              {Array.from({ length: Math.max(gs.length, rules.bestOf) }).map(
                (_, i) => {
                  const a = gs[i]?.a,
                    b = gs[i]?.b;
                  const done = isGameWin(
                    a,
                    b,
                    rules.pointsToWin,
                    rules.winByTwo
                  );
                  const capped = !!gs[i]?.capped;
                  const lbl =
                    typeof a === "number" && typeof b === "number"
                      ? `#${i + 1} ${a}-${b}${capped ? " (cap)" : ""}`
                      : `#${i + 1} —`;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.chipSoft,
                        {
                          backgroundColor: done ? "#10b98122" : "#e5e7eb",
                          borderWidth: done ? 0 : 1,
                          borderColor: "#e5e7eb",
                          paddingVertical: 2,
                          paddingHorizontal: 6,
                        },
                      ]}
                    >
                      <Text style={{ color: "#111827", fontSize: controlFont }}>
                        {lbl}
                      </Text>
                    </View>
                  );
                }
              )}
            </View>

            {/* Điều khiển ván */}
            <View
              style={[
                styles.row,
                {
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: 6,
                  justifyContent: "center",
                },
              ]}
            >
              <View style={[styles.row, { gap: 6, alignItems: "center" }]}>
                <Switch value={autoNextGame} onValueChange={setAutoNextGame} />
                <Text style={{ fontSize: controlFont + 1 }}>
                  Tự động sang ván tiếp theo
                </Text>
              </View>

              <Ripple
                onPress={onClickStartNext}
                disabled={startBtnDisabled || match?.status === "finished"}
                style={[
                  styles.btnPrimary,
                  { paddingVertical: 6, paddingHorizontal: 10 },
                  (startBtnDisabled || match?.status === "finished") &&
                    styles.btnDisabled,
                ]}
              >
                <Text
                  style={[styles.btnPrimaryText, { fontSize: controlFont + 1 }]}
                >
                  Bắt đầu ván tiếp theo
                </Text>
              </Ripple>

              <Ripple
                onPress={openConfirmFinish}
                disabled={match?.status === "finished"}
                style={[
                  styles.btnSuccess,
                  { paddingVertical: 6, paddingHorizontal: 10 },
                  match?.status === "finished" && styles.btnDisabled,
                ]}
              >
                <Text
                  style={[styles.btnSuccessText, { fontSize: controlFont + 1 }]}
                >
                  Kết thúc trận
                </Text>
              </Ripple>
            </View>

            {/* Callout & giao bóng — chỉ hiện giải đôi */}
            {eventType !== "single" && (
              <View
                style={[
                  styles.row,
                  {
                    gap: 6,
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 6,
                  },
                ]}
              >
                <View
                  style={[
                    styles.chipSoft,
                    { backgroundColor: "#0a84ff11", paddingVertical: 2 },
                  ]}
                >
                  <Text
                    style={{
                      color: "#0a84ff",
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    Cách đọc: {callout}
                  </Text>
                </View>

                <View
                  style={[
                    styles.row,
                    { gap: 6, flexWrap: "wrap", justifyContent: "center" },
                  ]}
                >
                  <Ripple
                    onPress={() => {
                      setServeWithAck({ side: "A" });
                      showSnack("info", "Đã đặt đội giao: A");
                    }}
                    style={[
                      styles.btnOutline,
                      { paddingVertical: 6 },
                      serveLive.side === "A" && styles.btnOutlineActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnOutlineText,
                        { fontSize: 12 },
                        serveLive.side === "A" && styles.btnOutlineTextActive,
                      ]}
                    >
                      Giao: A
                    </Text>
                  </Ripple>

                  <Ripple
                    onPress={() => {
                      setServeWithAck({ side: "B" });
                      showSnack("info", "Đã đặt đội giao: B");
                    }}
                    style={[
                      styles.btnOutline,
                      { paddingVertical: 6 },
                      serveLive.side === "B" && styles.btnOutlineActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnOutlineText,
                        { fontSize: 12 },
                        serveLive.side === "B" && styles.btnOutlineTextActive,
                      ]}
                    >
                      Giao: B
                    </Text>
                  </Ripple>

                  <Ripple
                    onPress={() => {
                      setServeWithAck({ server: 1 });
                      showSnack("info", "Đã đặt người giao: #1");
                    }}
                    style={[
                      styles.btnOutline,
                      { paddingVertical: 6 },
                      Number(serveLive.server) === 1 && styles.btnOutlineActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnOutlineText,
                        { fontSize: 12 },
                        Number(serveLive.server) === 1 &&
                          styles.btnOutlineTextActive,
                      ]}
                    >
                      Người #1
                    </Text>
                  </Ripple>

                  <Ripple
                    onPress={() => {
                      setServeWithAck({ server: 2 });
                      showSnack("info", "Đã đặt người giao: #2");
                    }}
                    style={[
                      styles.btnOutline,
                      { paddingVertical: 6 },
                      Number(serveLive.server) === 2 && styles.btnOutlineActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnOutlineText,
                        { fontSize: 12 },
                        Number(serveLive.server) === 2 &&
                          styles.btnOutlineTextActive,
                      ]}
                    >
                      Người #2
                    </Text>
                  </Ripple>
                </View>
              </View>
            )}
          </View>

          {/* BÊN PHẢI (mapping FE-only) */}
          <TeamPanelLandscape sideKey={rightSide} />
        </View>
      </View>
    );
  };

  // ===== NEW: Base slot setup modal =====
  const [baseModalOpen, setBaseModalOpen] = useState(false);

  function BaseSlotsModal({ visible, onClose }) {
    const [sideServe, setSideServe] = useState(servingSide || "A");
    const [serverNum, setServerNum] = useState(2); // 0-0-2 mặc định
    // clone base hiện có làm state tạm
    const [baseLocalA, setBaseLocalA] = useState(() => ({ ...baseA }));
    const [baseLocalB, setBaseLocalB] = useState(() => ({ ...baseB }));

    useEffect(() => {
      if (visible) {
        setSideServe(servingSide || "A");
        setServerNum(2);
        setBaseLocalA({ ...baseA });
        setBaseLocalB({ ...baseB });
      }
    }, [visible]);

    const setSlot = (team, uid, val) => {
      const set = team === "A" ? setBaseLocalA : setBaseLocalB;
      set((prev) => ({ ...prev, [uid]: val }));
    };

    const ensureValid = (list, obj) => {
      // mỗi team phải có đúng một Ô1 và một Ô2 (nếu đôi)
      if (list.length <= 1) return true;
      const vals = list.map((u) => obj[userIdOf(u)]).filter(Boolean);
      const c1 = vals.filter((v) => v === 1).length;
      const c2 = vals.filter((v) => v === 2).length;
      return c1 === 1 && c2 === 1;
    };

    const onSave = () => {
      try {
        const okA = ensureValid(playersA, baseLocalA);
        const okB = ensureValid(playersB, baseLocalB);
        if (!okA || !okB) {
          showSnack("error", "Mỗi đội phải có 1 người Ô1 và 1 người Ô2.");
          return;
        }
        // serverId = người ở Ô1 của sideServe theo parity hiện tại (điểm 0 => chẵn)
        const list = sideServe === "A" ? playersA : playersB;
        let chooseServer = null;
        for (const u of list) {
          const uid = userIdOf(u);
          const val = (sideServe === "A" ? baseLocalA : baseLocalB)[uid];
          if (val === 1) {
            chooseServer = uid;
            break;
          }
        }
        if (!chooseServer) {
          showSnack("error", "Không tìm thấy người Ô1 ở đội giao.");
          return;
        }

        // Gửi socket set base + serve
        socket?.emit(
          "slots:setBase",
          {
            matchId: match._id,
            base: { A: baseLocalA, B: baseLocalB },
          },
          (ack1) => {
            if (!ack1?.ok) {
              showSnack("error", ack1?.message || "Không lưu được ô gốc");
              return;
            }
            socket?.emit(
              "serve:set",
              {
                matchId: match._id,
                side: sideServe,
                server: serverNum, // 0-0-2
                serverId: chooseServer,
              },
              (ack2) => {
                if (ack2?.ok) {
                  refetchDetail();
                  showSnack("success", "Đã lưu ô & người phát đầu.");
                } else {
                  showSnack("error", ack2?.message || "Không đặt người phát");
                }
              }
            );
          }
        );
      } catch (e) {
        console.log(e);
      }
    };

    const RenderTeam = ({ teamKey, list, base, setBase }) => (
      <View style={{ flex: 1 }}>
        <Text style={[styles.h6, { marginBottom: 6 }]}>Đội {teamKey}</Text>
        {list.length ? (
          list.map((u) => {
            const uid = userIdOf(u);
            const cur = Number(base[uid] || 0);
            return (
              <View
                key={uid}
                style={[styles.rowBetween, { paddingVertical: 6, gap: 8 }]}
              >
                <Text style={{ fontWeight: "700", color: "#0f172a" }}>
                  {displayNick(u)}
                </Text>
                <View style={[styles.row, { gap: 6 }]}>
                  <Ripple
                    onPress={() => setBase(uid, 1)}
                    style={[
                      styles.btnOutline,
                      { paddingVertical: 4, paddingHorizontal: 10 },
                      cur === 1 && styles.btnOutlineActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnOutlineText,
                        { fontSize: 12 },
                        cur === 1 && styles.btnOutlineTextActive,
                      ]}
                    >
                      Ô 1
                    </Text>
                  </Ripple>
                  <Ripple
                    onPress={() => setBase(uid, 2)}
                    style={[
                      styles.btnOutline,
                      { paddingVertical: 4, paddingHorizontal: 10 },
                      cur === 2 && styles.btnOutlineActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.btnOutlineText,
                        { fontSize: 12 },
                        cur === 2 && styles.btnOutlineTextActive,
                      ]}
                    >
                      Ô 2
                    </Text>
                  </Ripple>
                </View>
              </View>
            );
          })
        ) : (
          <Text className="caption">—</Text>
        )}
      </View>
    );

    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onClose}
        supportedOrientations={[
          "portrait",
          "landscape",
          "landscape-left",
          "landscape-right",
        ]}
        presentationStyle="overFullScreen"
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxWidth: 560 }]}>
            <View style={[styles.rowBetween, { marginBottom: 8 }]}>
              <Text style={styles.h6}>Thiết lập Ô (1/2) & Người phát đầu</Text>
              <Ripple onPress={onClose} style={styles.iconBtn}>
                <MaterialIcons name="close" size={18} color="#111827" />
              </Ripple>
            </View>

            <View style={[styles.row, { gap: 12, alignItems: "flex-start" }]}>
              <RenderTeam
                teamKey="A"
                list={playersA}
                base={baseLocalA}
                setBase={(uid, val) => setSlot("A", uid, val)}
              />
              <RenderTeam
                teamKey="B"
                list={playersB}
                base={baseLocalB}
                setBase={(uid, val) => setSlot("B", uid, val)}
              />
            </View>

            <View
              style={[styles.row, { gap: 8, marginTop: 12, flexWrap: "wrap" }]}
            >
              <Text style={{ fontWeight: "700" }}>Đội giao đầu:</Text>
              <Ripple
                onPress={() => setSideServe("A")}
                style={[
                  styles.btnOutline,
                  sideServe === "A" && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    sideServe === "A" && styles.btnOutlineTextActive,
                  ]}
                >
                  A
                </Text>
              </Ripple>
              <Ripple
                onPress={() => setSideServe("B")}
                style={[
                  styles.btnOutline,
                  sideServe === "B" && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    sideServe === "B" && styles.btnOutlineTextActive,
                  ]}
                >
                  B
                </Text>
              </Ripple>

              <Text style={{ marginLeft: 8, color: "#6b7280" }}>
                Số người giao:
              </Text>
              <Ripple
                onPress={() => setServerNum(1)}
                style={[
                  styles.btnOutline,
                  serverNum === 1 && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    serverNum === 1 && styles.btnOutlineTextActive,
                  ]}
                >
                  #1
                </Text>
              </Ripple>
              <Ripple
                onPress={() => setServerNum(2)}
                style={[
                  styles.btnOutline,
                  serverNum === 2 && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    serverNum === 2 && styles.btnOutlineTextActive,
                  ]}
                >
                  #2 (0-0-2)
                </Text>
              </Ripple>
            </View>

            <View style={[styles.rowBetween, { marginTop: 12 }]}>
              <Ripple onPress={onClose} style={styles.btnOutline}>
                <Text style={styles.btnOutlineText}>Huỷ</Text>
              </Ripple>
              <Ripple
                onPress={() => {
                  onSave();
                  onClose();
                }}
                style={styles.btnPrimary}
              >
                <MaterialIcons name="save" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>Lưu</Text>
              </Ripple>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={kbOffset}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
        {/* {console.log("serve", serveLive, {
          serverUid,
          receiverUid,
          slots: match?.slots,
          playersA: playersA.map(userIdOf),
          playersB: playersB.map(userIdOf),
        })} */}
        <View style={{ flex: 1 }}>
          {/* Panel danh sách trận */}
          <View
            style={{
              zIndex: 0,
              elevation: 0,
              overflow: "visible",
            }}
          >
            <RefereeMatchesPanel
              selectedId={selectedId}
              onPickMatch={(id) => {
                setSelectedId(id);
                bsRef.current?.snapToIndex?.(1);
              }}
              refreshSignal={refreshTick}
            />
          </View>

          {/* BOTTOM SHEET */}
          <BottomSheet
            ref={bsRef}
            index={sheetIndex}
            snapPoints={snapPoints}
            enablePanDownToClose
            onChange={(i) => setSheetIndex(i)}
            onClose={() => setSelectedId(null)}
            style={{ zIndex: 1000, elevation: 1, overflow: "visible" }}
            backgroundStyle={{
              elevation: 0,
              shadowColor: "transparent",
              borderRadius: 16,
            }}
            handleIndicatorStyle={{ elevation: 0, shadowColor: "transparent" }}
            backdropComponent={(props) => (
              <BottomSheetBackdrop
                {...props}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                pressBehavior="close"
              />
            )}
          >
            <BottomSheetScrollView contentContainerStyle={{ padding: 10 }}>
              {!selectedId ? (
                <View style={[styles.centerBox, { minHeight: 180 }]}>
                  <Text>Chọn một trận để bắt đầu chấm điểm.</Text>
                </View>
              ) : detailLoading && !match ? (
                <View style={styles.centerBox}>
                  <ActivityIndicator />
                </View>
              ) : detailErr ? (
                <View style={styles.alertError}>
                  <Text style={styles.alertText}>
                    {detailErr?.data?.message || detailErr?.error}
                  </Text>
                </View>
              ) : !match ? (
                <View style={styles.alertInfo}>
                  <Text style={styles.alertText}>Không tìm thấy trận.</Text>
                </View>
              ) : (
                <>
                  {/* Header */}
                  <View
                    style={[
                      styles.card,
                      { position: "relative", paddingTop: 40 },
                    ]}
                  >
                    {/* status chip: absolute góc phải, không chiếm layout */}
                    {match && (
                      <View style={styles.statusPill}>
                        <View
                          style={[
                            styles.chipSoft,
                            {
                              backgroundColor:
                                getMatchStatusChip(match.status).color + "22",
                            },
                          ]}
                        >
                          <Text
                            style={{
                              color: getMatchStatusChip(match.status).color,
                              fontWeight: "700",
                              fontSize: 12,
                            }}
                          >
                            {getMatchStatusChip(match.status).label}
                          </Text>
                        </View>
                      </View>
                    )}
                    {/*  */}
                    <View
                      style={[
                        {
                          flexDirection: "column",
                          gap: 6,
                          justifyContent: "center",
                          alignItems: "center",
                          flex: 1,
                          width: "100%",
                          marginBottom: 10,
                          alignSelf: "center",
                        },
                      ]}
                    >
                      <View
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        {playersOf(
                          match.pairA,
                          (
                            match?.tournament?.eventType || "double"
                          ).toLowerCase()
                        ).map((u, idx, arr) => (
                          <React.Fragment key={`A-${idx}`}>
                            {/* Thêm & trước VĐV thứ 2 */}
                            {idx === 1 && arr.length > 1 && (
                              <Text
                                style={{
                                  marginHorizontal: 6,
                                  fontSize: 18,
                                  fontWeight: "900",
                                  color: "#0f172a",
                                }}
                              >
                                &
                              </Text>
                            )}
                            <PlayerLine
                              prefix={
                                playersOf(
                                  match.pairA,
                                  (
                                    match?.tournament?.eventType || "double"
                                  ).toLowerCase()
                                ).length > 1
                                  ? idx === 0
                                    ? "A1"
                                    : "A2"
                                  : "A"
                              }
                              user={u}
                              slotNow={slotsNowA[userIdOf(u)]}
                              isServer={
                                serverUid &&
                                serverUid === userIdOf(u) &&
                                servingSide === "A"
                              }
                              isReceiver={
                                receiverUid &&
                                receiverUid === userIdOf(u) &&
                                servingSide === "B"
                              }
                              onPressInfo={openUserInfo}
                              onPressSetServer={(usr) =>
                                setServerByUser(usr, "A")
                              }
                            />
                          </React.Fragment>
                        ))}
                      </View>
                      <Text style={{ opacity: 0.6 }}>vs</Text>
                      <View
                        style={{
                          display: "flex",
                          flexDirection: "row",
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        {playersOf(
                          match.pairB,
                          (
                            match?.tournament?.eventType || "double"
                          ).toLowerCase()
                        ).map((u, idx, arr) => (
                          <React.Fragment key={`B-${idx}`}>
                            {idx === 1 && arr.length > 1 && (
                              <Text
                                style={{
                                  marginHorizontal: 6,
                                  fontSize: 18,
                                  fontWeight: "900",
                                  color: "#0f172a",
                                }}
                              >
                                &
                              </Text>
                            )}
                            <PlayerLine
                              prefix={
                                playersOf(
                                  match.pairB,
                                  (
                                    match?.tournament?.eventType || "double"
                                  ).toLowerCase()
                                ).length > 1
                                  ? idx === 0
                                    ? "B1"
                                    : "B2"
                                  : "B"
                              }
                              user={u}
                              slotNow={slotsNowB[userIdOf(u)]}
                              isServer={
                                serverUid &&
                                serverUid === userIdOf(u) &&
                                servingSide === "B"
                              }
                              isReceiver={
                                receiverUid &&
                                receiverUid === userIdOf(u) &&
                                servingSide === "A"
                              }
                              onPressInfo={openUserInfo}
                              onPressSetServer={(usr) =>
                                setServerByUser(usr, "B")
                              }
                            />
                          </React.Fragment>
                        ))}
                      </View>
                    </View>
                    <View
                      style={[
                        styles.rowBetween,
                        { flexWrap: "wrap", rowGap: 6 },
                      ]}
                    >
                      <View style={{ flexShrink: 1 }}>
                        <View
                          style={[styles.row, { flexWrap: "wrap", gap: 6 }]}
                        >
                          <Text style={styles.muted}>
                            {match.tournament?.name} • Nhánh{" "}
                            {match.bracket?.name} ({match.bracket?.type}) • Giai
                            đoạn {match.bracket?.stage} • Ván {match.round} •
                            Trận #{displayOrder(match)}
                          </Text>
                          {!!poolNote(match) && (
                            <View
                              style={[
                                styles.chipSoft,
                                { backgroundColor: "#06b6d422" },
                              ]}
                            >
                              <MaterialIcons
                                name="grid-view"
                                size={14}
                                color="#06b6d4"
                              />
                              <Text
                                style={{
                                  marginLeft: 4,
                                  color: "#06b6d4",
                                  fontWeight: "600",
                                }}
                              >
                                {poolNote(match)}
                              </Text>
                            </View>
                          )}
                          {/* NEW: court chip + action ngay header */}

                          {!!(match?.courtLabel || match?.courtName) && (
                            <View
                              style={[
                                styles.chipSoft,
                                {
                                  backgroundColor: "#f8fafc",
                                  borderWidth: 1,
                                  borderColor: "#e5e7eb",
                                },
                              ]}
                            >
                              <MaterialIcons
                                name="stadium"
                                size={14}
                                color="#111827"
                              />
                              <Text
                                style={{
                                  marginLeft: 4,
                                  color: "#0f172a",
                                  fontWeight: "700",
                                }}
                              >
                                {match?.courtLabel || match?.courtName}
                              </Text>
                            </View>
                          )}
                          <Ripple
                            onPress={() => setCourtModalOpen(true)}
                            style={[styles.btnOutline, { paddingVertical: 6 }]}
                          >
                            <MaterialIcons
                              name="edit-location"
                              size={16}
                              color="#111827"
                            />
                            <Text style={styles.btnOutlineText}>
                              {match?.court ? "Đổi sân" : "Gán sân"}
                            </Text>
                          </Ripple>
                        </View>
                        <Text style={styles.caption}>
                          Thắng {Math.ceil(rules.bestOf / 2)}/{rules.bestOf} ván
                          • Tới {rules.pointsToWin} điểm{" "}
                          {rules.winByTwo
                            ? "(hơn 2 điểm)"
                            : "(không cần hơn 2 điểm)"}
                          {capNote}
                        </Text>
                      </View>
                    </View>
                    {/*  */}
                    <View
                      style={[
                        styles.row,
                        { flexWrap: "wrap", gap: 6, marginTop: 12 },
                      ]}
                    >
                      {/* đổi hướng */}
                      <Ripple
                        onPress={toggleOrientation}
                        style={[styles.iconBtn, styles.row]}
                      >
                        <MaterialIcons
                          name={
                            isLandscape
                              ? "stay-current-portrait"
                              : "stay-current-landscape"
                          }
                          size={20}
                          color="#111827"
                        />
                        <Text style={{ marginLeft: 5 }}>Xoay</Text>
                      </Ripple>
                      <Ripple
                        onPress={() => setBaseModalOpen(true)}
                        style={[styles.iconBtn, styles.row]}
                      >
                        <MaterialIcons
                          name="grid-on"
                          size={20}
                          color="#111827"
                        />
                        <Text style={{ marginLeft: 5 }}>Ô & người phát</Text>
                      </Ripple>

                      <Ripple
                        onPress={!isStartDisabled ? onStart : undefined}
                        disabled={isStartDisabled}
                        rippleColor={
                          isStartDisabled ? "transparent" : "#00000012"
                        }
                        style={[
                          styles.iconBtn,
                          styles.row,
                          isStartDisabled && styles.iconBtnDisabled,
                        ]}
                      >
                        <MaterialIcons
                          name="play-arrow"
                          size={20}
                          color={
                            isStartDisabled ? COLOR_DISABLED : COLOR_ENABLED
                          }
                        />
                        <Text
                          style={[
                            styles.iconBtnText,
                            {
                              marginLeft: 5,
                              color: isStartDisabled
                                ? COLOR_DISABLED
                                : COLOR_ENABLED,
                            },
                          ]}
                        >
                          Bắt đầu
                        </Text>
                      </Ripple>

                      <Ripple
                        onPress={
                          !isFinishDisabled ? openConfirmFinish : undefined
                        }
                        disabled={isFinishDisabled}
                        rippleColor={
                          isFinishDisabled ? "transparent" : "#00000012"
                        }
                        style={[
                          styles.iconBtn,
                          styles.row,
                          isFinishDisabled && styles.iconBtnDisabled,
                        ]}
                      >
                        <MaterialIcons
                          name="stop"
                          size={20}
                          color={
                            isFinishDisabled ? COLOR_DISABLED : COLOR_ENABLED
                          }
                        />
                        <Text
                          style={[
                            styles.iconBtnText,
                            {
                              marginLeft: 5,
                              color: isFinishDisabled
                                ? COLOR_DISABLED
                                : COLOR_ENABLED,
                            },
                          ]}
                        >
                          Kết thúc
                        </Text>
                      </Ripple>
                      <Ripple
                        onPress={() => bsRef.current?.close()}
                        style={[styles.iconBtn, styles.row]}
                      >
                        <MaterialIcons name="close" size={20} color="#111827" />
                        <Text style={{ marginLeft: 5 }}>Đóng</Text>
                      </Ripple>

                      <Ripple
                        onPress={() => refetchDetail()}
                        style={styles.iconBtn}
                      >
                        <MaterialIcons
                          name="refresh"
                          size={20}
                          color="#111827"
                        />
                      </Ripple>
                    </View>
                    {detailFetching && <View style={styles.progressThin} />}
                  </View>

                  {/* Coin toss ẩn/hiện */}
                  {match?.status !== "finished" && (
                    <ColorCoinToss
                      hidden={!showCoin}
                      onToggle={() => setShowCoin((v) => !v)}
                    />
                  )}

                  {/* Scoreboard */}
                  {isLandscape ? (
                    <LandscapeScoreboard />
                  ) : (
                    <PortraitScoreboard />
                  )}
                </>
              )}
            </BottomSheetScrollView>
          </BottomSheet>

          {/* Modal kết thúc ván sớm */}
          <Modal
            visible={earlyOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setEarlyOpen(false)}
            // 👇 Giữ nguyên orientation khi mở modal (iOS + Expo)
            supportedOrientations={[
              "portrait",
              "landscape",
              "landscape-left",
              "landscape-right",
            ]}
            presentationStyle="overFullScreen"
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={[styles.h6, { marginBottom: 4 }]}>
                  Kết thúc ván hiện tại sớm?
                </Text>
                <Text>
                  Ván #{currentIndex + 1}:{" "}
                  <Text style={{ fontWeight: "800" }}>{curA}</Text> -{" "}
                  <Text style={{ fontWeight: "800" }}>{curB}</Text>
                </Text>

                {curA === curB ? (
                  <>
                    <Text style={{ marginTop: 10 }}>
                      Hai đội đang hòa. Chọn đội thắng ván này:
                    </Text>
                    <View style={[styles.row, { gap: 8, marginTop: 8 }]}>
                      <Ripple
                        onPress={() => setEarlyWinner("A")}
                        style={[
                          styles.radioBtn,
                          earlyWinner === "A" && {
                            borderColor: "#0a84ff",
                            backgroundColor: "#0a84ff11",
                          },
                        ]}
                      >
                        <Text>
                          A){" "}
                          {pairLabel(
                            match?.pairA,
                            (
                              match?.tournament?.eventType || "double"
                            ).toLowerCase()
                          )}
                        </Text>
                      </Ripple>
                      <Ripple
                        onPress={() => setEarlyWinner("B")}
                        style={[
                          styles.radioBtn,
                          earlyWinner === "B" && {
                            borderColor: "#0a84ff",
                            backgroundColor: "#0a84ff11",
                          },
                        ]}
                      >
                        <Text>
                          B){" "}
                          {pairLabel(
                            match?.pairB,
                            (
                              match?.tournament?.eventType || "double"
                            ).toLowerCase()
                          )}
                        </Text>
                      </Ripple>
                    </View>
                    <View
                      style={[
                        styles.row,
                        { gap: 8, marginTop: 8, opacity: 0.5 },
                      ]}
                    >
                      <MaterialIcons
                        name="check-box-outline-blank"
                        size={18}
                        color="#6b7280"
                      />
                      <Text>
                        Ghi nhận đúng tỉ số hiện tại — không khả dụng khi hòa
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={[styles.alertInfo, { marginTop: 10 }]}>
                      <Text>
                        Sẽ chốt thắng ván cho đội{" "}
                        <Text style={{ fontWeight: "800" }}>
                          {curA > curB ? "A" : "B"}
                        </Text>
                        .
                      </Text>
                    </View>
                    <Ripple
                      onPress={() => setUseCurrentScore((x) => !x)}
                      style={[
                        styles.row,
                        { gap: 8, marginTop: 8, alignItems: "center" },
                      ]}
                    >
                      <MaterialIcons
                        name={
                          useCurrentScore
                            ? "check-box"
                            : "check-box-outline-blank"
                        }
                        size={18}
                        color="#0a84ff"
                      />
                      <Text>
                        Ghi nhận đúng tỉ số hiện tại (không ép về tối thiểu)
                      </Text>
                    </Ripple>
                  </>
                )}

                <Text style={[styles.caption, { marginTop: 8 }]}>
                  {useCurrentScore
                    ? "Hệ thống sẽ ghi nhận đúng tỉ số hiện tại."
                    : `Hệ thống sẽ ghi nhận tỉ số tối thiểu hợp lệ theo luật (tới ${
                        rules.pointsToWin
                      }${rules.winByTwo ? ", chênh ≥2" : ", chênh ≥1"})`}
                </Text>

                <View style={[styles.rowBetween, { marginTop: 12 }]}>
                  <Ripple
                    onPress={() => setEarlyOpen(false)}
                    style={styles.btnOutline}
                  >
                    <Text style={styles.btnOutlineText}>Hủy</Text>
                  </Ripple>
                  <Ripple
                    onPress={confirmEarlyEnd}
                    disabled={useCurrentScore && curA === curB}
                    style={[
                      styles.btnPrimary,
                      useCurrentScore && curA === curB && styles.btnDisabled,
                    ]}
                  >
                    <Text style={styles.btnPrimaryText}>Xác nhận</Text>
                  </Ripple>
                </View>
              </View>
            </View>
          </Modal>

          {/* Modal thông tin VĐV */}
          <PlayerInfoModal
            visible={infoOpen}
            onClose={() => setInfoOpen(false)}
            user={infoUser}
          />

          {/* Modal confirm finish */}
          <Modal
            visible={confirmFinishOpen}
            transparent
            animationType="fade"
            onRequestClose={closeConfirmFinish}
            // 👇 giữ landscape khi modal mở (iOS)
            supportedOrientations={[
              "portrait",
              "landscape",
              "landscape-left",
              "landscape-right",
            ]}
            presentationStyle="overFullScreen"
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={[styles.h6, { marginBottom: 8 }]}>
                  Kết thúc trận?
                </Text>
                <Text style={{ color: "#111827" }}>
                  Hành động này sẽ đặt trạng thái về{" "}
                  <Text style={{ fontWeight: "800" }}>Đã kết thúc</Text>
                  {match?.winner
                    ? ""
                    : " và tự chọn đội thắng theo tỉ số hiện tại"}
                  .
                </Text>

                <View style={[styles.rowBetween, { marginTop: 12 }]}>
                  <Ripple
                    onPress={closeConfirmFinish}
                    style={styles.btnOutline}
                  >
                    <Text style={styles.btnOutlineText}>Huỷ</Text>
                  </Ripple>

                  <Ripple
                    onPress={() => {
                      closeConfirmFinish();
                      setTimeout(() => {
                        onFinish();
                      }, 20);
                    }}
                    style={styles.btnDanger}
                  >
                    <MaterialIcons name="stop" size={16} color="#fff" />
                    <Text style={styles.btnDangerText}>Kết thúc</Text>
                  </Ripple>
                </View>
              </View>
            </View>
          </Modal>

          {/* NEW: Court picker modal */}

          <CourtPickerModal
            visible={courtModalOpen}
            onClose={() => setCourtModalOpen(false)}
            matchId={match?._id}
            currentCourtId={match?.court?._id}
            onAssigned={({ courtId, error }) =>
              onAssignedCourt({ courtId, error })
            }
          />
          <BaseSlotsModal
            visible={baseModalOpen}
            onClose={() => setBaseModalOpen(false)}
          />

          {/* Snack đơn giản */}
          {snack.open && (
            <View
              style={[
                styles.snack,
                snack.type === "error"
                  ? { backgroundColor: "#ef4444" }
                  : snack.type === "info"
                  ? { backgroundColor: "#0a84ff" }
                  : { backgroundColor: "#10b981" },
              ]}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {snack.msg}
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/* ============ Styles ============ */
const styles = StyleSheet.create({
  centerBox: { padding: 16, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  h5: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  h6: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  muted: { color: "#6b7280" },
  caption: { color: "#6b7280", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chipSoft: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  iconBtn: { padding: 6, borderRadius: 8, backgroundColor: "#f8fafc" },
  iconBtnTiny: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    flexDirection: "row",
    alignItems: "center",
  },
  iconBtnDisabled: { opacity: 0.45 },
  iconBtnText: { fontWeight: "700" },
  cccdImg: {
    marginTop: 6,
    width: "100%",
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  progressThin: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -2,
    height: 2,
    backgroundColor: "#e5e7eb",
  },
  teamCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  teamName: {
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 6,
    color: "#0f172a",
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bigScore: {
    fontSize: 48,
    fontWeight: "900",
    lineHeight: 52,
    color: "#0f172a",
  },
  setBox: {
    minWidth: 120,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  btnPrimary: {
    backgroundColor: "#0a84ff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700" },
  btnOutline: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
  },
  btnOutlineText: { color: "#111827", fontWeight: "700" },
  btnSuccess: {
    backgroundColor: "#10b981",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  btnSuccessText: { color: "#fff", fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
  btnDanger: {
    backgroundColor: "#ef4444",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  btnDangerText: { color: "#fff", fontWeight: "800" },
  topBar: { height: 10, borderRadius: 8 },
  coinPanel: {
    flex: 1,
    minHeight: 110,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  coinTitle: { fontSize: 18, fontWeight: "900", color: "#0f172a" },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  snack: {
    position: "absolute",
    bottom: 70,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  radioBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  alertInfo: {
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  alertError: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  alertText: { color: "#111827" },
  bs: { zIndex: 1000, elevation: 1000, overflow: "visible" },
  statusPill: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 20, // iOS
    elevation: 3, // Android
  },
  btnOutlineActive: {
    borderColor: "#0a84ff",
    backgroundColor: "#0a84ff11",
  },
  btnOutlineTextActive: {
    color: "#0a84ff",
  },
  dotNeutral: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  dotServer: {
    backgroundColor: "#10b981",
    borderColor: "#059669",
  },
  dotReceiver: {
    backgroundColor: "#0ea5e9",
    borderColor: "#0284c7",
  },
});
