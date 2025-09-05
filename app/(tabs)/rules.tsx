// app/(tabs)/rules.tsx
import React, { useEffect, useState } from "react";
import {
  LayoutAnimation,
  Platform,
  UIManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

/* Enable LayoutAnimation on Android */
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/* ===== Static basic rules (Pickleball) ===== */
type RuleItem = { title: string; bullets: string[]; open?: boolean };

const BASIC_RULES: RuleItem[] = [
  {
    title: "Sân & Dụng cụ",
    bullets: [
      "Sân 6.10m × 13.41m; lưới cao 91,4 cm ở biên và 86 cm ở giữa.",
      "Khu NVZ (khu bếp) cách lưới 2,13m mỗi bên — không được volley trong khu này.",
      "Vợt rắn, bóng nhựa có lỗ tiêu chuẩn.",
    ],
  },
  {
    title: "Giao bóng",
    bullets: [
      "Giao bóng dưới tay, tiếp xúc bóng thấp hơn eo.",
      "Giao chéo sân, đứng sau baseline; không chạm vạch.",
      "Một cơ hội giao (trừ let theo luật giải áp dụng).",
    ],
  },
  {
    title: "Luật 2 Nảy (Double Bounce)",
    bullets: [
      "Bên nhận phải để bóng nảy 1 lần rồi mới trả.",
      "Bên giao cũng phải để bóng nảy 1 lần ở lần chạm kế tiếp.",
      "Sau 2 nảy, được phép volley nhưng không đứng trong NVZ.",
    ],
  },
  {
    title: "Lỗi (Faults)",
    bullets: [
      "Bóng ra ngoài, chạm lưới không qua, chạm người/dụng cụ.",
      "Vào NVZ khi volley, chạm vạch NVZ khi volley.",
      "Giao bóng sai ô, sai thứ tự, hoặc sai người.",
    ],
  },
  {
    title: "Tính điểm",
    bullets: [
      "Chỉ bên giao ghi điểm.",
      "Trận thường đến 11 điểm, cách 2; theo giải có thể 15/21.",
      "Cách đọc điểm: Người giao – Người nhận – Số thứ tự người giao (đôi).",
    ],
  },
  {
    title: "Thứ tự giao (Đánh đôi)",
    bullets: [
      "Bên bắt đầu ván: chỉ người giao thứ 2 (điểm đọc là 0-0-2).",
      "Sau mỗi điểm, người giao đổi vị trí với đồng đội.",
      "Mất quyền giao: chuyển sang đối phương (side out).",
    ],
  },
  {
    title: "Time-out & Trọng tài",
    bullets: [
      "Time-out theo quy định hiện hành (thường 1–2 lần/ván, 60s).",
      "Trọng tài chính quyết định cuối cùng; có thể tham khảo line judge.",
    ],
  },
];

/* ===== Helpers ===== */
function matchesRule(item: RuleItem, keyword: string) {
  if (!keyword) return true;
  const hit = (s: string) => s.toLowerCase().includes(keyword.toLowerCase());
  return hit(item.title) || item.bullets.some(hit);
}

/* ===== Accordion item ===== */
function AccordionItem({
  item,
  onToggle,
  keyword,
}: {
  item: RuleItem;
  onToggle: () => void;
  keyword: string;
}) {
  const hit = (s: string) => s.toLowerCase().includes(keyword.toLowerCase());
  // Ẩn item nếu không khớp keyword
  if (!matchesRule(item, keyword)) return null;

  return (
    <View style={styles.accItem}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          onToggle();
        }}
        style={({ pressed }) => [styles.accHeader, pressed && { opacity: 0.9 }]}
      >
        <Text style={styles.accTitle}>{item.title}</Text>
        <Text style={styles.accChevron}>{item.open ? "▲" : "▼"}</Text>
      </Pressable>

      {item.open ? (
        <View style={styles.accBody}>
          {item.bullets
            .filter((b) => !keyword || hit(b))
            .map((b, i) => (
              <View style={styles.bulletRow} key={i}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

/* ===== Screen ===== */
export default function RulesScreen() {
  const [keyword, setKeyword] = useState("");
  const [rules, setRules] = useState<RuleItem[]>(
    BASIC_RULES.map((r, i) => ({ ...r, open: i === 0 })) // mở mục đầu tiên
  );

  useEffect(() => {
    // Khi đang lọc theo keyword, tự mở tất cả mục để xem nhanh nội dung
    setRules((prev) =>
      prev.map((r, i) => ({ ...r, open: keyword ? true : i === 0 }))
    );
  }, [keyword]);

  const visibleCount = rules.filter((r) => matchesRule(r, keyword)).length;

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          placeholder="Tìm trong luật cơ bản…"
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

      {/* Content */}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 100,
          gap: 10,
        }}
        showsVerticalScrollIndicator={false}
      >
        {visibleCount ? (
          rules.map((r, idx) => (
            <AccordionItem
              key={r.title}
              item={r}
              keyword={keyword}
              onToggle={() =>
                setRules((prev) =>
                  prev.map((it, i) =>
                    i === idx ? { ...it, open: !it.open } : it
                  )
                )
              }
            />
          ))
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Không tìm thấy mục phù hợp</Text>
            <Text style={styles.emptySub}>Thử đổi từ khóa khác nhé.</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/* ===== Styles ===== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f7fb" },

  // search
  searchRow: { marginTop: 10, position: "relative", paddingHorizontal: 16 },
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
    right: 24,
    top: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },

  // accordion
  accItem: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  accHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  accTitle: { flex: 1, color: "#0f172a", fontSize: 16, fontWeight: "800" },
  accChevron: { color: "#6b7280", fontWeight: "800" },
  accBody: { paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
  bulletRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bulletDot: {
    color: "#94a3b8",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "900",
  },
  bulletText: { flex: 1, color: "#111827", fontSize: 14, fontWeight: "600" },

  // empty
  emptyBox: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: { color: "#0f172a", fontWeight: "800", fontSize: 16 },
  emptySub: { color: "#6b7280", textAlign: "center" },
});
