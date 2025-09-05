import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
  ActionSheetIOS,
  Alert,
} from "react-native";
import { useDispatch } from "react-redux";
import { router } from "expo-router";
import { logout as logoutAction } from "@/slices/authSlice";
import { MaterialIcons } from "@expo/vector-icons";
import {
  useGetRefereeTournamentsQuery,
  useGetRefereeBracketsQuery,
  useListRefereeMatchesByTournamentQuery,
} from "@/slices/tournamentsApiSlice";

import {
  displayOrder,
  getMatchStatusChip,
  matchCode,
  pairLabel,
  poolNote,
  VI_MATCH_STATUS,
} from "./AdminRefereeConsole";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useExpoOrientation } from "@/hooks/useOrientationState";

/* ============ debounce nhỏ cho ô tìm kiếm ============ */
function useDebounced(value, delay = 400) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

/* ================== UI primitives ================== */
function Chip({
  label,
  color = "#64748b",
  outlined = false,
  icon,
  onPress,
  selected,
}) {
  const style = [
    styles.chip,
    outlined
      ? { borderColor: color, borderWidth: 1 }
      : { backgroundColor: color + "22" },
    selected ? { borderColor: color, borderWidth: 1.6 } : null,
  ];
  return (
    <Pressable onPress={onPress} style={style}>
      {!!icon && (
        <MaterialIcons
          name={icon}
          size={14}
          color={color}
          style={{ marginRight: 6 }}
        />
      )}
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, right }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {right}
      </View>
    </View>
  );
}

/* ================== Accordion đơn giản ================== */
function Accordion({ title, subtitle, right, expanded, onToggle, children }) {
  return (
    <View style={styles.accordion}>
      <Pressable onPress={() => onToggle?.(!expanded)} style={styles.accHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.accTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.accSub}>{subtitle}</Text>}
        </View>
        {right}
        <MaterialIcons
          name={expanded ? "expand-less" : "expand-more"}
          size={24}
          color="#64748b"
          style={{ marginLeft: 4 }}
        />
      </Pressable>
      {expanded ? <View style={styles.accBody}>{children}</View> : null}
    </View>
  );
}

