/**
 * 将 react-icons SVG 组件栅格化注册到 MapLibre。
 *
 * 底层逻辑：
 *   MapLibre symbol 层在 WebGL canvas 里渲染，React DOM 进不去。
 *   要在地图上用 react-icons，必须先 SVG → ImageData → map.addImage()。
 *
 * 注册的图标 id（与 GeoJSON feature 的 `icon` 属性一一对应）：
 *   icon-parking  → FaSquareParking   （车位 🅿️）
 *   icon-signal   → FaTrafficLight    （信号灯 🚦）
 *   icon-barrier  → FaRoadBarrier     （道闸 🚧）
 *   icon-stop     → BsSignStop        （停车标志 🛑）
 *   icon-yield    → BsSignYieldFill   （让行标志 🔻）
 *   icon-speed-bump → PiWarningDiamondFill （减速带 ⚠️）
 */
import type { ComponentType, ReactElement } from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import maplibregl from 'maplibre-gl';
import { FaSquareParking, FaTrafficLight, FaRoadBarrier } from 'react-icons/fa6';
import { BsSignStop, BsSignYieldFill } from 'react-icons/bs';
import { PiWarningDiamondFill } from 'react-icons/pi';

const ICON_PX = 64;
const ICON_COLOR = '#ffffff';

type IconProps = { size?: number | string; color?: string };

const REGISTRY: Record<string, ComponentType<IconProps>> = {
  'icon-parking': FaSquareParking,
  'icon-signal': FaTrafficLight,
  'icon-barrier': FaRoadBarrier,
  'icon-stop': BsSignStop,
  'icon-yield': BsSignYieldFill,
  'icon-speed-bump': PiWarningDiamondFill,
};

export const MAP_ICON_PX = ICON_PX;

/**
 * 把 react-icons 组件渲染成 ImageData。
 * 走 SVG-blob → HTMLImageElement → Canvas 路径，依赖 DOM/Canvas，
 * 因此只能在浏览器主线程调用（不是 worker）。
 */
async function rasterize(Icon: ComponentType<IconProps>): Promise<ImageData> {
  const node: ReactElement = createElement(Icon, { size: ICON_PX, color: ICON_COLOR });
  const inner = renderToStaticMarkup(node);
  // react-icons 输出的 <svg> 默认无 xmlns；补上以便 Image 能加载
  const svg = inner.includes('xmlns=')
    ? inner
    : inner.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(ICON_PX, ICON_PX);
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('icon svg load failed'));
      i.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = ICON_PX;
    canvas.height = ICON_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.clearRect(0, 0, ICON_PX, ICON_PX);
    ctx.drawImage(img, 0, 0, ICON_PX, ICON_PX);
    return ctx.getImageData(0, 0, ICON_PX, ICON_PX);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 批量把 REGISTRY 里的 icon 注册到 map。已存在的会跳过。
 * 失败的图标不阻塞其他图标注册（错误打到 console）。
 */
export async function registerMapIcons(map: maplibregl.Map): Promise<void> {
  const tasks = Object.entries(REGISTRY).map(async ([id, Icon]) => {
    if (map.hasImage(id)) return;
    try {
      const data = await rasterize(Icon);
      // hasImage 二次检查：异步期间可能已注册（HMR / 重复 load）
      if (!map.hasImage(id)) map.addImage(id, data);
    } catch (err) {
      console.error(`[mapIcons] failed to register ${id}`, err);
    }
  });
  await Promise.all(tasks);
}
