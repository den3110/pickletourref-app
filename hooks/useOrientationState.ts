import { useEffect, useMemo, useState } from "react";
import { Dimensions } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

/** Map enum -> 'portrait' | 'landscape' | 'unknown' */
function mapOrientation(o) {
  switch (o) {
    case ScreenOrientation.Orientation.PORTRAIT_UP:
    case ScreenOrientation.Orientation.PORTRAIT_DOWN:
      return "portrait";
    case ScreenOrientation.Orientation.LANDSCAPE_LEFT:
    case ScreenOrientation.Orientation.LANDSCAPE_RIGHT:
      return "landscape";
    default:
      return "unknown";
  }
}

export function useExpoOrientation() {
  const [orientation, setOrientation] = useState("unknown");
  const [lock, setLock] = useState(null); // current OrientationLock (optional)

  useEffect(() => {
    let sub = null;
    let mounted = true;

    const guessFromWindow = () => {
      const { width, height } = Dimensions.get("window");
      return width > height ? "landscape" : "portrait";
    };

    (async () => {
      try {
        const [o, l] = await Promise.all([
          ScreenOrientation.getOrientationAsync(),
          ScreenOrientation.getOrientationLockAsync(),
        ]);
        if (!mounted) return;
        const mapped = mapOrientation(o);
        setOrientation(mapped === "unknown" ? guessFromWindow() : mapped);
        setLock(l ?? null);
      } catch {
        // Fallback nếu API lỗi
        setOrientation(guessFromWindow());
      }

      sub = ScreenOrientation.addOrientationChangeListener((evt) => {
        const mapped = mapOrientation(evt.orientationInfo?.orientation);
        setOrientation(mapped);
        if (evt.rotationLock != null) setLock(evt.rotationLock);
      });
    })();

    return () => {
      mounted = false;
      if (sub) ScreenOrientation.removeOrientationChangeListener(sub);
    };
  }, []);

  const isLandscape = orientation === "landscape";
  const isPortrait = orientation === "portrait";
  const { width, height } = Dimensions.get("window");

  // Helpers khóa/mở khoá
  const lockPortrait = () =>
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  const lockLandscape = () =>
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  const unlockAll = () => ScreenOrientation.unlockAsync();

  // Toggle nhanh: nếu đang ngang -> khoá dọc, ngược lại khoá ngang
  const toggle = async () => {
    if (isLandscape) {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
      setOrientation("portrait");
    } else {
      await ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.LANDSCAPE
      );
      setOrientation("landscape");
    }
  };

  return {
    orientation, // 'portrait' | 'landscape' | 'unknown'
    isLandscape,
    isPortrait,
    width,
    height,
    lock, // OrientationLock hiện tại (optional)
    lockPortrait,
    lockLandscape,
    unlockAll,
    toggle,
  };
}
