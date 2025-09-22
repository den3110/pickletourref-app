import { useEffect, useRef } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

export function usePortraitWhile(active: boolean) {
  const prevLockRef = useRef<ScreenOrientation.OrientationLock | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (active) {
          // lưu lock hiện tại
          try {
            prevLockRef.current =
              await ScreenOrientation.getOrientationLockAsync();
          } catch {}
          // khoá về dọc trong suốt thời gian viewer mở
          await ScreenOrientation.lockAsync(
            ScreenOrientation.OrientationLock.PORTRAIT_UP
          );
        } else if (prevLockRef.current != null) {
          // khôi phục lock cũ
          const restore = prevLockRef.current;
          prevLockRef.current = null;
          await ScreenOrientation.lockAsync(restore);
        }
      } catch {}
    })();

    return () => {
      if (cancelled) return;
      // nếu bị unmount khi còn active → khôi phục
      if (active && prevLockRef.current != null) {
        (async () => {
          try {
            const restore = prevLockRef.current!;
            prevLockRef.current = null;
            await ScreenOrientation.lockAsync(restore);
          } catch {}
        })();
      }
      cancelled = true;
    };
  }, [active]);
}