/* ================== Modal chọn nhiều giải ================== */
/* ================== Modal chọn nhiều giải ================== */
function MultiTournamentPicker({
  visible,
  options,
  selected,
  onChange,
  onClose,
}) {
  const origRef = React.useRef(selected); // lưu lại lúc mở modal

  useEffect(() => {
    if (visible) origRef.current = selected;
  }, [visible, selected]);

  const toggle = useCallback(
    (id) => {
      const set = new Set(selected.map((t) => t._id));
      set.has(id) ? set.delete(id) : set.add(id);
      onChange(options.filter((o) => set.has(o._id)));
    },
    [selected, options, onChange]
  );

  const selectAll = useCallback(() => {
    onChange(options);
  }, [options, onChange]);

  const deselectAll = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const resetToOrig = useCallback(() => {
    onChange([]);
  }, [onChange]);

  const renderItem = ({ item: t }) => {
    const isSel = !!selected.find((x) => x._id === t._id);
    return (
      <Pressable onPress={() => toggle(t._id)} style={styles.row}>
        <MaterialIcons
          name={isSel ? "check-box" : "check-box-outline-blank"}
          size={20}
          color={isSel ? "#0a84ff" : "#94a3b8"}
        />
        <Text style={styles.rowText}>{t.name}</Text>
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.modalCard}>
          <SectionHeader
            title="Chọn giải để hiển thị"
            right={
              <Pressable onPress={onClose} style={styles.iconBtn}>
                <MaterialIcons name="close" size={18} color="#111827" />
              </Pressable>
            }
          />

          {/* Thanh hành động nhanh */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              flexWrap: "wrap",
            }}
          >
            <Pressable onPress={selectAll} style={styles.btnSoft}>
              <MaterialIcons name="select-all" size={16} color="#0a84ff" />
              <Text style={styles.btnSoftText}>Chọn tất cả</Text>
            </Pressable>

            <Pressable onPress={deselectAll} style={styles.btnSoft}>
              <MaterialIcons name="block" size={16} color="#0a84ff" />
              <Text style={styles.btnSoftText}>Bỏ chọn tất cả</Text>
            </Pressable>

            <Pressable
              onPress={resetToOrig}
              style={[
                styles.btnSoft,
                {
                  backgroundColor: "#f1f5f9",
                  borderWidth: 1,
                  borderColor: "#e5e7eb",
                },
              ]}
            >
              <MaterialIcons name="restart-alt" size={16} color="#111827" />
              <Text
                style={{
                  marginLeft: 6,
                  color: "#111827",
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                Reset
              </Text>
            </Pressable>

            <View style={{ marginLeft: "auto" }}>
              <Text style={{ color: "#64748b", fontSize: 12 }}>
                Đã chọn:{" "}
                <Text style={{ fontWeight: "800", color: "#0f172a" }}>
                  {selected.length}
                </Text>
                /{options.length}
              </Text>
            </View>
          </View>

          <FlatList
            data={options}
            keyExtractor={(t) => String(t._id)}
            renderItem={renderItem}
            style={{ maxHeight: 420 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.centerBox}>
                <Text>Không có giải nào.</Text>
              </View>
            }
          />

          <Pressable
            onPress={onClose}
            style={[styles.primaryBtn, { marginTop: 12 }]}
          >
            <Text style={styles.primaryBtnText}>Xong</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ================== TournamentAccordion (RN) ================== */
function TournamentAccordion({
  tournament,
  open,
  onToggle,
  status,
  q,
  page,
  onPageChange,
  bracketId,
  onBracketChange,
  pageSize,
  onPickMatch,
  selectedId,
}) {
  const { data: brData, isLoading: brLoading } = useGetRefereeBracketsQuery(
    { tournamentId: tournament._id },
    { skip: !open }
  );
  const brackets = brData?.items || [];

  const queryArgs = useMemo(() => {
    const args = { tournamentId: tournament._id, page, pageSize };
    if (status && status !== "all") args.status = status;
    if (q) args.q = q;
    if (bracketId && bracketId !== "all") args.bracketId = bracketId;
    return args;
  }, [tournament._id, status, q, page, pageSize, bracketId]);

  const {
    data: matchesResp,
    isFetching: listFetching,
    isLoading: listLoading,
    isUninitialized: listUninitialized,
    error: listErr,
    refetch: refetchList,
  } = useListRefereeMatchesByTournamentQuery(queryArgs, { skip: !open });

  const items = matchesResp?.items || [];
  // NEW: loại bỏ item rỗng/placeholder để không hiện "trận" trống
  const filteredItems = useMemo(
    () =>
      (items || []).filter((m) => {
        if (!m || typeof m !== "object") return false;
        if (!m._id) return false; // cần id hợp lệ
        // có ít nhất 1 thông tin hiển thị được
        return (
          m.pairA ||
          m.pairB ||
          m.status ||
          m.bracket?.name ||
          m.bracket?.type ||
          m.codeResolved ||
          m.code
        );
      }),
    [items]
  );
  const totalPages = matchesResp?.totalPages || 1;

  const subtitle = [
    tournament.location || "",
    tournament.startDate
      ? new Date(tournament.startDate).toLocaleDateString()
      : undefined,
    tournament.endDate
      ? `- ${new Date(tournament.endDate).toLocaleDateString()}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" • ");

  const renderMatchCode = (m) => m?.codeResolved ?? m?.code ?? matchCode(m);

  // “Bảng X” khi bracket.type = "group" và có groupIndex, tránh trùng poolNote
  const groupChipFrom = (m) => {
    const isGroup = (m?.bracket?.type || "") === "group";
    const gi = m?.groupIndex;
    if (!isGroup || !Number.isFinite(gi)) return null;
    const label = `Bảng ${gi}`;
    const pn = poolNote(m);
    if (pn && String(pn).toLowerCase() === String(label).toLowerCase())
      return null;
    return label;
  };

  return (
    <Accordion
      expanded={open}
      onToggle={onToggle}
      title={tournament.name}
      subtitle={subtitle}
      right={
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {typeof tournament?.pendingCount === "number" &&
            tournament.pendingCount > 0 && (
              <Chip
                label={`Đang chờ: ${tournament.pendingCount}`}
                color="#f59e0b"
                outlined
              />
            )}
          <Pressable
            disabled={!open || listUninitialized || listFetching}
            onPress={refetchList}
            style={[
              styles.iconBtn,
              (!open || listUninitialized || listFetching) && { opacity: 0.4 },
            ]}
          >
            <MaterialIcons name="refresh" size={18} color="#111827" />
          </Pressable>
        </View>
      }
    >
      {/* Inner filters: Bracket */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        style={{ marginBottom: 8 }}
      >
        <Chip
          label="Tất cả bracket"
          color="#64748b"
          outlined={bracketId !== "all"}
          selected={bracketId === "all"}
          onPress={() => onBracketChange("all")}
        />
        {brLoading ? (
          <View style={styles.rowCenter}>
            <ActivityIndicator size="small" />
          </View>
        ) : (
          brackets.map((b) => (
            <Chip
              key={b._id}
              label={`${b.name} (${b.type})`}
              color="#0a84ff"
              outlined={bracketId !== b._id}
              selected={bracketId === b._id}
              onPress={() => onBracketChange(b._id)}
            />
          ))
        )}
        {listFetching ? (
          <View style={[styles.rowCenter, { marginLeft: 8 }]}>
            <ActivityIndicator size="small" />
          </View>
        ) : null}
      </ScrollView>

      {/* Matches */}
      {listLoading && !items.length ? (
        <View style={styles.centerBox}>
          <ActivityIndicator />
        </View>
      ) : listErr ? (
        <View style={styles.alertError}>
          <Text style={styles.alertText}>
            {listErr?.data?.message ||
              listErr?.error ||
              "Lỗi tải danh sách trận"}
          </Text>
        </View>
      ) : !filteredItems.length ? (
        <View style={styles.alertInfo}>
          <Text style={styles.alertText}>
            Không có trận phù hợp với bộ lọc.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={filteredItems}
            keyExtractor={(m) => String(m._id)}
            style={{ flex: 1 }}
            renderItem={({ item: m }) => {
              const { label, color } = getMatchStatusChip(m.status);
              const courtName = m.court?.name || m.courtName || "";
              const evt = (m?.tournament?.eventType || "double").toLowerCase();
              const gchip = groupChipFrom(m);
              const pnote = !m.groupIndex && poolNote(m);
              const selected = String(selectedId) === String(m._id);

              return (
                <Pressable
                  onPress={() => onPickMatch?.(m._id)}
                  style={[
                    styles.matchItem,
                    selected && { backgroundColor: "#0a84ff11" },
                  ]}
                >
                  <View style={styles.matchTop}>
                    <Text style={styles.matchCode}>{renderMatchCode(m)}</Text>
                    <Chip label={label} color={color} />
                  </View>

                  <Text style={styles.matchMeta}>
                    Bracket: {m.bracket?.name} ({m.bracket?.type}) • R{m.round}{" "}
                    • #{displayOrder(m)}
                  </Text>

                  <View style={styles.chipsRow}>
                    {!!courtName && (
                      <Chip
                        label={courtName}
                        color="#111827"
                        outlined
                        icon="stadium"
                      />
                    )}
                    {!!gchip && (
                      <Chip
                        label={gchip}
                        color="#06b6d4"
                        outlined
                        icon="grid-view"
                      />
                    )}
                    {!!pnote && (
                      <Chip
                        label={pnote}
                        color="#06b6d4"
                        outlined
                        icon="grid-view"
                      />
                    )}
                  </View>

                  <Text style={styles.matchPairs}>
                    {pairLabel(m.pairA, evt)}{" "}
                    <Text style={{ opacity: 0.6 }}>vs</Text>{" "}
                    {pairLabel(m.pairB, evt)}
                  </Text>
                </Pressable>
              );
            }}
          />

          {/* Pagination */}
          <View style={styles.pagination}>
            <Pressable
              onPress={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
              style={[styles.pageBtn, page <= 1 && styles.disabledBtn]}
            >
              <MaterialIcons name="chevron-left" size={18} color="#111827" />
              <Text style={styles.pageBtnText}>Trước</Text>
            </Pressable>
            <Text style={styles.pageText}>
              Trang {page}/{totalPages}
            </Text>
            <Pressable
              onPress={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              style={[styles.pageBtn, page >= totalPages && styles.disabledBtn]}
            >
              <Text style={styles.pageBtnText}>Sau</Text>
              <MaterialIcons name="chevron-right" size={18} color="#111827" />
            </Pressable>
          </View>
        </>
      )}
    </Accordion>
  );
}

/* ================== Main panel ================== */
export default function RefereeMatchesPanel({
  selectedId,
  onPickMatch,
  refreshSignal,
}) {
  const dispatch = useDispatch();

  const doLogout = useCallback(() => {
    try {
      dispatch(logoutAction());
      router.replace("/login");
    } catch {
      router.replace("/"); // fallback
    }
  }, [dispatch]);

  const confirmLogout = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Đăng xuất",
          message: "Bạn có chắc muốn đăng xuất?",
          options: ["Huỷ", "Đăng xuất"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
          userInterfaceStyle: "light",
        },
        (i) => i === 1 && doLogout()
      );
    } else {
      Alert.alert("Đăng xuất", "Bạn có chắc muốn đăng xuất?", [
        { text: "Huỷ", style: "cancel" },
        { text: "Đăng xuất", style: "destructive", onPress: doLogout },
      ]);
    }
  }, [doLogout]);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 400);
  const { isLandscape } = useExpoOrientation();
  const [selectedTourneys, setSelectedTourneys] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [openAcc, setOpenAcc] = useState({}); // { [tid]: boolean }
  const [pageMap, setPageMap] = useState({}); // { [tid]: number }
  const [bracketMap, setBracketMap] = useState({}); // { [tid]: "all" | bracketId }
  const pageSize = 10;

  const {
    data: tourneysData,
    isLoading: loadingTours,
    error: toursErr,
    refetch: refetchTours,
  } = useGetRefereeTournamentsQuery();

  // 🔁 Khi trận đấu kết thúc ở nơi khác → AdminRefereeConsole tăng refreshSignal → refetch lại để cập nhật "Đang chờ"
  useEffect(() => {
    if (typeof refreshSignal !== "undefined") {
      refetchTours();
    }
  }, [refreshSignal, refetchTours]);

  const tourneys = useMemo(() => tourneysData?.items || [], [tourneysData]);

  const listToRender = useMemo(() => {
    if (!selectedTourneys.length) return tourneys;
    const set = new Set(selectedTourneys.map((t) => t._id));
    return tourneys.filter((t) => set.has(t._id));
  }, [tourneys, selectedTourneys]);

  const toggleAccordion = (tid, next) =>
    setOpenAcc((m) => ({
      ...m,
      [tid]: typeof next === "boolean" ? next : !m[tid],
    }));
  const setPage = (tid, p) => setPageMap((m) => ({ ...m, [tid]: p }));
  const setBracket = (tid, bid) =>
    setBracketMap((m) => ({ ...m, [tid]: bid || "all" }));

  return (
    <>
      <View style={styles.card}>
        <SectionHeader
          title="Danh sách trận (Trọng tài)"
          right={
            <View style={{ flexDirection: "row", alignItems: "center" }}>
             
              <Pressable onPress={refetchTours} style={styles.iconBtn}>
                <MaterialIcons name="refresh" size={18} color="#111827" />
              </Pressable>
              <Pressable
                onPress={confirmLogout}
                style={[
                  styles.btnSoft,
                  { backgroundColor: "#ef444411", marginLeft: 6 },
                ]}
              >
                <MaterialIcons name="logout" size={14} color="#ef4444" />
                <Text style={[styles.btnSoftText, { color: "#ef4444" }]}>
                  Đăng xuất
                </Text>
              </Pressable>
            </View>
          }
        />

        {/* Filter bar */}
        <View style={{ padding: 12 }}>
          {/* Giải (multi) */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <MaterialIcons name="filter-alt" size={16} color="#64748b" />
            <Text
              style={{ marginLeft: 6, fontWeight: "700", color: "#111827" }}
            >
              Bộ lọc
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            nestedScrollEnabled
            style={{ marginBottom: 8 }}
          >
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={styles.btnSoft}
            >
              <MaterialIcons name="list" size={14} color="#0a84ff" />
              <Text style={styles.btnSoftText}>
                {selectedTourneys.length
                  ? `${selectedTourneys.length} giải đã chọn`
                  : "Chọn giải"}
              </Text>
            </Pressable>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
            >
              {Object.keys(VI_MATCH_STATUS).map((s) => {
                const { label, color } = getMatchStatusChip(s);
                return (
                  <Chip
                    key={s}
                    label={label}
                    color={color}
                    outlined={status !== s}
                    selected={status === s}
                    onPress={() => setStatus(s)}
                  />
                );
              })}
            </ScrollView>
          </ScrollView>

          {/* Ô tìm kiếm */}
          <View style={styles.searchBox}>
            <MaterialIcons name="search" size={18} color="#64748b" />
            <TextInput
              style={styles.textInput}
              placeholder="Tìm theo mã trận / tên (biệt danh)"
              value={query}
              onChangeText={setQuery}
              placeholderTextColor="#9ca3af"
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} style={styles.iconBtn}>
                <MaterialIcons name="close" size={16} color="#6b7280" />
              </Pressable>
            ) : null}
          </View>

          {/* Reset */}
          <Pressable
            onPress={() => {
              setStatus("all");
              setQuery("");
              setSelectedTourneys([]);
            }}
            style={styles.resetBtn}
          >
            <Text style={styles.resetBtnText}>Reset</Text>
          </Pressable>
        </View>

        {/* Accordions */}
        {loadingTours ? (
          <View style={styles.centerBox}>
            <ActivityIndicator />
          </View>
        ) : toursErr ? (
          <View style={styles.alertError}>
            <Text style={styles.alertText}>
              {toursErr?.data?.message ||
                toursErr?.error ||
                "Lỗi tải danh sách giải"}
            </Text>
          </View>
        ) : !tourneys.length ? (
          <View style={[styles.alertInfo, { marginHorizontal: 12 }]}>
            <Text style={styles.alertText}>
              Bạn chưa được phân công ở giải nào.
            </Text>
          </View>
        ) : (
          <ScrollView
            style={{ maxHeight: isLandscape ? 180 : 580, paddingHorizontal: 6 }}
          >
            {listToRender.map((t) => (
              <TournamentAccordion
                key={t._id}
                tournament={t}
                open={!!openAcc[t._id]}
                onToggle={(v) => {
                  if (v) setPage(t._id, 1); // reset page khi mở
                  toggleAccordion(t._id, v);
                }}
                status={status}
                q={q}
                page={pageMap[t._id] || 1}
                onPageChange={(p) => setPage(t._id, p)}
                bracketId={bracketMap[t._id] || "all"}
                onBracketChange={(bid) => {
                  setBracket(t._id, bid);
                  setPage(t._id, 1);
                }}
                pageSize={pageSize}
                onPickMatch={onPickMatch}
                selectedId={selectedId}
              />
            ))}
          </ScrollView>
        )}

        {/* Modal chọn giải */}
      </View>
      <MultiTournamentPicker
        visible={pickerOpen}
        options={tourneys}
        selected={selectedTourneys}
        onChange={setSelectedTourneys}
        onClose={() => setPickerOpen(false)}
      />
    </>
  );
}

/* ================== Styles ================== */
const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    // overflow: "hidden",
    elevation: 1,
  },
  sectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },

  iconBtn: {
    padding: 6,
    borderRadius: 8,
  },

  btnSoft: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#0a84ff11",
    borderRadius: 10,
    marginRight: 8,
  },
  btnSoftText: {
    marginLeft: 6,
    color: "#0a84ff",
    fontWeight: "600",
    fontSize: 12,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginRight: 8,
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  textInput: {
    flex: 1,
    paddingVertical: 6,
    marginLeft: 8,
    color: "#111827",
  },
  resetBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#cbd5e1",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  resetBtnText: { color: "#111827", fontWeight: "600" },

  accordion: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginVertical: 6,
    overflow: "hidden",
  },
  accHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  accTitle: { fontWeight: "700", color: "#0f172a" },
  accSub: { color: "#64748b", fontSize: 12, marginTop: 2 },
  accBody: { padding: 10, paddingTop: 6 },

  alertError: {
    backgroundColor: "#fee2e2",
    padding: 10,
    margin: 10,
    borderRadius: 10,
  },
  alertInfo: {
    backgroundColor: "#eff6ff",
    padding: 10,
    borderRadius: 10,
  },
  alertText: { color: "#111827" },

  centerBox: { padding: 16, alignItems: "center", justifyContent: "center" },
  rowCenter: { flexDirection: "row", alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowText: { marginLeft: 10, color: "#111827" },

  primaryBtn: {
    backgroundColor: "#0a84ff",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "white", fontWeight: "700" },

  matchItem: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  matchTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  matchCode: { fontWeight: "700", color: "#0f172a" },
  matchMeta: { color: "#6b7280", fontSize: 12, marginTop: 2 },
  chipsRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  matchPairs: { marginTop: 8, color: "#111827" },

  pagination: {
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  pageBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  disabledBtn: { opacity: 0.4 },
  pageBtnText: { color: "#111827", fontWeight: "600" },
  pageText: { color: "#111827", fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
});
