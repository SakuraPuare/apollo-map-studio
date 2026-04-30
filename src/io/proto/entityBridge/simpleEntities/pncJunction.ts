import type { Passage, PassageGroup, PNCJunctionEntity } from '@/types/apollo';
import {
  convertPolygonFromProto,
  convertPolygonToProto,
  unwrapId,
  unwrapIdArray,
  wrapId,
  wrapIdArray,
  type RawId,
  type RawPolygon,
} from '../common';
import { PASSAGE_TYPE, PASSAGE_TYPE_INV, enumFromProto, enumToProto } from '../enums';

interface RawPassage {
  id?: RawId;
  signal_id?: RawId[];
  yield_id?: RawId[];
  stop_sign_id?: RawId[];
  lane_id?: RawId[];
  type?: number;
}

interface RawPassageGroup {
  id?: RawId;
  passage?: RawPassage[];
}

export interface RawPNCJunction {
  id?: RawId;
  polygon?: RawPolygon;
  overlap_id?: RawId[];
  passage_group?: RawPassageGroup[];
}

function passageFromProto(raw: RawPassage): Passage {
  return {
    id: unwrapId(raw.id) ?? '',
    signalIds: unwrapIdArray(raw.signal_id),
    yieldIds: unwrapIdArray(raw.yield_id),
    stopSignIds: unwrapIdArray(raw.stop_sign_id),
    laneIds: unwrapIdArray(raw.lane_id),
    type: enumFromProto(PASSAGE_TYPE, raw.type, 'UNKNOWN_PASSAGE'),
  };
}

function passageToProto(p: Passage): RawPassage {
  return {
    id: wrapId(p.id),
    signal_id: wrapIdArray(p.signalIds),
    yield_id: wrapIdArray(p.yieldIds),
    stop_sign_id: wrapIdArray(p.stopSignIds),
    lane_id: wrapIdArray(p.laneIds),
    type: enumToProto(PASSAGE_TYPE_INV, p.type),
  };
}

function passageGroupFromProto(raw: RawPassageGroup): PassageGroup {
  return {
    id: unwrapId(raw.id) ?? '',
    passages: (raw.passage ?? []).map(passageFromProto),
  };
}

function passageGroupToProto(pg: PassageGroup): RawPassageGroup {
  return { id: wrapId(pg.id), passage: pg.passages.map(passageToProto) };
}

export function rawPNCJunctionToEntity(raw: RawPNCJunction): PNCJunctionEntity | null {
  const id = unwrapId(raw.id);
  if (!id) return null;
  return {
    id,
    entityType: 'pncJunction',
    polygon: convertPolygonFromProto(raw.polygon),
    overlapIds: unwrapIdArray(raw.overlap_id),
    passageGroups: (raw.passage_group ?? []).map(passageGroupFromProto),
  };
}

export function entityToRawPNCJunction(e: PNCJunctionEntity): RawPNCJunction {
  return {
    id: wrapId(e.id),
    polygon: convertPolygonToProto(e.polygon),
    overlap_id: wrapIdArray(e.overlapIds),
    passage_group: e.passageGroups.map(passageGroupToProto),
  };
}
