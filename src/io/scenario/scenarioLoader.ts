import { nanoid } from 'nanoid';
import { pickFiles, downloadBlob } from '@/io/fileIO';
import { parseScenario } from './parse';
import { serializeScenario } from './serialize';
import { detectScenarioFormat } from './detect';
import { useScenarioStore, type LoadedScenario } from '@/store/scenarioStore';
import { useApolloMapStore } from '@/store/apolloMapStore';
import { useProjDialogStore } from '@/store/projDialogStore';
import type { ScenarioDoc, ScenarioFormat } from '@/types/scenario';

export interface LoadScenariosResult {
  loaded: number;
  failed: { filename: string; reason: string }[];
}

/** 场景 JSON 单文件大小上限（字节）。超出则跳过，避免主线程同步 JSON.parse 卡死 UI。
 *  真实语料最大约数百 KB，16 MB 留足余量。 */
const MAX_SCENARIO_BYTES = 16 * 1024 * 1024;

/**
 * 让用户选择一个或多个场景 JSON 文件并加载进 scenarioStore。
 *
 * 投影来源（决定 x/y 米如何投到 lngLat 渲染）：
 *   1. 已导入地图的 projString（apolloMapStore.info）—— 最常见，场景与地图同 CRS；
 *   2. 否则弹 ProjPickerDialog 让用户选（projDialogStore）。
 *
 * 不读取本地目录（按用户要求）；纯文件选择器，桌面/Web 通用。
 */
export async function loadScenariosFromPicker(): Promise<LoadScenariosResult | null> {
  const files = await pickFiles('application/json,.json');
  if (files.length === 0) return null;

  const proj = await resolveProjString();
  if (!proj) return null; // user cancelled projection picker

  const store = useScenarioStore.getState();
  store.setProjString(proj);

  const settled = await Promise.all(files.map(loadScenarioFile));
  const result: LoadScenariosResult = {
    loaded: 0,
    failed: [],
  };
  for (const item of settled) {
    if ('entry' in item) {
      store.addLoaded(item.entry);
      result.loaded++;
    } else {
      result.failed.push(item.failed);
    }
  }
  return result;
}

type LoadScenarioFileResult =
  { entry: LoadedScenario } | { failed: LoadScenariosResult['failed'][number] };

async function loadScenarioFile(file: File): Promise<LoadScenarioFileResult> {
  try {
    if (file.size > MAX_SCENARIO_BYTES) {
      return {
        failed: {
          filename: file.name,
          reason: `file too large (${(file.size / 1024 / 1024).toFixed(1)} MB > 16 MB)`,
        },
      };
    }
    const text = await file.text();
    const json = JSON.parse(text);
    if (detectScenarioFormat(json) === null) {
      return { failed: { filename: file.name, reason: 'not a recognized scenario file' } };
    }
    const doc = parseScenario(json);
    return { entry: makeLoadedEntry(file.name, doc) };
  } catch (err) {
    return {
      failed: {
        filename: file.name,
        reason: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

function makeLoadedEntry(filename: string, doc: ScenarioDoc): LoadedScenario {
  return { key: nanoid(), filename, doc };
}

/** 解析渲染投影：优先用已加载地图的，缺失则请求用户选择。 */
async function resolveProjString(): Promise<string | null> {
  const existing = useScenarioStore.getState().projString;
  if (existing) return existing;
  const mapProj = useApolloMapStore.getState().info?.projString;
  if (mapProj) return mapProj;
  return useProjDialogStore.getState().request();
}

/** 把当前激活场景序列化并触发下载（保存）。文件名沿用来源名。 */
export function saveActiveScenario(): boolean {
  const state = useScenarioStore.getState();
  const entry = state.loaded.find((l) => l.key === state.activeKey);
  if (!entry) return false;
  const json = serializeScenario(entry.doc);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  downloadBlob(blob, entry.filename);
  return true;
}

/**
 * 新建一份空场景并设为激活。投影沿用已加载地图/已设投影，缺失则弹 ProjPickerDialog；
 * 用户取消则不创建。新建文档的 raw 是可 append 的合法骨架（见 factory）。
 */
export async function newScenarioFromUI(format: ScenarioFormat): Promise<boolean> {
  const proj = await resolveProjString();
  if (!proj) return false; // user cancelled projection picker
  const store = useScenarioStore.getState();
  store.setProjString(proj);
  store.newScenario(format);
  return true;
}
