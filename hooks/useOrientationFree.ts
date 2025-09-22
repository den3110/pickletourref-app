// hooks/useOrientationFree.ts
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";

let _refCount = 0;
let _prevLock: ScreenOrientation.OrientationLock | null = null;
let _applied = false;

export function useOrientationFree(active: boolean) {
  const hadActive = useRef(false);

  useEffect(() => {
    let mounted = true;

    const apply = async () => {
      try {
        if (active && !hadActive.current) {
          hadActive.current = true;
          _refCount += 1;

          // Chỉ unlock một lần duy nhất cho mọi consumer
          if (!_applied) {
            try {
              _prevLock = await ScreenOrientation.getOrientationLockAsync();
            } catch {}
            // Cho phép xoay theo sensor (tương đương "default")
            await ScreenOrientation.unlockAsync();
            _applied = true;
          }
        }

        if (!active && hadActive.current) {
          hadActive.current = false;
          _refCount = Math.max(0, _refCount - 1);

          if (_applied && _refCount === 0) {
            // Khôi phục lock trước đó
            const restore =
              _prevLock ?? ScreenOrientation.OrientationLock.PORTRAIT_UP;
            try {
              await ScreenOrientation.lockAsync(restore);
            } catch {}
            _prevLock = null;
            _applied = false;
          }
        }
      } catch {}
    };

    apply();

    return () => {
      if (!mounted) return;
      if (hadActive.current) {
        hadActive.current = false;
        _refCount = Math.max(0, _refCount - 1);

        if (_applied && _refCount === 0) {
          (async () => {
            const restore =
              _prevLock ?? ScreenOrientation.OrientationLock.PORTRAIT_UP;
            try {
              await ScreenOrientation.lockAsync(restore);
            } catch {}
            _prevLock = null;
            _applied = false;
          })();
        }
      }
      mounted = false;
    };
  }, [active]);
}
