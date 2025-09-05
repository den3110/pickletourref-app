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
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as ScreenOrientation from "expo-screen-orientation";

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
  // NEW: gọi BE mở ván mới
  useRefereeNextGameMutation,
} from "@/slices/tournamentsApiSlice";
import { useSocket } from "@/context/SocketContext";
import RefereeMatchesPanel from "./RefereeMatchesPanel";

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
      ? "#f59e0b" // ⟵ đổi: live lấy màu của assigned
      : s === "assigned"
      ? "#0a84ff" // ⟵ đổi: assigned lấy màu của live
      : s === "queued"
      ? "#06b6d4"
      : s === "finished"
      ? "#10b981" // ⟵ đổi: finished lấy màu của scheduled
      : s === "scheduled"
      ? "#64748b" // ⟵ đổi: scheduled lấy màu của finished
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
export function matchCode(m) {
  const t = (m?.bracket?.type || m?.format || "").toLowerCase();
  const ord = Number.isFinite(Number(m?.order)) ? Number(m.order) : 0;
  if (["knockout", "ko", "roundelim", "po"].includes(t))
    return `R${m?.round ?? "?"}#${ord}`;
  if (t === "group") {
    const pool = m?.pool?.name ? String(m.pool.name) : "";
    return `G${pool || "-"}#${displayOrder(m)}`;
  }
  return `R${m?.round ?? "?"}#${ord}`;
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
// CHANGED: default "Chưa có đội"
const nick = (p) =>
  p?.nickname ||
  p?.nick ||
  p?.shortName ||
  p?.fullName ||
  p?.name ||
  "Chưa có đội";
export function pairLabel(reg, eventType = "double") {
  if (!reg) return "Chưa có đội"; // CHANGED
  const p1 = nick(reg.player1 || reg.p1 || reg);
  const p2 = nick(reg.player2 || reg.p2);
  return eventType === "single" || !p2 ? p1 : `${p1} & ${p2}`;
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
        <Pressable onPress={onToggle} style={styles.btnOutline}>
          <MaterialIcons name="visibility" size={16} color="#111827" />
          <Text style={styles.btnOutlineText}>Hiện</Text>
        </Pressable>
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
        <Pressable onPress={onToggle} style={styles.btnOutline}>
          <MaterialIcons name="visibility-off" size={16} color="#111827" />
          <Text style={styles.btnOutlineText}>Ẩn</Text>
        </Pressable>
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
          <Pressable
            onPress={start}
            disabled={phase === "running"}
            style={styles.btnPrimary}
          >
            <MaterialIcons name="casino" size={16} color="#fff" />
            <Text style={styles.btnPrimaryText}>Bắt đầu</Text>
          </Pressable>
          <Pressable
            onPress={reset}
            disabled={phase === "running"}
            style={[styles.btnOutline, { marginLeft: 8 }]}
          >
            <MaterialIcons name="restart-alt" size={16} color="#111827" />
            <Text style={styles.btnOutlineText}>Reset</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.row, { gap: 12 }]}>
        <Panel kind="blue" />
        <Panel kind="red" />
      </View>
    </View>
  );
}

