// app/(tabs)/assignments.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { useColorScheme } from "@/hooks/useColorScheme";
import { Colors } from "@/constants/Colors";
import { useSelector } from "react-redux";

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
  if (!d) return "Chưa có giờ đấu";
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
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
function courtName(m: any) {
  return readStr(m?.court?.name, m?.venue?.name, m?.location);
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
type StatusBucket = "ongoing" | "scheduled" | "finished";

function bucketOf(m: any): StatusBucket {
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

function badgeStyle(bucket: StatusBucket) {
  if (bucket === "ongoing")
    return { bg: "#DCFCE7", text: "#166534", label: "Đang diễn ra" };
  if (bucket === "finished")
    return { bg: "#F3F4F6", text: "#111827", label: "Đã kết thúc" };
  return { bg: "#E0E7FF", text: "#1E3A8A", label: "Sắp diễn ra" }; // scheduled
}

/* ================= Screen ================= */
export default function AssignmentsScreen() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme ?? "light"].tint;
  const token = useSelector((s: any) => s?.auth?.userInfo?.token);
  // 1) Tournaments for chips
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

  // 2) Matches by selected tournament (FE-only: pass correct object)
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

  // 3) Local filters (status + keyword)
  const [status, setStatus] = useState<"all" | StatusBucket>("all");
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return matches.filter((m) => {
      if (status !== "all" && bucketOf(m) !== status) return false;
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
  }, [matches, status, keyword]);

  // 4) Group by status: ongoing -> scheduled -> finished
  const grouped = useMemo(() => {
    const g: Record<StatusBucket, any[]> = {
      ongoing: [],
      scheduled: [],
      finished: [],
    };
    for (const m of filtered) g[bucketOf(m)].push(m);

    // sort each bucket
    g.ongoing.sort(
      (a, b) =>
        (getScheduledDate(a)?.getTime() ?? 0) -
        (getScheduledDate(b)?.getTime() ?? 0)
    );
    g.scheduled.sort(
      (a, b) =>
        (getScheduledDate(a)?.getTime() ?? 0) -
        (getScheduledDate(b)?.getTime() ?? 0)
    );
    g.finished.sort(
      (a, b) =>
        (getScheduledDate(b)?.getTime() ?? 0) -
        (getScheduledDate(a)?.getTime() ?? 0)
    );

    const flat = [
      ...g.ongoing.map((m) => ({ ...m, __bucket: "ongoing" as StatusBucket })),
      ...g.scheduled.map((m) => ({
        ...m,
        __bucket: "scheduled" as StatusBucket,
      })),
      ...g.finished.map((m) => ({
        ...m,
        __bucket: "finished" as StatusBucket,
      })),
    ];
    return { g, flat };
  }, [filtered]);

  const counts = useMemo(() => {
    return {
      all: matches.length,
      ongoing: matches.filter((m) => bucketOf(m) === "ongoing").length,
      scheduled: matches.filter((m) => bucketOf(m) === "scheduled").length,
      finished: matches.filter((m) => bucketOf(m) === "finished").length,
    };
  }, [matches]);

  const loading = isLoadingTours || (selectedTid && isFetchingMatches);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      refetchTours(),
      selectedTid ? refetchMatches() : Promise.resolve(),
    ]);
  }, [refetchTours, refetchMatches, selectedTid]);

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

      {/* === Status filters + search === */}
      <View style={styles.filtersWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {(
            [
              { key: "all", label: `Tất cả (${counts.all})` },
              { key: "ongoing", label: `Đang diễn ra (${counts.ongoing})` },
              { key: "scheduled", label: `Sắp diễn ra (${counts.scheduled})` },
              { key: "finished", label: `Đã kết thúc (${counts.finished})` },
            ] as const
          ).map((opt) => {
            const active = status === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => setStatus(opt.key)}
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
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

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

      {/* === List (flat, grouped by badge color via divider) === */}
      <View style={styles.listWrap}>
        {selectedTid ? (
          <FlatList
            data={grouped.flat}
            keyExtractor={(item: any) => String(item?._id || item?.id)}
            refreshing={!!loading}
            onRefresh={onRefresh}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>Không có trận phù hợp</Text>
                  <Text style={styles.emptySub}>
                    Kiểm tra lại bộ lọc trạng thái hoặc từ khóa.
                  </Text>
                </View>
              )
            }
            renderItem={({ item, index }) => {
              const bucket = (item as any).__bucket as StatusBucket;
              const badge = badgeStyle(bucket);
              const dt = getScheduledDate(item);
              const time = fmtTime(dt);
              const code = matchCode(item);
              const bname = bracketName(item);
              const a = teamLabel(item?.pairA);
              const b = teamLabel(item?.pairB);
              const court = courtName(item);

              return (
                <View style={styles.card}>
                  <View style={styles.rowTop}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>
                        {badge.label}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    {code ? <Text style={styles.code}>{code}</Text> : null}
                  </View>

                  <View style={styles.rowMid}>
                    <Text style={styles.time}>{time}</Text>
                    {court ? <Text style={styles.dot}>•</Text> : null}
                    {court ? <Text style={styles.court}>{court}</Text> : null}
                  </View>

                  {bname ? <Text style={styles.bracket}>{bname}</Text> : null}

                  <Text style={styles.vs} numberOfLines={2}>
                    {a} <Text style={styles.vsDot}>•</Text> {b}
                  </Text>

                  {/* TODO: điều hướng tới console trận nếu có route */}
                  {/* <Pressable onPress={() => router.push(`/ref/${item._id}`)} style={styles.primaryBtn}>
                    <Text style={styles.primaryBtnText}>
                      {bucket === "ongoing" ? "Mở bảng điều khiển" : "Vào trận"}
                    </Text>
                  </Pressable> */}
                </View>
              );
            }}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Chọn giải đấu</Text>
            <Text style={styles.emptySub}>
              Hãy chọn một giải để xem các trận được giao.
            </Text>
          </View>
        )}
      </View>
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
  rowTop: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { fontSize: 12, fontWeight: "800" },
  code: { color: "#6366f1", fontSize: 12, fontWeight: "800" },

  rowMid: {
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

  /* primary button (optional) */
  primaryBtn: {
    marginTop: 10,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "800" },

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
