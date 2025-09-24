/* eslint-disable react/prop-types */
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import Ripple from "react-native-material-ripple";
import {
  useGetMatchQuery,
  useRefereeIncPointMutation,
  useRefereeSetGameScoreMutation,
  useRefereeSetStatusMutation,
  useRefereeSetWinnerMutation,
  useRefereeNextGameMutation,
  useGetCourtsForMatchQuery,
  useRefereeAssignCourtMutation,
  useRefereeUnassignCourtMutation,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";

/* ==== helpers ==== */
const toInt = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const str = (v) => (v == null ? "" : String(v).trim());
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
const nick = (p) =>
  p?.nickname || p?.nick || p?.shortName || p?.fullName || p?.name || "—";
export function pairLabel(reg, eventType = "double") {
  if (!reg) return "—";
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
const userIdOf = (u) =>
  String(u?.user?._id || u?.user || u?._id || u?.id || "") || "";
const flipSlot = (n) => (n === 1 ? 2 : 1);
const currentSlotFromBase = (base, teamScore) =>
  teamScore % 2 === 0 ? base : flipSlot(base);
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

/* ====== Court picker modal ====== */
function CourtPickerModal({
  visible,
  onClose,
  matchId,
  currentCourtId,
  onAssigned,
}) {
  const { data, isLoading, error } = useGetCourtsForMatchQuery(
    { matchId, includeBusy: false },
    { skip: !visible || !matchId }
  );
  const [assignCourt, { isLoading: assigning }] =
    useRefereeAssignCourtMutation();
  const [unassignCourt, { isLoading: unassigning }] =
    useRefereeUnassignCourtMutation();

  const courts = useMemo(() => data?.items || [], [data?.items]);

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

/* ====== FE-only: chọn bên hiển thị Trái/Phải cho A/B ====== */
function CourtSidesSelector({ value, onChange }) {
  const left = value?.left === "B" ? "B" : "A";
  const right = left === "A" ? "B" : "A";
  const swap = () => onChange?.({ left: right, right: left });
  return (
    <View
      style={[styles.row, { gap: 8, flexWrap: "wrap", alignItems: "center" }]}
    >
      <MaterialIcons name="swap-horiz" size={16} color="#111827" />
      <Text style={{ fontWeight: "700", color: "#0f172a" }}>
        Vị trí sân (FE-only)
      </Text>
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

/* ====== Màn Setup ====== */
export default function ScoreboardSetupScreen() {
  const router = useRouter();
  const { matchId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const {
    data: match,
    isLoading,
    error,
    refetch,
  } = useGetMatchQuery(matchId, { skip: !matchId });

  const [setGame] = useRefereeSetGameScoreMutation();
  const [setStatus] = useRefereeSetStatusMutation();
  const [setWinner] = useRefereeSetWinnerMutation();
  const [nextGame] = useRefereeNextGameMutation();
  const socket = useSocket();

  const [autoNextGame, setAutoNextGame] = useState(false);
  const [courtModalOpen, setCourtModalOpen] = useState(false);
  const [courtSide, setCourtSide] = useState({ left: "A", right: "B" });

  useEffect(() => {
    setCourtSide({ left: "A", right: "B" });
  }, [matchId]);

  const rules = match?.rules || {
    bestOf: 3,
    pointsToWin: 11,
    winByTwo: true,
    cap: { mode: "none", points: null },
  };
  const gs = match?.gameScores || [];
  const currentIndex = Math.max(0, gs.length - 1);
  const curA = gs[currentIndex]?.a ?? 0;
  const curB = gs[currentIndex]?.b ?? 0;

  const eventType = (match?.tournament?.eventType || "double").toLowerCase();
  const playersA = playersOf(match?.pairA, eventType);
  const playersB = playersOf(match?.pairB, eventType);

  // Base slots
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

  // Serve (điều chỉnh tại đây)
  const liveServe = match?.serve ?? {};
  const serverUid = String(liveServe.serverId || match?.slots?.serverId || "");
  const servingSide = liveServe?.side === "B" ? "B" : "A";

  // ====== hành động ======
  const onStart = async () => {
    if (!match) return;
    try {
      await setStatus({ matchId: match._id, status: "live" }).unwrap();
      socket?.emit("status:updated", { matchId: match._id, status: "live" });
      if (gs.length === 0)
        await setGame({
          matchId: match._id,
          gameIndex: 0,
          a: 0,
          b: 0,
          autoNext: autoNextGame,
        }).unwrap();
      refetch();
    } catch {}
  };
  const onFinish = async () => {
    if (!match) return;
    const aWins = gs.filter(
      (g) =>
        isGameWin(g?.a, g?.b, rules.pointsToWin, rules.winByTwo) && g.a > g.b
    ).length;
    const bWins = gs.filter(
      (g) =>
        isGameWin(g?.a, g?.b, rules.pointsToWin, rules.winByTwo) && g.b > g.a
    ).length;
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
      refetch();
    } catch {}
  };
  const startNextGame = async () => {
    if (!match) return;
    try {
      await nextGame({ matchId: match._id, autoNext: autoNextGame }).unwrap();
      socket?.emit("match:patched", {
        matchId: match._id,
        autoNext: autoNextGame,
      });
      refetch();
    } catch {}
  };

  // Early finish 1 ván
  const [earlyOpen, setEarlyOpen] = useState(false);
  const [earlyWinner, setEarlyWinner] = useState("A");
  const [useCurrentScore, setUseCurrentScore] = useState(false);
  const confirmEarlyEnd = async () => {
    if (!match) return;
    try {
      if (useCurrentScore) {
        if (curA === curB) return; // không hợp lệ
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
      refetch();
    } catch {}
  };

  // đặt serve qua socket (giống file cũ, rút gọn)
  const socketRef = useRef(null);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);
  const setServe = useCallback(
    (payload) => {
      if (!match?._id || !socketRef.current) return;
      socketRef.current.emit(
        "serve:set",
        { matchId: match._id, ...payload },
        (ack) => {
          if (ack?.ok) refetch();
        }
      );
    },
    [match?._id, refetch]
  );

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
        <View style={styles.centerBox}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }
  if (error || !match) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
        <View style={styles.alertError}>
          <Text style={styles.alertText}>
            {error?.data?.message || error?.error || "Không tải được trận"}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      <View style={[styles.rowBetween, { padding: 12 }]}>
        <Ripple onPress={() => router.back()} style={styles.iconBtn}>
          <MaterialIcons name="arrow-back" size={20} color="#111827" />
        </Ripple>
        <Text style={[styles.h6, { flex: 1, textAlign: "center" }]}>
          Cài đặt Scoreboard
        </Text>
        <Ripple onPress={() => refetch()} style={styles.iconBtn}>
          <MaterialIcons name="refresh" size={20} color="#111827" />
        </Ripple>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
        {/* Thông tin chung */}
        <View style={styles.card}>
          <Text style={[styles.h6, { marginBottom: 4 }]} numberOfLines={1}>
            {match?.tournament?.name} • Nhánh {match?.bracket?.name} (
            {match?.bracket?.type})
          </Text>
          <Text style={styles.caption}>
            Giai đoạn {match?.bracket?.stage} • Ván {match?.round} • Trận #
            {displayOrder(match)}
          </Text>

          <View
            style={[styles.row, { gap: 8, flexWrap: "wrap", marginTop: 8 }]}
          >
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
              onPress={() => setCourtModalOpen(true)}
              style={styles.btnOutline}
            >
              <MaterialIcons name="edit-location" size={16} color="#111827" />
              <Text style={styles.btnOutlineText}>
                {match?.court ? "Đổi sân" : "Gán sân"}
              </Text>
            </Ripple>
          </View>

          <CourtPickerModal
            visible={courtModalOpen}
            onClose={() => setCourtModalOpen(false)}
            matchId={match?._id}
            currentCourtId={match?.court?._id}
            onAssigned={() => refetch()}
          />
        </View>

        {/* Đặt đội giao & người giao (đọc/sửa) */}
        {eventType !== "single" && (
          <View style={styles.card}>
            <Text style={[styles.h6, { marginBottom: 8 }]}>Giao bóng</Text>
            <View style={[styles.row, { gap: 8, flexWrap: "wrap" }]}>
              <Ripple
                onPress={() => setServe({ side: "A" })}
                style={[
                  styles.btnOutline,
                  liveServe.side === "A" && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    liveServe.side === "A" && styles.btnOutlineTextActive,
                  ]}
                >
                  Giao: A
                </Text>
              </Ripple>
              <Ripple
                onPress={() => setServe({ side: "B" })}
                style={[
                  styles.btnOutline,
                  liveServe.side === "B" && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    liveServe.side === "B" && styles.btnOutlineTextActive,
                  ]}
                >
                  Giao: B
                </Text>
              </Ripple>
              <Ripple
                onPress={() => setServe({ server: 1 })}
                style={[
                  styles.btnOutline,
                  Number(liveServe.server) === 1 && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    Number(liveServe.server) === 1 &&
                      styles.btnOutlineTextActive,
                  ]}
                >
                  Người #1
                </Text>
              </Ripple>
              <Ripple
                onPress={() => setServe({ server: 2 })}
                style={[
                  styles.btnOutline,
                  Number(liveServe.server) === 2 && styles.btnOutlineActive,
                ]}
              >
                <Text
                  style={[
                    styles.btnOutlineText,
                    Number(liveServe.server) === 2 &&
                      styles.btnOutlineTextActive,
                  ]}
                >
                  Người #2
                </Text>
              </Ripple>
            </View>

            {/* FE-only: đổi trái/phải trên UI hiển thị */}
            <View style={{ marginTop: 10 }}>
              <CourtSidesSelector value={courtSide} onChange={setCourtSide} />
            </View>
          </View>
        )}

        {/* Điều khiển ván / trận */}
        <View style={styles.card}>
          <Text style={[styles.h6, { marginBottom: 8 }]}>Điều khiển</Text>
          <View
            style={[
              styles.row,
              { gap: 10, flexWrap: "wrap", alignItems: "center" },
            ]}
          >
            <View style={[styles.row, { gap: 6, alignItems: "center" }]}>
              <Switch value={autoNextGame} onValueChange={setAutoNextGame} />
              <Text>Tự động sang ván tiếp theo</Text>
            </View>

            <Ripple onPress={onStart} style={styles.btnPrimary}>
              <MaterialIcons name="play-arrow" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>Bắt đầu</Text>
            </Ripple>

            <Ripple
              onPress={() => {
                if (isGameWin(curA, curB, rules.pointsToWin, rules.winByTwo)) {
                  startNextGame();
                } else {
                  setEarlyWinner("A");
                  setUseCurrentScore(false);
                  setEarlyOpen(true);
                }
              }}
              style={styles.btnOutline}
            >
              <MaterialIcons name="skip-next" size={16} color="#111827" />
              <Text style={styles.btnOutlineText}>Ván tiếp theo</Text>
            </Ripple>

            <Ripple onPress={onFinish} style={styles.btnDanger}>
              <MaterialIcons name="stop" size={16} color="#fff" />
              <Text style={styles.btnDangerText}>Kết thúc trận</Text>
            </Ripple>
          </View>

          {/* Modal kết thúc ván sớm */}
          <Modal
            visible={earlyOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setEarlyOpen(false)}
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
                        <Text>A) {pairLabel(match?.pairA, eventType)}</Text>
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
                        <Text>B) {pairLabel(match?.pairB, eventType)}</Text>
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
        </View>

        {/* Coin toss (tùy chọn setup hiển thị) */}
        <View style={styles.card}>
          <Text style={[styles.h6, { marginBottom: 8 }]}>
            Bốc thăm màu (tham khảo)
          </Text>
          <View style={[styles.row, { gap: 6, flexWrap: "wrap" }]}>
            <View style={[styles.chipSoft, { backgroundColor: "#0a84ff11" }]}>
              <MaterialIcons name="info-outline" size={16} color="#0a84ff" />
              <Text style={{ color: "#0a84ff", marginLeft: 6 }}>
                Phần này để setup trước trận. Màn scoreboard chỉ hiển thị bảng
                điểm.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ============ Styles (tái sử dụng từ file cũ) ============ */
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
    marginBottom: 10,
  },
  h6: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
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
  iconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  iconBtnDisabled: { opacity: 0.45 },
  iconBtnText: { fontWeight: "700" },
  progressThin: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -2,
    height: 2,
    backgroundColor: "#e5e7eb",
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
  btnOutlineActive: { borderColor: "#0a84ff", backgroundColor: "#0a84ff11" },
  btnOutlineTextActive: { color: "#0a84ff" },
  btnDanger: {
    backgroundColor: "#ef4444",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  btnDangerText: { color: "#fff", fontWeight: "700" },
  btnDisabled: { opacity: 0.5 },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  radioBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
});
