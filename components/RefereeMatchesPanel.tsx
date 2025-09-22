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
  useWindowDimensions,
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
} from "./AdminRefereeConsole";
import { useExpoOrientation } from "@/hooks/useOrientationState";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { usePlatform } from "@/hooks/usePlatform";

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

function SectionHeader({ title, right, onLayout }) {
  return (
    <View style={styles.sectionHeader} onLayout={onLayout}>
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
function MultiTournamentPicker({
  visible,
  options,
  selected,
  onChange,
  onClose,
}) {
  const origRef = React.useRef(selected);

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

  const selectAll = useCallback(() => onChange(options), [options, onChange]);
  const deselectAll = useCallback(() => onChange([]), [onChange]);
  const resetToOrig = useCallback(
    () => onChange(origRef.current || []),
    [onChange]
  );

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
  page,
  onPageChange,
  bracketId,
  onBracketChange,
  pageSize,
  onPickMatch,
  selectedId,
}) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query, 400);
  const [statusLocal, setStatusLocal] = useState("all");

  useEffect(() => {
    if (open) onPageChange(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, bracketId, statusLocal, open]);

  const dashAll = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212_-]/g;
  const canon = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(dashAll, "-")
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9#-]/g, "");

  const addComboVariants = (str) => {
    const withHashDash = str;
    const noHash = str.replace(/#/g, "");
    const noDash = str.replace(/-/g, "");
    const noHashNoDash = noHash.replace(/-/g, "");
    return [withHashDash, noHash, noDash, noHashNoDash];
  };

  const codeVariantsOf = (m) => {
    const codeFromFn = matchCode?.(m) || "";
    const rawCode = m?.codeResolved || m?.code || "";
    const disp = displayOrder?.(m);

    const bases = [];
    if (codeFromFn) bases.push(codeFromFn);
    if (rawCode && rawCode !== codeFromFn) bases.push(rawCode);

    const vars = new Set();
    for (const base of bases) {
      const b = String(base);
      addComboVariants(b).forEach((v) => vars.add(v));
      if (!b.includes("#") && Number.isFinite(disp)) {
        addComboVariants(`${b}#${disp}`).forEach((v) => vars.add(v));
      }
    }
    return Array.from(vars)
      .filter(Boolean)
      .map((v) => canon(v));
  };

  const pairNickJoined = (m, evt) => {
    const a = pairLabel?.(m?.pairA, evt) || "";
    const b = pairLabel?.(m?.pairB, evt) || "";
    const s1 = canon(`${a}|${b}`);
    const s2 = s1.replace(/-/g, "");
    return [s1, s2];
  };

  const extraFieldsJoined = (m) => {
    const court = m?.court?.name || m?.courtName || "";
    const brName = m?.bracket?.name || "";
    const brType = m?.bracket?.type || "";
    const gnote = poolNote?.(m) || "";
    const roundStr = Number.isFinite(m?.round) ? `r${m.round}` : "";
    const s1 = canon(`${court}|${brName}|${brType}|${gnote}|${roundStr}`);
    const s2 = s1.replace(/-/g, "");
    return [s1, s2];
  };

  const normalizedQ = useMemo(() => canon(q), [q]);
  const qNoHash = useMemo(() => normalizedQ.replace(/#/g, ""), [normalizedQ]);
  const qNoDash = useMemo(() => normalizedQ.replace(/-/g, ""), [normalizedQ]);
  const qNoHashNoDash = useMemo(() => qNoHash.replace(/-/g, ""), [qNoHash]);

  const queryForms = useMemo(
    () =>
      Array.from(
        new Set([normalizedQ, qNoHash, qNoDash, qNoHashNoDash].filter(Boolean))
      ),
    [normalizedQ, qNoHash, qNoDash, qNoHashNoDash]
  );

  const { data: brData, isLoading: brLoading } = useGetRefereeBracketsQuery(
    { tournamentId: tournament._id },
    { skip: !open }
  );
  const brackets = brData?.items || [];

  const searching = !!normalizedQ;
  const effectivePageSize = searching
    ? Math.max(50, Math.min(200, pageSize * 20))
    : pageSize;
  const effectivePage = searching ? 1 : page;

  const queryArgs = useMemo(() => {
    const args = {
      tournamentId: tournament._id,
      page: effectivePage,
      pageSize: effectivePageSize,
    };
    if (statusLocal && statusLocal !== "all") args.status = statusLocal;
    if (bracketId && bracketId !== "all") args.bracketId = bracketId;
    return args;
  }, [
    tournament._id,
    statusLocal,
    bracketId,
    effectivePage,
    effectivePageSize,
  ]);

  const {
    data: matchesResp,
    isFetching: listFetching,
    isLoading: listLoading,
    isUninitialized: listUninitialized,
    error: listErr,
    refetch: refetchList,
  } = useListRefereeMatchesByTournamentQuery(queryArgs, { skip: !open });

  const items = matchesResp?.items || [];

  const baseValid = useMemo(
    () =>
      (items || []).filter((m) => {
        if (!m || typeof m !== "object" || !m._id) return false;
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

  const filteredItems = useMemo(() => {
    if (!searching) return baseValid;
    return baseValid.filter((m) => {
      const evt = (m?.tournament?.eventType || "double").toLowerCase();

      const codeForms = codeVariantsOf(m);
      const codeHit = codeForms.some((c) =>
        queryForms.some((qf) => c.includes(qf))
      );
      if (codeHit) return true;

      const pairForms = pairNickJoined(m, evt);
      if (pairForms.some((pf) => queryForms.some((qf) => pf.includes(qf))))
        return true;

      const extraForms = extraFieldsJoined(m);
      if (extraForms.some((ef) => queryForms.some((qf) => ef.includes(qf))))
        return true;

      return false;
    });
  }, [baseValid, searching, queryForms]);

  const showPagination = !searching;
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

  const renderMatchCode = (m) => matchCode(m);

  const groupChipFrom = (m) => {
    const isGroup = (m?.bracket?.type || "") === "group";
    const gi = m?.groupIndex;
    if (!isGroup || !Number.isFinite(gi)) return null;
    const label = `Bảng ${gi}`;
    const pn = poolNote?.(m);
    if (pn && String(pn).toLowerCase() === String(label).toLowerCase())
      return null;
    return label;
  };

  const statusOrder = [
    "all",
    "scheduled",
    "queued",
    "assigned",
    "live",
    "finished",
  ];

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
      {/* 🔎 Search */}
      <View style={[styles.searchBox, { marginBottom: 8 }]}>
        <MaterialIcons name="search" size={18} color="#64748b" />
        <TextInput
          style={styles.textInput}
          placeholder="Tìm: v1-b1, v1-b1#1, v1b11, biệt danh…"
          value={query}
          onChangeText={setQuery}
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} style={styles.iconBtn}>
            <MaterialIcons name="close" size={16} color="#6b7280" />
          </Pressable>
        ) : null}
      </View>

      {/* 🔘 Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        style={{ marginBottom: 8 }}
      >
        {statusOrder.map((s) => {
          const { label, color } = getMatchStatusChip(s);
          return (
            <Chip
              key={s}
              label={label}
              color={color}
              outlined={statusLocal !== s}
              selected={statusLocal === s}
              onPress={() => setStatusLocal(s)}
            />
          );
        })}
        {listFetching ? (
          <View style={[styles.rowCenter, { marginLeft: 8 }]}>
            <ActivityIndicator size="small" />
          </View>
        ) : null}
      </ScrollView>

      {/* Bracket filter */}
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
            keyboardShouldPersistTaps="handled"
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
              disabled={showPagination ? page <= 1 : true}
              style={[
                styles.pageBtn,
                (showPagination ? page <= 1 : true) && styles.disabledBtn,
              ]}
            >
              <MaterialIcons name="chevron-left" size={18} color="#111827" />
              <Text style={styles.pageBtnText}>Trước</Text>
            </Pressable>
            <Text style={styles.pageText}>
              Trang {showPagination ? page : 1}/
              {showPagination ? totalPages : 1}
            </Text>
            <Pressable
              onPress={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={showPagination ? page >= totalPages : true}
              style={[
                styles.pageBtn,
                (showPagination ? page >= totalPages : true) &&
                  styles.disabledBtn,
              ]}
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
      router.replace("/");
    }
  }, [dispatch]);

  const confirmLogout = useCallback((e) => {
    if (Platform.OS === "ios") {
      const maybeAnchor = e?.nativeEvent?.target;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: "Đăng xuất",
          message: "Bạn có chắc muốn đăng xuất?",
          options: ["Huỷ", "Đăng xuất"],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 1,
          userInterfaceStyle: "light",
          ...(maybeAnchor ? { anchor: maybeAnchor } : {}),
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

  const {
    data: tourneysData,
    isLoading: loadingTours,
    error: toursErr,
    refetch: refetchTours,
  } = useGetRefereeTournamentsQuery();

  useEffect(() => {
    if (typeof refreshSignal !== "undefined") refetchTours();
  }, [refreshSignal, refetchTours]);

  const tourneys = useMemo(() => tourneysData?.items || [], [tourneysData]);

  const [selectedTourneys, setSelectedTourneys] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const listToRender = useMemo(() => {
    if (!selectedTourneys.length) return tourneys;
    const set = new Set(selectedTourneys.map((t) => t._id));
    return tourneys.filter((t) => set.has(t._id));
  }, [tourneys, selectedTourneys]);

  const [openAcc, setOpenAcc] = useState({});
  const [pageMap, setPageMap] = useState({});
  const [bracketMap, setBracketMap] = useState({});
  const toggleAccordion = (tid, next) =>
    setOpenAcc((m) => ({
      ...m,
      [tid]: typeof next === "boolean" ? next : !m[tid],
    }));
  const setPage = (tid, p) => setPageMap((m) => ({ ...m, [tid]: p }));
  const setBracket = (tid, bid) =>
    setBracketMap((m) => ({ ...m, [tid]: bid || "all" }));

  const { isLandscape } = useExpoOrientation();
  const { height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const navHeaderH = useHeaderHeight();

  // ---- đo topBarH (portrait) & leftBarW (landscape) ----
  const [topBarH, setTopBarH] = useState(0);
  const onTopBarLayout = useCallback((e) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setTopBarH((p) => (p === h ? p : h));
  }, []);

  const [leftBarW, setLeftBarW] = useState(0);
  const onLeftBarLayout = useCallback((e) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setLeftBarW((p) => (p === w ? p : w)); // dùng w thực đo để “calc(100% - w)”
  }, []);

  // Chiều cao panel tổng (container)
  const panelH = Math.max(
    240,
    Math.round(winH - navHeaderH - (insets?.bottom ?? 0))
  );

  return (
    <>
      <View style={[styles.card, { height: panelH }]}>
        {/* --------- PORTRAIT: TOP BAR cố định --------- */}
        {/* man doc */}
        {!isLandscape && (
          <>
            <View style={styles.topBar} onLayout={onTopBarLayout}>
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

              {/* Filter (không scroll, wrap xuống dòng) */}
              <View style={{ padding: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <MaterialIcons name="filter-alt" size={16} color="#64748b" />
                  <Text
                    style={{
                      marginLeft: 6,
                      fontWeight: "700",
                      color: "#111827",
                    }}
                  >
                    Bộ lọc
                  </Text>
                </View>

                <View style={styles.wrapRow}>
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
                </View>

                <Pressable
                  onPress={() => setSelectedTourneys([])}
                  style={styles.resetBtn}
                >
                  <Text style={styles.resetBtnText}>Reset</Text>
                </Pressable>
              </View>
            </View>

            {/* Danh sách: kê paddingTop = topBarH */}
            {/* CONTENT tuyệt đối: khung cuộn = cardHeight - topBarH */}
            <View style={[styles.contentPane, { top: topBarH }]}>
              {loadingTours ? (
                <View style={[styles.centerBox, { flex: 1 }]}>
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
                  style={{ flex: 1, paddingHorizontal: 6, marginBottom: 20 }}
                  contentContainerStyle={{ paddingBottom: 12 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                >
                  {listToRender.map((t) => (
                    <TournamentAccordion
                      key={t._id}
                      tournament={t}
                      open={!!openAcc[t._id]}
                      onToggle={(v) => {
                        if (v) setPage(t._id, 1);
                        toggleAccordion(t._id, v);
                      }}
                      page={pageMap[t._id] || 1}
                      onPageChange={(p) => setPage(t._id, p)}
                      bracketId={bracketMap[t._id] || "all"}
                      onBracketChange={(bid) => {
                        setBracket(t._id, bid);
                        setPage(t._id, 1);
                      }}
                      pageSize={10}
                      onPickMatch={onPickMatch}
                      selectedId={selectedId}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          </>
        )}

        {/* --------- LANDSCAPE: LEFT BAR cố định + nội dung bên phải (width = 100% - leftBarW) --------- */}
        {isLandscape && (
          <>
            {/* LEFT sidebar cố định, không scroll */}
            <View style={styles.leftBar} onLayout={onLeftBarLayout}>
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
              <View style={{ padding: 12 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <MaterialIcons name="filter-alt" size={16} color="#64748b" />
                  <Text
                    style={{
                      marginLeft: 6,
                      fontWeight: "700",
                      color: "#111827",
                    }}
                  >
                    Bộ lọc
                  </Text>
                </View>

                <View style={styles.wrapRow}>
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
                </View>

                <Pressable
                  onPress={() => setSelectedTourneys([])}
                  style={styles.resetBtn}
                >
                  <Text style={styles.resetBtnText}>Reset</Text>
                </Pressable>
              </View>
            </View>

            {/* CONTENT bên phải: width = 100% - leftBarW (thực hiện bằng marginLeft) */}
            <View style={[styles.rightPane, { marginLeft: leftBarW }]}>
              {loadingTours ? (
                <View style={[styles.centerBox, { flex: 1 }]}>
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
                  style={{ flex: 1, paddingHorizontal: 6 }}
                  contentContainerStyle={{
                    paddingBottom:
                      Platform.OS === "android"
                        ? (insets?.bottom ?? 24) + 24 // safe-area (nếu có, else 24) + gutter 24
                        : 0,
                  }}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  overScrollMode="never"
                >
                  {listToRender.map((t) => (
                    <TournamentAccordion
                      key={t._id}
                      tournament={t}
                      open={!!openAcc[t._id]}
                      onToggle={(v) => {
                        if (v) setPage(t._id, 1);
                        toggleAccordion(t._id, v);
                      }}
                      page={pageMap[t._id] || 1}
                      onPageChange={(p) => setPage(t._id, p)}
                      bracketId={bracketMap[t._id] || "all"}
                      onBracketChange={(bid) => {
                        setBracket(t._id, bid);
                        setPage(t._id, 1);
                      }}
                      pageSize={10}
                      onPickMatch={onPickMatch}
                      selectedId={selectedId}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          </>
        )}
      </View>

      {/* Modal chọn giải */}
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
    elevation: 1,
    overflow: "hidden",
    position: "relative",
  },

  // --- PORTRAIT TOP BAR ---
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    zIndex: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#e5e7eb",
  },

  // --- LANDSCAPE LEFT BAR ---
  leftBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: "#fff",
    borderRightWidth: 1,
    borderColor: "#e5e7eb",
    // KHÔNG set width cố định: để nội dung tự đo width, onLayout => leftBarW
    // Bạn có thể thêm maxWidth nhẹ nếu muốn tránh quá rộng:
    maxWidth: 480,
  },
  rightPane: {
    flex: 1,
    minWidth: 0, // tránh overflow khi marginLeft lớn
  },

  sectionHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },

  iconBtn: { padding: 6, borderRadius: 8 },

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

  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
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
  textInput: { flex: 1, paddingVertical: 6, marginLeft: 8, color: "#111827" },

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
  alertInfo: { backgroundColor: "#eff6ff", padding: 10, borderRadius: 10 },
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
  // vùng nội dung cuộn trong portrait (chiếm phần còn lại bên dưới topBar)
  contentPane: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // top sẽ set động = topBarH
    backgroundColor: "#fff",
  },
});
