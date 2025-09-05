// app/(tabs)/history.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { skipToken } from "@reduxjs/toolkit/query";
import {
  useGetRefereeTournamentsQuery,
  useListRefereeMatchesByTournamentQuery,
} from "@/slices/tournamentsApiSlice";
import { Colors } from "@/constants/Colors";
import ResponsiveMatchViewer from "@/components/match/ResponsiveMatchViewer";
import { useSelector } from "react-redux";

// @ts-ignore: JS component (native jsx)

/* ================= Helpers ================= */
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
  if (!d) return "—";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}
function fmtDateKey(d: Date | null) {
  if (!d) return "khong_xep";
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtDateLabel(dateKey: string) {
  if (dateKey === "khong_xep") return "Chưa xếp ngày";
  const [y, m, d] = dateKey.split("-");
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
  return (
    readStr(
      pair?.label,
      pair?.name,
      pair?.displayName,
      [
        pair?.player1?.nickname || pair?.player1?.name,
        pair?.player2?.nickname || pair?.player2?.name,
      ]
        .filter(Boolean)
        .join(" / ")
    ) || "Đội"
  );
}
function matchCode(m: any) {
  return readStr(m?.code, m?.matchCode, m?.shortCode);
}
function bracketName(m: any) {
  return readStr(m?.bracket?.name, m?.roundName, m?.stageName);
}
function courtName(m: any) {
  return readStr(m?.court?.name, m?.venue?.name, m?.location);
}
function getScheduledDate(m: any): Date | null {
  // lịch sử ưu tiên ended/finished -> start/scheduled -> created
  return (
    toDate(m?.endedAt) ||
    toDate(m?.finishedAt) ||
    toDate(m?.scheduledAt) ||
    toDate(m?.startAt) ||
    toDate(m?.startTime) ||
    toDate(m?.time) ||
    toDate(m?.createdAt)
  );
}

type Preset = "all" | "today" | "tomorrow" | "week" | "month";
type StatusBucket = "all" | "scheduled" | "ongoing" | "finished";

function atStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function atEnd(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function inPreset(dt: Date | null, preset: Preset) {
  if (preset === "all") return true;
  if (!dt) return false;
  const now = new Date();
  const tS = atStart(now);
  const tE = atEnd(now);
  if (preset === "today") return dt >= tS && dt <= tE;
  if (preset === "tomorrow") {
    const d = new Date(tS);
    d.setDate(d.getDate() + 1);
    return dt >= atStart(d) && dt <= atEnd(d);
  }
  if (preset === "week") {
    const end = new Date(tE);
    end.setDate(end.getDate() + 6);
    return dt >= tS && dt <= end;
  }
  if (preset === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return dt >= atStart(first) && dt <= atEnd(last);
  }
  return true;
}
function bucketOf(m: any): Exclude<StatusBucket, "all"> {
  const raw = readStr(m?.status, m?.state, m?.matchStatus).toLowerCase();
  if (
    raw.includes("ongoing") ||
    raw.includes("in_progress") ||
    raw.includes("live") ||
    raw.includes("running") ||
    raw.includes("playing")
  )
    return "ongoing";
  if (
    raw.includes("completed") ||
    raw.includes("complete") ||
    raw.includes("finished") ||
    raw.includes("done")
  )
    return "finished";
  return "scheduled";
}
function isFinished(m: any) {
  return bucketOf(m) === "finished";
}
function scoreLine(m: any) {
  const games: any[] = Array.isArray(m?.games) ? m.games : [];
  const toNum = (v: any) => (Number.isFinite(+v) ? +v : undefined);
  const parts = games
    .map((g) => {
      const a = toNum(g?.a ?? g?.A ?? g?.scoreA);
      const b = toNum(g?.b ?? g?.B ?? g?.scoreB);
      if (a == null || b == null) return null;
      return `${a}\u2013${b}`;
    })
    .filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : "";
}
function winnerLabel(m: any) {
  // chỉ dùng khi finished
  const w = readStr(m?.winner, m?.winnerSide, m?.winnerCode).toUpperCase();
  if (w === "A") return teamLabel(m?.pairA);
  if (w === "B") return teamLabel(m?.pairB);
  const idA = readStr(m?.pairA?._id, m?.pairA?.id);
  const idB = readStr(m?.pairB?._id, m?.pairB?.id);
  if (w && idA && w === idA) return teamLabel(m?.pairA);
  if (w && idB && w === idB) return teamLabel(m?.pairB);
  return "";
}
function statusBadge(bucket: Exclude<StatusBucket, "all">) {
  if (bucket === "ongoing")
    return { bg: "#fff7ed", color: "#9a3412", label: "Đang diễn ra" };
  if (bucket === "scheduled")
    return { bg: "#f1f5f9", color: "#334155", label: "Dự kiến" };
  return { bg: "#ecfdf5", color: "#065f46", label: "Hoàn thành" };
}

/* ================= Screen ================= */
export default function HistoryScreen() {
  // state mở bottom sheet match viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);

  const openViewer = (id?: any) => {
    const mid = String(id ?? "");
    if (!mid) return;
    setActiveMatchId(mid);
    setViewerOpen(true);
  };

  // 1) Tournaments → chips
    const token = useSelector((s: any) => s?.auth?.userInfo?.token);
  
  const {
    data: tournamentsRes,
    isLoading: isLoadingTours,
    refetch: refetchTours,
  } = useGetRefereeTournamentsQuery(undefined, { skip: !token });

  const tournaments: any[] = useMemo(
    () => tournamentsRes?.items || tournamentsRes || [],
    [tournamentsRes]
  );

  const [selectedTid, setSelectedTid] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedTid && tournaments?.length) {
      setSelectedTid(String(tournaments[0]?._id || tournaments[0]?.id));
    }
  }, [tournaments, selectedTid]);

  // 2) Matches of selected tournament
  const queryArgs = selectedTid
    ? { tournamentId: selectedTid, page: 1, pageSize: 300 }
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

  // 3) Filters: thời gian + trạng thái + keyword
  const [preset, setPreset] = useState<Preset>("all");
  const [status, setStatus] = useState<StatusBucket>("finished"); // mặc định "Đã kết thúc"
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return matches.filter((m) => {
      // trạng thái
      if (status !== "all" && bucketOf(m) !== status) return false;

      // thời gian
      const dt = getScheduledDate(m);
      if (!inPreset(dt, preset)) return false;

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

  // 4) Group by day (desc: mới → cũ), robust sort theo key
  const sections = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const m of filtered) {
      const dt = getScheduledDate(m);
      const key = fmtDateKey(dt);
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }

    const entries = Object.entries(groups).map(([key, arr]) => {
      // sort trong ngày: muộn → sớm
      arr.sort((a, b) => {
        const ta = getScheduledDate(a)?.getTime() ?? 0;
        const tb = getScheduledDate(b)?.getTime() ?? 0;
        return tb - ta;
      });
      return { key, title: fmtDateLabel(key), data: arr };
    });

    // ngày: muộn → sớm, "khong_xep" xuống cuối
    entries.sort((A, B) => {
      if (A.key === "khong_xep" && B.key === "khong_xep") return 0;
      if (A.key === "khong_xep") return 1;
      if (B.key === "khong_xep") return -1;
      return new Date(B.key).getTime() - new Date(A.key).getTime();
    });

    return entries;
  }, [filtered]);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      refetchTours(),
      selectedTid ? refetchMatches() : Promise.resolve(),
    ]);
  }, [refetchTours, refetchMatches, selectedTid]);

  const loading = isLoadingTours || (selectedTid && isFetchingMatches);

  /* ================= UI ================= */
  return (
    <View style={styles.container}>
      {/* === Tournament chips === */}
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
                    active && {
                      borderColor: Colors.light.tint,
                      backgroundColor: "#eef2ff",
                    },
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

      {/* === Filters: thời gian + trạng thái + search === */}
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
            { key: "month", label: "Tháng này" },
          ].map((p) => {
            const active = preset === (p.key as Preset);
            return (
              <Pressable
                key={p.key}
                onPress={() => setPreset(p.key as Preset)}
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
            { key: "finished", label: "Đã kết thúc" },
          ].map((p) => {
            const active = status === (p.key as StatusBucket);
            return (
              <Pressable
                key={p.key}
                onPress={() => setStatus(p.key as StatusBucket)}
                style={[
                  styles.filterChip,
                  active && {
                    backgroundColor: "#111827",
                    borderColor: "#111827",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    active && { color: "#fff", fontWeight: "800" },
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Search */}
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

      {/* === List grouped by day (desc) === */}
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
              const bucket = bucketOf(item);
              const badge = statusBadge(bucket);
              const dt = getScheduledDate(item);
              const time = fmtTime(dt);
              const code = matchCode(item);
              const bname = bracketName(item);
              const a = teamLabel(item?.pairA);
              const b = teamLabel(item?.pairB);
              const court = courtName(item);

              const isDone = bucket === "finished";
              const gamesLine = isDone ? scoreLine(item) : "";
              const winner = isDone ? winnerLabel(item) : "";

              const id = item?._id || item?.id;

              return (
                <Pressable
                  onPress={() => openViewer(id)}
                  style={({ pressed }) => [pressed && { opacity: 0.85 }]}
                >
                  <View style={styles.card}>
                    {/* Top row */}
                    <View style={styles.rowTop}>
                      <Text style={styles.time}>{time}</Text>
                      {court ? <Text style={styles.dot}>•</Text> : null}
                      {court ? <Text style={styles.court}>{court}</Text> : null}
                      <View style={{ flex: 1 }} />
                      {code ? <Text style={styles.code}>{code}</Text> : null}
                    </View>

                    {/* Bracket / round */}
                    {bname ? <Text style={styles.bracket}>{bname}</Text> : null}

                    {/* Teams */}
                    <Text style={styles.vs} numberOfLines={2}>
                      {a} <Text style={styles.vsDot}>•</Text> {b}
                    </Text>

                    {/* Status / Winner row */}
                    <View style={styles.footerRow}>
                      <View
                        style={[styles.badge, { backgroundColor: badge.bg }]}
                      >
                        <Text
                          style={[styles.badgeText, { color: badge.color }]}
                        >
                          {badge.label}
                        </Text>
                      </View>

                      {isDone && winner ? (
                        <View
                          style={[styles.badge, { backgroundColor: "#E5F9F0" }]}
                        >
                          <Text
                            style={[styles.badgeText, { color: "#166534" }]}
                          >
                            Thắng: {winner}
                          </Text>
                        </View>
                      ) : null}

                      {isDone && gamesLine ? (
                        <Text style={styles.scoreLine}>{gamesLine}</Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Không có trận phù hợp</Text>
                  <Text style={styles.emptySub}>
                    Đổi bộ lọc thời gian/trạng thái hoặc chọn giải khác.
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
              Hãy chọn một giải để xem lịch sử trận.
            </Text>
          </View>
        )}
      </View>

      {/* ========= Match Viewer Bottom Sheet ========= */}
      <ResponsiveMatchViewer
        open={viewerOpen}
        matchId={activeMatchId as any}
        onClose={() => setViewerOpen(false)}
      />
    </View>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f7fb" },

  /* chips */
  chipsRowWrap: { paddingTop: 10, paddingBottom: 6 },
  chipsRow: { paddingHorizontal: 16, gap: 8 },
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

  /* filters */
  filtersWrap: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 6,
  },
  filtersRow: { flexDirection: "row", gap: 8 },

  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterChipText: { color: "#111827", fontWeight: "700" },

  filterChipOutline: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  filterChipOutlineText: { color: "#374151", fontWeight: "600" },

  searchRow: { marginTop: 6, position: "relative" },
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

  /* list */
  listWrap: { flex: 1, marginBottom: 70 },
  sectionHeader: {
    backgroundColor: "#f6f7fb",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  sectionTitle: { color: "#6b7280", fontSize: 13, fontWeight: "700" },

  /* card */
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
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  time: { color: "#0f172a", fontSize: 16, fontWeight: "800" },
  dot: { color: "#9ca3af", fontSize: 16, fontWeight: "900" },
  court: { color: "#374151", fontSize: 12, fontWeight: "600" },

  bracket: { color: "#334155", fontSize: 12, marginBottom: 6 },
  vs: { color: "#0f172a", fontSize: 15, fontWeight: "700" },
  vsDot: { color: "#94a3b8", fontWeight: "900" },

  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "800" },
  code: { color: "#6366f1", fontSize: 12, fontWeight: "800" },
  scoreLine: { color: "#111827", fontSize: 12, fontWeight: "700" },

  /* empty */
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