/* ===================== MAIN ===================== */
export default function AdminRefereeConsole() {
  const [selectedId, setSelectedId] = useState(null);
  const [showCoin, setShowCoin] = useState(false);
  const [sheetIndex, setSheetIndex] = useState(-1);
  const bsRef = useRef(null);
  const snapPoints = useMemo(() => ["45%", "90%"], []);
  const [refreshTick, setRefreshTick] = useState(0);

  // orientation
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // mở sheet khi chọn, đóng sheet thì deactive
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
  const [nextGame] = useRefereeNextGameMutation(); // NEW

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
  // CHANGED: rules có cap (đã merge từ BE)
  const rules = match?.rules || {
    bestOf: 3,
    pointsToWin: 11,
    winByTwo: true,
    cap: { mode: "none", points: null },
  };
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
  const serve = match?.serve || { side: "A", server: 2 };
  const callout = isDoubles
    ? serve.side === "A"
      ? `${curA}-${curB}-${serve.server}`
      : `${curB}-${curA}-${serve.server}`
    : "";
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
      socket?.emit("status:update", { matchId: match._id, status: "live" });
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
      socket?.emit("status:update", {
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
      socket?.emit("winner:update", { matchId: match._id, winner: w });
      showSnack("success", `Đã đặt winner: ${w || "—"}`);
    } catch (e) {
      showSnack(
        "error",
        e?.data?.message || e?.error || "Không thể đặt winner"
      );
    }
  };

  // CHANGED: pass autoNext để BE tự mở ván/kết thúc
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
        autoNext: autoNextGame, // NEW
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
        autoNext: autoNextGame, // NEW
      });
    } catch (e) {
      showSnack("error", e?.data?.message || e?.error || "Không thể trừ điểm");
    }
  };

  // CHANGED: dùng API nextGame ở BE (để đồng bộ autoNext)
  const startNextGame = async () => {
    if (!match) return;
    try {
      await nextGame({ matchId: match._id, autoNext: autoNextGame }).unwrap();
      await refetchDetail();
      socket?.emit("match:patched", {
        matchId: match._id,
        autoNext: autoNextGame, // NEW
      });
    } catch (e) {
      // BE có thể trả 409 khi đã đủ set — coi như OK
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

  // CHANGED: bỏ auto-next effect ở FE (BE quyết định theo autoNext)
  // (Không còn useEffect tự mở ván ở client)

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
          autoNext: autoNextGame, // NEW
        }).unwrap();
      } else {
        const winner = curA === curB ? earlyWinner : curA > curB ? "A" : "B";
        const fin = computeEarlyFinalizeScore(curA, curB, rules, winner);
        await setGame({
          matchId: match._id,
          gameIndex: currentIndex,
          a: fin.a,
          b: fin.b,
          autoNext: autoNextGame, // NEW
        }).unwrap();
      }

      // Thử mở ván tiếp theo theo lựa chọn hiện tại
      try {
        await nextGame({ matchId: match._id, autoNext: autoNextGame }).unwrap();
      } catch (e) {
        /* 409 khi đủ set → OK, không cần báo lỗi */
      }

      socket?.emit("match:patched", {
        matchId: match._id,
        autoNext: autoNextGame, // NEW
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

  // CHANGED: để BE quyết định, nút không cần tự kiểm tra đủ điều kiện
  const startBtnDisabled = match?.status !== "live";

  // ===== Đổi hướng màn hình theo nút bấm (GIỮ NGUYÊN) =====
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

  // ====== Responsive helpers cho Landscape fit 1 màn hình (GIỮ NGUYÊN) ======
  const sidePanelMaxW = Math.min(240, Math.max(180, Math.floor(width * 0.22)));
  const scoreFontLandscape = Math.min(
    64,
    Math.max(36, Math.floor(Math.min(width, height) * 0.12))
  );
  const controlFont = 12;
  const compactPadding = 10;

  // ========== Subviews: Portrait vs Landscape ==========
  const PortraitScoreboard = () => (
    <View style={[styles.card, { gap: 12 }]}>
      <View style={[styles.row, { gap: 12, alignItems: "stretch" }]}>
        {/* Team A */}
        <View
          style={[
            styles.teamCard,
            match?.serve?.side === "A" && {
              borderColor: "#0a84ff",
              shadowOpacity: 0.15,
            },
            flashA && { borderColor: "#0a84ff" },
          ]}
        >
          <Text style={styles.teamName}>
            A){" "}
            {pairLabel(
              match.pairA,
              (match?.tournament?.eventType || "double").toLowerCase()
            )}
          </Text>
          <View style={styles.scoreRow}>
            <Pressable
              onPress={() => dec("A")}
              disabled={match?.status === "finished"}
            >
              <MaterialIcons name="remove" size={28} color="#111827" />
            </Pressable>
            <Text
              style={[
                styles.bigScore,
                flashA && {
                  color: "#0a84ff",
                  textShadowColor: "#0a84ff",
                  textShadowRadius: 6,
                },
              ]}
            >
              {curA}
            </Text>
            <Pressable
              onPress={() => inc("A")}
              disabled={
                match?.status !== "live" || matchPointReached || gameDone
              }
            >
              <MaterialIcons name="add" size={28} color="#111827" />
            </Pressable>
          </View>
        </View>

        {/* mid */}
        <View className="setBox" style={styles.setBox}>
          <Text style={styles.h6}>SET #{currentIndex + 1 || 1}</Text>
          <Text style={styles.caption}>(cần thắng {needSetWinsVal} set)</Text>
        </View>

        {/* Team B */}
        <View
          style={[
            styles.teamCard,
            match?.serve?.side === "B" && {
              borderColor: "#0a84ff",
              shadowOpacity: 0.15,
            },
            flashB && { borderColor: "#0a84ff" },
          ]}
        >
          <Text style={styles.teamName}>
            B){" "}
            {pairLabel(
              match.pairB,
              (match?.tournament?.eventType || "double").toLowerCase()
            )}
          </Text>
          <View style={styles.scoreRow}>
            <Pressable
              onPress={() => dec("B")}
              disabled={match?.status === "finished"}
            >
              <MaterialIcons name="remove" size={28} color="#111827" />
            </Pressable>
            <Text
              style={[
                styles.bigScore,
                flashB && {
                  color: "#0a84ff",
                  textShadowColor: "#0a84ff",
                  textShadowRadius: 6,
                },
              ]}
            >
              {curB}
            </Text>
            <Pressable
              onPress={() => inc("B")}
              disabled={
                match?.status !== "live" || matchPointReached || gameDone
              }
            >
              <MaterialIcons name="add" size={28} color="#111827" />
            </Pressable>
          </View>
        </View>
      </View>

      {/* Callout & giao bóng */}
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
            <Pressable
              onPress={() => {
                socket?.emit("serve:set", {
                  matchId: match._id,
                  side: "A",
                  server: match?.serve?.server || 2,
                });
                showSnack("info", "Đã đặt đội giao: A");
              }}
              style={styles.btnOutline}
            >
              <Text style={styles.btnOutlineText}>Giao: A</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                socket?.emit("serve:set", {
                  matchId: match._id,
                  side: "B",
                  server: match?.serve?.server || 2,
                });
                showSnack("info", "Đã đặt đội giao: B");
              }}
              style={styles.btnOutline}
            >
              <Text style={styles.btnOutlineText}>Giao: B</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                socket?.emit("serve:set", {
                  matchId: match._id,
                  side: match?.serve?.side || "A",
                  server: 1,
                });
                showSnack("info", "Đã đặt người giao: #1");
              }}
              style={styles.btnOutline}
            >
              <Text style={styles.btnOutlineText}>Người #1</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                socket?.emit("serve:set", {
                  matchId: match._id,
                  side: match?.serve?.side || "A",
                  server: 2,
                });
                showSnack("info", "Đã đặt người giao: #2");
              }}
              style={styles.btnOutline}
            >
              <Text style={styles.btnOutlineText}>Người #2</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Sets */}
      <View
        style={[styles.row, { gap: 8, flexWrap: "wrap", alignItems: "center" }]}
      >
        <MaterialIcons name="sports-score" size={16} color="#111827" />
        <Text style={{ fontWeight: "700" }}>Tỷ số từng ván</Text>
        {Array.from({ length: Math.max(gs.length, rules.bestOf) }).map(
          (_, i) => {
            const a = gs[i]?.a,
              b = gs[i]?.b;
            const done = isGameWin(a, b, rules.pointsToWin, rules.winByTwo);
            const capped = !!gs[i]?.capped; // NEW: hiển thị nếu ván chạm cap
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

      {/* Điều khiển ván */}
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
        <Pressable
          onPress={onClickStartNext}
          disabled={startBtnDisabled || match?.status === "finished"}
          style={[
            styles.btnPrimary,
            (startBtnDisabled || match?.status === "finished") &&
              styles.btnDisabled,
          ]}
        >
          <Text style={styles.btnPrimaryText}>Bắt đầu ván tiếp theo</Text>
        </Pressable>
        <Pressable
          onPress={onFinish}
          disabled={match?.status === "finished"}
          style={[
            styles.btnSuccess,
            match?.status === "finished" && styles.btnDisabled,
            { marginLeft: 4 },
          ]}
        >
          <Text style={styles.btnSuccessText}>Kết thúc trận</Text>
        </Pressable>
      </View>
    </View>
  );

  const LandscapeScoreboard = () => (
    <View
      style={[
        styles.card,
        {
          gap: 8,
          padding: compactPadding,
        },
      ]}
    >
      {/* Khối ngang: A | trung tâm | B */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "stretch" }}>
        {/* Team A */}
        <View
          style={[
            styles.teamCard,
            {
              maxWidth: sidePanelMaxW,
              padding: compactPadding,
            },
            match?.serve?.side === "A" && {
              borderColor: "#0a84ff",
              shadowOpacity: 0.15,
            },
            flashA && { borderColor: "#0a84ff" },
          ]}
        >
          <Text
            style={[
              styles.teamName,
              { marginBottom: 6, fontSize: 13, lineHeight: 16 },
            ]}
            numberOfLines={2}
          >
            A){" "}
            {pairLabel(
              match.pairA,
              (match?.tournament?.eventType || "double").toLowerCase()
            )}
          </Text>
          <View style={{ alignItems: "center" }}>
            <Pressable
              onPress={() => inc("A")}
              disabled={
                match?.status !== "live" || matchPointReached || gameDone
              }
            >
              <MaterialIcons name="add" size={30} color="#111827" />
            </Pressable>
            <Text
              style={[
                styles.bigScore,
                {
                  fontSize: scoreFontLandscape,
                  lineHeight: scoreFontLandscape + 2,
                },
                flashA && {
                  color: "#0a84ff",
                  textShadowColor: "#0a84ff",
                  textShadowRadius: 6,
                },
              ]}
            >
              {curA}
            </Text>
            <Pressable
              onPress={() => dec("A")}
              disabled={match?.status === "finished"}
            >
              <MaterialIcons name="remove" size={30} color="#111827" />
            </Pressable>
          </View>
        </View>

        {/* Trung tâm */}
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
                const done = isGameWin(a, b, rules.pointsToWin, rules.winByTwo);
                const capped = !!gs[i]?.capped; // NEW
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
              },
            ]}
          >
            <View style={[styles.row, { gap: 6, alignItems: "center" }]}>
              <Switch value={autoNextGame} onValueChange={setAutoNextGame} />
              <Text style={{ fontSize: controlFont + 1 }}>
                Tự động sang ván tiếp theo
              </Text>
            </View>
            <Pressable
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
            </Pressable>
            <Pressable
              onPress={onFinish}
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
            </Pressable>
          </View>

          {/* Callout & giao bóng */}
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
                  style={{ color: "#0a84ff", fontWeight: "700", fontSize: 12 }}
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
                <Pressable
                  onPress={() => {
                    socket?.emit("serve:set", {
                      matchId: match._id,
                      side: "A",
                      server: match?.serve?.server || 2,
                    });
                    showSnack("info", "Đã đặt đội giao: A");
                  }}
                  style={[styles.btnOutline, { paddingVertical: 6 }]}
                >
                  <Text style={[styles.btnOutlineText, { fontSize: 12 }]}>
                    Giao: A
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    socket?.emit("serve:set", {
                      matchId: match._id,
                      side: "B",
                      server: match?.serve?.server || 2,
                    });
                    showSnack("info", "Đã đặt đội giao: B");
                  }}
                  style={[styles.btnOutline, { paddingVertical: 6 }]}
                >
                  <Text style={[styles.btnOutlineText, { fontSize: 12 }]}>
                    Giao: B
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    socket?.emit("serve:set", {
                      matchId: match._id,
                      side: match?.serve?.side || "A",
                      server: 1,
                    });
                    showSnack("info", "Đã đặt người giao: #1");
                  }}
                  style={[styles.btnOutline, { paddingVertical: 6 }]}
                >
                  <Text style={[styles.btnOutlineText, { fontSize: 12 }]}>
                    Người #1
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    socket?.emit("serve:set", {
                      matchId: match._id,
                      side: match?.serve?.side || "A",
                      server: 2,
                    });
                    showSnack("info", "Đã đặt người giao: #2");
                  }}
                  style={[styles.btnOutline, { paddingVertical: 6 }]}
                >
                  <Text style={[styles.btnOutlineText, { fontSize: 12 }]}>
                    Người #2
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>

        {/* Team B */}
        <View
          style={[
            styles.teamCard,
            {
              maxWidth: sidePanelMaxW,
              padding: compactPadding,
            },
            match?.serve?.side === "B" && {
              borderColor: "#0a84ff",
              shadowOpacity: 0.15,
            },
            flashB && { borderColor: "#0a84ff" },
          ]}
        >
          <Text
            style={[
              styles.teamName,
              { marginBottom: 6, fontSize: 13, lineHeight: 16 },
            ]}
            numberOfLines={2}
          >
            B){" "}
            {pairLabel(
              match.pairB,
              (match?.tournament?.eventType || "double").toLowerCase()
            )}
          </Text>
          <View style={{ alignItems: "center" }}>
            <Pressable
              onPress={() => inc("B")}
              disabled={
                match?.status !== "live" || matchPointReached || gameDone
              }
            >
              <MaterialIcons name="add" size={30} color="#111827" />
            </Pressable>
            <Text
              style={[
                styles.bigScore,
                {
                  fontSize: scoreFontLandscape,
                  lineHeight: scoreFontLandscape + 2,
                },
                flashB && {
                  color: "#0a84ff",
                  textShadowColor: "#0a84ff",
                  textShadowRadius: 6,
                },
              ]}
            >
              {curB}
            </Text>
            <Pressable
              onPress={() => dec("B")}
              disabled={match?.status === "finished"}
            >
              <MaterialIcons name="remove" size={30} color="#111827" />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
      <View style={{ flex: 1 }}>
        {/* Panel danh sách trận */}
        <View style={{ padding: 10 }}>
          <RefereeMatchesPanel
            selectedId={selectedId}
            onPickMatch={(id) => setSelectedId(id)}
            refreshSignal={refreshTick}
          />
        </View>

        {/* BOTTOM SHEET */}
        <BottomSheet
          ref={bsRef}
          index={sheetIndex}
          snapPoints={snapPoints}
          enablePanDownToClose
          onChange={(i) => {
            setSheetIndex(i);
            if (i === -1) setSelectedId(null);
          }}
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
                <View style={[styles.card, { position: "relative" }]}>
                  <View
                    style={[styles.rowBetween, { flexWrap: "wrap", rowGap: 6 }]}
                  >
                    <View style={{ flexShrink: 1 }}>
                      <View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}>
                        <Text style={styles.h5}>
                          {pairLabel(
                            match.pairA,
                            (
                              match?.tournament?.eventType || "double"
                            ).toLowerCase()
                          )}{" "}
                          <Text style={{ opacity: 0.6 }}>vs</Text>{" "}
                          {pairLabel(
                            match.pairB,
                            (
                              match?.tournament?.eventType || "double"
                            ).toLowerCase()
                          )}
                        </Text>
                      </View>
                      <View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}>
                        <Text style={styles.muted}>
                          {match.tournament?.name} • Nhánh {match.bracket?.name}{" "}
                          ({match.bracket?.type}) • Giai đoạn{" "}
                          {match.bracket?.stage} • Ván {match.round} • Trận #
                          {displayOrder(match)}
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
                      </View>
                      <Text style={styles.caption}>
                        Thắng {Math.ceil(rules.bestOf / 2)}/{rules.bestOf} ván •
                        Tới {rules.pointsToWin} điểm{" "}
                        {rules.winByTwo
                          ? "(hơn 2 điểm)"
                          : "(không cần hơn 2 điểm)"}
                        {capNote}
                      </Text>
                    </View>

                    <View style={[styles.row, { flexWrap: "wrap", gap: 6 }]}>
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

                      {/* đổi hướng */}
                      <Pressable
                        onPress={toggleOrientation}
                        style={styles.iconBtn}
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
                      </Pressable>

                      {/* close sheet icon */}
                      <Pressable
                        onPress={() => bsRef.current?.close()}
                        style={styles.iconBtn}
                      >
                        <MaterialIcons name="close" size={20} color="#111827" />
                      </Pressable>

                      <Pressable
                        onPress={onStart}
                        disabled={match?.status === "live"}
                        style={styles.iconBtn}
                      >
                        <MaterialIcons
                          name="play-arrow"
                          size={20}
                          color="#111827"
                        />
                      </Pressable>
                      <Pressable
                        onPress={onFinish}
                        disabled={match?.status === "finished"}
                        style={styles.iconBtn}
                      >
                        <MaterialIcons name="stop" size={20} color="#111827" />
                      </Pressable>
                      <Pressable
                        onPress={() => refetchDetail()}
                        style={styles.iconBtn}
                      >
                        <MaterialIcons
                          name="refresh"
                          size={20}
                          color="#111827"
                        />
                      </Pressable>
                    </View>
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
                {isLandscape ? <LandscapeScoreboard /> : <PortraitScoreboard />}
              </>
            )}
          </BottomSheetScrollView>
        </BottomSheet>

        {/* Modal kết thúc ván sớm */}
        <Modal visible={earlyOpen} transparent animationType="fade">
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
                    <Pressable
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
                    </Pressable>
                    <Pressable
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
                    </Pressable>
                  </View>
                  <View
                    style={[styles.row, { gap: 8, marginTop: 8, opacity: 0.5 }]}
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
                  <Pressable
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
                  </Pressable>
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
                <Pressable
                  onPress={() => setEarlyOpen(false)}
                  style={styles.btnOutline}
                >
                  <Text style={styles.btnOutlineText}>Hủy</Text>
                </Pressable>
                <Pressable
                  onPress={confirmEarlyEnd}
                  disabled={useCurrentScore && curA === curB}
                  style={[
                    styles.btnPrimary,
                    useCurrentScore && curA === curB && styles.btnDisabled,
                  ]}
                >
                  <Text style={styles.btnPrimaryText}>Xác nhận</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

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
    maxWidth: 420,
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

  // thêm nhẹ cho radio trong modal
  radioBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },

  // thông báo khối (reuse)
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
});
