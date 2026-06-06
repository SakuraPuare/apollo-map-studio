import type { ScenarioDoc } from '@/types/scenario';
import { obstacleColor } from '@/io/scenario/scenarioFeatures';

/**
 * 从激活场景文档派生时间轴轨道（替代旧的硬编码 demo 轨道）。
 *
 * 每个动态实体一条轨道，关键帧标注「该时刻发生了什么」：
 *   - 障碍物：触发起始时刻 + 各 speedAction/laneChange 事件的触发时刻；
 *   - 红绿灯：配时方案各相位的切换时刻（累加 keepTime）；
 *   - ego：起点(0)、终点(duration)。
 *
 * 纯函数，便于单测 & 与渲染解耦。
 */

export interface TimelineKeyframe {
  time: number; // 秒
  label: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  color: string;
  keyframes: TimelineKeyframe[];
}

const EGO_COLOR = '#38bdf8';
const TL_TRACK_COLOR = '#22c55e';

export function buildTimelineTracks(doc: ScenarioDoc, duration: number): TimelineTrack[] {
  const tracks: TimelineTrack[] = [];

  // ego
  tracks.push({
    id: 'ego',
    name: 'Ego',
    color: EGO_COLOR,
    keyframes: [
      { time: 0, label: 'start' },
      { time: duration, label: 'end' },
    ],
  });

  // 障碍物
  for (const ob of doc.obstacles) {
    const kfs: TimelineKeyframe[] = [];
    const start =
      ob.triggerType === 'TIME' && typeof ob.triggerValue === 'number' ? ob.triggerValue : 0;
    kfs.push({ time: start, label: ob.moving ? 'move' : 'spawn' });
    for (const ev of ob.events) {
      if (ev.trigger?.kind === 'simulationTime') {
        kfs.push({ time: ev.trigger.value, label: ev.action.kind });
      }
    }
    tracks.push({
      id: `ob-${ob.uid}`,
      name: `${ob.name} · ${ob.kind}`,
      color: obstacleColor(ob.kind),
      keyframes: kfs.sort((a, b) => a.time - b.time),
    });
  }

  // 红绿灯
  for (const tl of doc.trafficLights) {
    const kfs: TimelineKeyframe[] = [];
    let t = tl.triggerType === 'TIME' && typeof tl.triggerValue === 'number' ? tl.triggerValue : 0;
    for (const st of tl.stateGroup) {
      kfs.push({ time: t, label: st.color });
      if (typeof st.keepTime === 'number' && st.keepTime > 0) t += st.keepTime;
    }
    if (kfs.length === 0) kfs.push({ time: 0, label: tl.initialColor });
    tracks.push({
      id: `tl-${tl.uid}`,
      name: `Signal ${tl.signalId}`,
      color: TL_TRACK_COLOR,
      keyframes: kfs,
    });
  }

  return tracks;
}
