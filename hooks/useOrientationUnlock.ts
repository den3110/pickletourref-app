// useOrientationUnlock.ts (hoặc đặt ngay trong file)
import { useEffect } from "react";
import * as ScreenOrientation from "expo-screen-orientation";

export function useOrientationUnlock(enabled: boolean) {
  useEffect(() => {
    let prevLock: ScreenOrientation.OrientationLock | null = null;
    let cancelled = false;

    (async () => {
      if (!enabled) return;
      try {
        prevLock = await ScreenOrientation.getOrientationLockAsync();
        await ScreenOrientation.unlockAsync(); // cho xoay tự do khi mở
      } catch {}

      // nếu component bị unmount sớm, restore ngay
      if (cancelled && prevLock != null) {
        try {
          await ScreenOrientation.lockAsync(prevLock);
        } catch {}
      }
    })();

    return () => {
      cancelled = true;
      if (prevLock != null) {
        // khôi phục trạng thái lock trước đó
        ScreenOrientation.lockAsync(prevLock).catch(() => {});
      }
    };
  }, [enabled]);
}
