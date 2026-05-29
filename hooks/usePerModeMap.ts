import { useState, useCallback } from 'react';
import { InputMode } from '../types';

/**
 * Per-mode 隔離的 Map state。
 *
 * image 與 storyline 兩種 InputMode 各擁有自己的 Map<K, V>，切換模式時自動
 * 切到對應 bucket，read / write 都只看到當前模式的資料；舊模式資料保留在
 * 自己的 bucket，切回去仍在。
 *
 * 取代 App.tsx 內三份重複的「by-mode Record + 包裝 setter」樣板（slideHistory
 * / slideImageOverlays / segmentImageBindings）。
 *
 * 用法：
 *   const { current, set } = usePerModeMap<number, SlideData[]>(state.inputMode);
 *   const stack = current.get(idx);          // 讀當前模式 bucket
 *   set(prev => new Map(prev).set(idx, [])); // 寫當前模式 bucket
 */
export function usePerModeMap<K, V>(mode: InputMode): {
  current: Map<K, V>;
  set: (updater: Map<K, V> | ((prev: Map<K, V>) => Map<K, V>)) => void;
} {
  const [byMode, setByMode] = useState<Record<InputMode, Map<K, V>>>(() => ({
    image: new Map<K, V>(),
    storyline: new Map<K, V>(),
  }));

  const current = byMode[mode];

  // 包裝 setter：updater 接到 / 回傳的是「當前模式」的 Map，外層 byMode
  // record 由內部維護。`mode` 隨 prop 變化，閉包每次 render 重新建立 →
  // setByMode 內 prev[mode] 永遠指到呼叫當下的模式。
  const set = useCallback(
    (updater: Map<K, V> | ((prev: Map<K, V>) => Map<K, V>)) => {
      setByMode(prev => {
        const next = typeof updater === 'function'
          ? (updater as (p: Map<K, V>) => Map<K, V>)(prev[mode])
          : updater;
        return { ...prev, [mode]: next };
      });
    },
    [mode],
  );

  return { current, set };
}
