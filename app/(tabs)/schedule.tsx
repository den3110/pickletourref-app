// app/(tabs)/schedule.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  Text,
  View,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from "react-native";
import { skipToken } from "@reduxjs/toolkit/query";
import {
  useGetRefereeTournamentsQuery,
  useListRefereeMatchesByTournamentQuery,
} from "@/slices/tournamentsApiSlice";
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { useSelector } from "react-redux";

/* =============== Helpers =============== */
function toDate(v: any): Date | null {
  if (!v) return null;
  try {
    if (typeof v === "number") return new Date(v);
    if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n) && String(n).length >= 10) return new Date(n);
      return new Date(v);
    }
    return null;
  } catch {
    return null;
  }
}

function fmtTime(d: Date | null) {
  if (!d) return "Chưa có giờ đấu";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtDateKey(d: Date | null) {
  if (!d) return "khong_xep";
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`; // YYYY-MM-DD
}

function fmtDateLabel(dateStr: string) {
  if (dateStr === "khong_xep") return "Chưa xếp ngày";
  const [y, m, d] = dateStr.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  const wd = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"][dt.getDay()];
  return `${wd}, ${d}/${m}/${y}`;
}

function readStr(...cands: any[]) {
  for (const x of cands) {
    if (x == null) continue;
    const s = String(x).trim();
    if (s) return s;
  }
  return "";
}

function teamLabel(pair: any) {
  const p1 = readStr(pair?.player1?.nickname, pair?.player1?.name);
  const p2 = readStr(pair?.player2?.nickname, pair?.player2?.name);

  const label =
    readStr(
      pair?.label,
      pair?.name,
      pair?.displayName,
      [p1, p2].filter(Boolean).join(" / ")
    ) || "";

  return label || "Chưa có đội";
}

function matchCode(m: any) {
  return readStr(m?.code, m?.matchCode, m?.shortCode);
}

function bracketName(m: any) {
  return readStr(m?.bracket?.name, m?.roundName, m?.stageName);
}

function getScheduledDate(m: any): Date | null {
  return (
    toDate(m?.scheduledAt) ||
    toDate(m?.startAt) ||
    toDate(m?.startTime) ||
    toDate(m?.time) ||
    toDate(m?.createdAt)
  );
}

type Preset = "all" | "today" | "tomorrow" | "week";
type StatusBucket = "all" | "scheduled" | "ongoing" | "finished";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function isInPreset(dt: Date | null, preset: Preset) {
  if (preset === "all") return true;
  if (!dt) return preset === "all"; // nếu không có ngày, coi như không khớp các preset khác
  const now = new Date();
  const todayS = startOfDay(now);
  const todayE = endOfDay(now);

  if (preset === "today") {
    return dt >= todayS && dt <= todayE;
  }
  if (preset === "tomorrow") {
    const tmr = new Date(todayS);
    tmr.setDate(tmr.getDate() + 1);
    const tmrS = startOfDay(tmr);
    const tmrE = endOfDay(tmr);
    return dt >= tmrS && dt <= tmrE;
  }
  if (preset === "week") {
    const weekEnd = new Date(todayE);
    weekEnd.setDate(weekEnd.getDate() + 6); // 7 ngày tính cả hôm nay
    return dt >= todayS && dt <= weekEnd;
  }
  return true;
}

function getStatusBucket(m: any): Exclude<StatusBucket, "all"> {
  const raw = readStr(m?.status, m?.state, m?.matchStatus).toLowerCase();
  if (
    raw.includes("ongoing") ||
    raw.includes("in_progress") ||
    raw.includes("live") ||
    raw.includes("running") ||
    raw.includes("playing")
  ) {
    return "ongoing";
  }
  if (
    raw.includes("completed") ||
    raw.includes("complete") ||
    raw.includes("finished") ||
    raw.includes("done")
  ) {
    return "finished";
  }
  return "scheduled";
}

function textIncludes(hay: string, needle: string) {
  return hay.toLowerCase().includes(needle.toLowerCase());
}

/* =============== Component =============== */
export default function ScheduleScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme ?? "light"].tint;

  // 1) Danh sách giải đấu
    const token = useSelector((s: any) => s?.auth?.userInfo?.token);
  
  const {
    data: tournamentsRes,
    isLoading: isLoadingTours,
    refetch: refetchTours,
  } = useGetRefereeTournamentsQuery(undefined, {skip: !token});

  const tournaments: any[] = useMemo(
    () => tournamentsRes?.items || tournamentsRes || [],
    [tournamentsRes]
  );

  const [selectedTid, setSelectedTid] = useState<string | null>(null);

  // Auto-chọn giải đầu tiên
  useEffect(() => {
    if (!selectedTid && tournaments?.length) {
      setSelectedTid(String(tournaments[0]?._id || tournaments[0]?.id));
    }
  }, [tournaments, selectedTid]);

  // 2) Lấy trận theo giải đã chọn ——— FE-only: truyền OBJECT đúng key
  const queryArgs = selectedTid
    ? { tournamentId: selectedTid, page: 1, pageSize: 200 }
    : skipToken;
  const {
    data: matchesRes,
    isFetching: isFetchingMatches,
    refetch: refetchMatches,
  } = useListRefereeMatchesByTournamentQuery(queryArgs);

  const matches: any[] = useMemo(
    () => matchesRes?.items || matchesRes || [],
    [matchesRes]
  );

  /* ===== Filters state ===== */
  const [preset, setPreset] = useState<Preset>("all");
  const [status, setStatus] = useState<StatusBucket>("all");
  const [keyword, setKeyword] = useState("");

  const filteredMatches = useMemo(() => {
    const kw = keyword.trim().toLowerCase();

    return matches.filter((m) => {
      // preset (ngày)
      const dt = getScheduledDate(m);
      if (!isInPreset(dt, preset)) return false;

      // status
      if (status !== "all") {
        const b = getStatusBucket(m);
        if (b !== status) return false;
      }

      // keyword
      if (kw) {
        const a = teamLabel(m?.pairA);
        const b = teamLabel(m?.pairB);
        const code = matchCode(m);
        const br = bracketName(m);
        const hay = `${a} ${b} ${code} ${br}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }

      return true;
    });
  }, [matches, preset, status, keyword]);

  // 3) Group theo ngày (từ filteredMatches)
  const sections = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const m of filteredMatches) {
      const dt = getScheduledDate(m);
      const key = fmtDateKey(dt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    const entries = Object.entries(groups).map(([key, arr]) => {
      arr.sort((a: any, b: any) => {
        const da = getScheduledDate(a)?.getTime() ?? 0;
        const db = getScheduledDate(b)?.getTime() ?? 0;
        return da - db;
      });
      return { title: fmtDateLabel(key), data: arr };
    });
    entries.sort((A, B) => {
      if (A.title === "Chưa xếp ngày") return 1;
      if (B.title === "Chưa xếp ngày") return -1;
      const [, restA] = A.title.split(", ");
      const [dA, mA, yA] = restA.split("/").map(Number);
      const [, restB] = B.title.split(", ");
      const [dB, mB, yB] = restB.split("/").map(Number);
      return (
        new Date(yA, mA - 1, dA).getTime() - new Date(yB, mB - 1, dB).getTime()
      );
    });
    return entries;
  }, [filteredMatches]);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      refetchTours(),
      selectedTid ? refetchMatches() : Promise.resolve(),
    ]);
  }, [refetchTours, refetchMatches, selectedTid]);

  const loading = isLoadingTours || (selectedTid && isFetchingMatches);

  /* ===== UI ===== */
  return (
    <View style={styles.container}>
      {/* ======== Chips chọn giải ======== */}
      <View style={styles.chipsRowWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {loading && !tournaments?.length ? (
            <View style={styles.loadingChip}>
              <ActivityIndicator />
            </View>
          ) : tournaments?.length ? (
            tournaments.map((t) => {
              const id = String(t?._id || t?.id);
              const active = id === selectedTid;
              return (
                <Pressable
                  key={id}
                  onPress={() => setSelectedTid(id)}
                  style={({ pressed }) => [
                    styles.chip,
                    active && { borderColor: tint, backgroundColor: "#eef2ff" },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={[styles.chipText, active && { color: "#1f2a63" }]}
                  >
                    {t?.name || "Giải đấu"}
                  </Text>
                </Pressable>
              );
            })
          ) : (
            <Text style={{ color: "#6b7280" }}>
              Chưa có giải nào được phân công
            </Text>
          )}
        </ScrollView>
      </View>

      {/* ======== Bộ lọc ======== */}
      <View style={styles.filtersWrap}>
        {/* Preset ngày */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {[
            { key: "all", label: "Tất cả" },
            { key: "today", label: "Hôm nay" },
            { key: "tomorrow", label: "Ngày mai" },
            { key: "week", label: "Tuần này" },
          ].map((p) => {
            const active = preset === (p.key as Preset);
            return (
              <Pressable
                key={p.key}
                onPress={() => setPreset(p.key as Preset)}
                style={[
                  styles.filterChip,
                  active && {
                    backgroundColor: "#111827",
                    borderColor: "#111827",
                  },
                ]}
              >
                <Text
                  style={[styles.filterChipText, active && { color: "#fff" }]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Trạng thái */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.filtersRow, { marginTop: 8 }]}
        >
          {[
            { key: "all", label: "Tất cả" },
            { key: "scheduled", label: "Chưa bắt đầu" },
            { key: "ongoing", label: "Đang diễn ra" },
            { key: "finished", label: "Kết thúc" },
          ].map((p) => {
            const active = status === (p.key as StatusBucket);
            return (
              <Pressable
                key={p.key}
                onPress={() => setStatus(p.key as StatusBucket)}
                style={[
                  styles.filterChipOutline,
                  active && {
                    borderColor: "#111827",
                    backgroundColor: "#f3f4f6",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipOutlineText,
                    active && { color: "#111827", fontWeight: "700" },
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Ô tìm kiếm */}
        <View style={styles.searchRow}>
          <TextInput
            placeholder="Tìm mã trận, bảng đấu, đội…"
            placeholderTextColor="#9ca3af"
            value={keyword}
            onChangeText={setKeyword}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {keyword ? (
            <Pressable onPress={() => setKeyword("")} style={styles.clearBtn}>
              <Text style={{ color: "#6b7280", fontWeight: "800" }}>×</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ======== Danh sách theo ngày ======== */}
      <View style={styles.listWrap}>
        {selectedTid ? (
          <SectionList
            sections={sections}
            keyExtractor={(item: any) => String(item?._id || item?.id)}
            refreshControl={
              <RefreshControl refreshing={!!loading} onRefresh={onRefresh} />
            }
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {section.title} · {section.data.length} trận
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const dt = getScheduledDate(item);
              const time = fmtTime(dt);
              const code = matchCode(item);
              const bname = bracketName(item);
              const a = teamLabel(item?.pairA);
              const b = teamLabel(item?.pairB);

              return (
                <View style={styles.card}>
                  <View style={styles.rowTop}>
                    <Text style={styles.time}>{time}</Text>
                    <View style={{ flex: 1 }} />
                    {code ? <Text style={styles.code}>{code}</Text> : null}
                  </View>
                  {bname ? <Text style={styles.bracket}>{bname}</Text> : null}
                  <Text style={styles.vs} numberOfLines={2}>
                    {a} <Text style={styles.vsDot}>•</Text> {b}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>
                    Không có trận phù hợp bộ lọc
                  </Text>
                  <Text style={styles.emptySub}>
                    Thử bỏ bớt bộ lọc hoặc đổi từ khóa tìm kiếm.
                  </Text>
                </View>
              )
            }
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            stickySectionHeadersEnabled
            contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Chọn giải đấu</Text>
            <Text style={styles.emptySub}>
              Hãy chọn một giải để xem lịch phân công.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

/* =============== Styles (Light-first) =============== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f7fb",
  },

  /* Chips */
  chipsRowWrap: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  chipsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  loadingChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  chipText: { color: "#111827", fontWeight: "600" },

  /* Filters */
  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 4,
  },
  filtersRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterChipText: {
    color: "#111827",
    fontWeight: "700",
  },
  filterChipOutline: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterChipOutlineText: {
    color: "#374151",
    fontWeight: "600",
  },
  searchRow: {
    marginTop: 8,
    position: "relative",
  },
  searchInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
    fontWeight: "600",
  },
  clearBtn: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },

  /* List */
  listWrap: { flex: 1, marginBottom: 70 },
  sectionHeader: {
    backgroundColor: "#f6f7fb",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: { color: "#6b7280", fontSize: 13, fontWeight: "700" },

  /* Card */
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  rowTop: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  time: { color: "#0f172a", fontSize: 16, fontWeight: "800" },
  code: { color: "#6366f1", fontSize: 12, fontWeight: "800" },
  bracket: { color: "#334155", fontSize: 12, marginBottom: 6 },
  vs: { color: "#0f172a", fontSize: 15, fontWeight: "700" },
  vsDot: { color: "#94a3b8", fontWeight: "900" },

  /* Empty */
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    padding: 24,
  },
  emptyTitle: { color: "#0f172a", fontWeight: "800", fontSize: 16 },
  emptySub: { color: "#6b7280", textAlign: "center" },
});
