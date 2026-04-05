import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMapStore } from '@/store/mapStore'
import { useUIStore } from '@/store/uiStore'
import { BoundaryType, LaneDirection, LaneTurn, LaneType } from '@/types/apollo-map'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { LaneFeature } from '@/types/editor'

interface Props {
  lane: LaneFeature
}

export default function LaneProperties({ lane }: Props) {
  const { t } = useTranslation()
  const updateElement = useMapStore((s) => s.updateElement)
  const removeElement = useMapStore((s) => s.removeElement)
  const roads = useMapStore((s) => s.roads)
  const assignLaneToRoad = useMapStore((s) => s.assignLaneToRoad)
  const unassignLaneFromRoad = useMapStore((s) => s.unassignLaneFromRoad)
  const { setSelected } = useUIStore()

  const update = (patch: Partial<LaneFeature>) => {
    updateElement({ ...lane, ...patch })
  }

  const handleDelete = () => {
    removeElement(lane.id, 'lane')
    setSelected([])
  }

  return (
    <div className="p-3 text-xs flex flex-col gap-1">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">
        {t('properties.type.lane')}
      </div>
      <div className="text-xs text-accent-foreground font-mono break-all bg-muted/50 px-2 py-1.5 rounded mb-2">
        {lane.id}
      </div>

      {/* General Section */}
      <CollapsibleSection title={t('properties.lane.section.general')} defaultOpen>
        <Field label={t('properties.lane.speedLimit')}>
          <Input
            type="number"
            min={0}
            max={360}
            step={1}
            defaultValue={Math.round(lane.speedLimit * 3.6)}
            key={`${lane.id}-speed`}
            onBlur={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 0) update({ speedLimit: v / 3.6 })
            }}
            className="h-7 text-xs"
          />
        </Field>

        <Field label={t('properties.lane.width')}>
          <Input
            type="number"
            min={0.5}
            max={20}
            step={0.01}
            defaultValue={lane.width}
            key={`${lane.id}-width`}
            onBlur={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v) && v >= 0.5) update({ width: v })
            }}
            className="h-7 text-xs"
          />
        </Field>

        <Field label={t('properties.lane.type')}>
          <Select
            value={String(lane.laneType)}
            onValueChange={(v) => update({ laneType: Number(v) as LaneType })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(LaneType.CITY_DRIVING)}>
                {t('properties.lane.type.cityDriving')}
              </SelectItem>
              <SelectItem value={String(LaneType.BIKING)}>
                {t('properties.lane.type.biking')}
              </SelectItem>
              <SelectItem value={String(LaneType.SIDEWALK)}>
                {t('properties.lane.type.sidewalk')}
              </SelectItem>
              <SelectItem value={String(LaneType.PARKING)}>
                {t('properties.lane.type.parking')}
              </SelectItem>
              <SelectItem value={String(LaneType.SHOULDER)}>
                {t('properties.lane.type.shoulder')}
              </SelectItem>
              <SelectItem value={String(LaneType.SHARED)}>
                {t('properties.lane.type.shared')}
              </SelectItem>
              <SelectItem value={String(LaneType.NONE)}>
                {t('properties.lane.type.none')}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('properties.lane.turn')}>
          <Select
            value={String(lane.turn)}
            onValueChange={(v) => update({ turn: Number(v) as LaneTurn })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(LaneTurn.NO_TURN)}>
                {t('properties.lane.turn.noTurn')}
              </SelectItem>
              <SelectItem value={String(LaneTurn.LEFT_TURN)}>
                {t('properties.lane.turn.leftTurn')}
              </SelectItem>
              <SelectItem value={String(LaneTurn.RIGHT_TURN)}>
                {t('properties.lane.turn.rightTurn')}
              </SelectItem>
              <SelectItem value={String(LaneTurn.U_TURN)}>
                {t('properties.lane.turn.uTurn')}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('properties.lane.direction')}>
          <Select
            value={String(lane.direction)}
            onValueChange={(v) => update({ direction: Number(v) as LaneDirection })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(LaneDirection.FORWARD)}>
                {t('properties.lane.direction.forward')}
              </SelectItem>
              <SelectItem value={String(LaneDirection.BACKWARD)}>
                {t('properties.lane.direction.backward')}
              </SelectItem>
              <SelectItem value={String(LaneDirection.BIDIRECTION)}>
                {t('properties.lane.direction.bidirectional')}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </CollapsibleSection>

      {/* Boundaries Section */}
      <CollapsibleSection title={t('properties.lane.section.boundaries')} defaultOpen>
        <Field label={t('properties.lane.leftBoundary')}>
          <Select
            value={String(lane.leftBoundaryType)}
            onValueChange={(v) => update({ leftBoundaryType: Number(v) as BoundaryType })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(BoundaryType.DOTTED_WHITE)}>
                {t('properties.boundary.dottedWhite')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.DOTTED_YELLOW)}>
                {t('properties.boundary.dottedYellow')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.SOLID_WHITE)}>
                {t('properties.boundary.solidWhite')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.SOLID_YELLOW)}>
                {t('properties.boundary.solidYellow')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.DOUBLE_YELLOW)}>
                {t('properties.boundary.doubleYellow')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.CURB)}>
                {t('properties.boundary.curb')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.UNKNOWN)}>
                {t('properties.boundary.unknown')}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('properties.lane.rightBoundary')}>
          <Select
            value={String(lane.rightBoundaryType)}
            onValueChange={(v) => update({ rightBoundaryType: Number(v) as BoundaryType })}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={String(BoundaryType.DOTTED_WHITE)}>
                {t('properties.boundary.dottedWhite')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.DOTTED_YELLOW)}>
                {t('properties.boundary.dottedYellow')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.SOLID_WHITE)}>
                {t('properties.boundary.solidWhite')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.SOLID_YELLOW)}>
                {t('properties.boundary.solidYellow')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.DOUBLE_YELLOW)}>
                {t('properties.boundary.doubleYellow')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.CURB)}>
                {t('properties.boundary.curb')}
              </SelectItem>
              <SelectItem value={String(BoundaryType.UNKNOWN)}>
                {t('properties.boundary.unknown')}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </CollapsibleSection>

      {/* Road Assignment */}
      <CollapsibleSection title={t('properties.lane.section.road')} defaultOpen>
        <Field label={t('properties.lane.assignedRoad')}>
          <Select
            value={lane.roadId ?? '__none__'}
            onValueChange={(v) => {
              if (v === '__none__') {
                unassignLaneFromRoad(lane.id)
              } else {
                assignLaneToRoad(lane.id, v)
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder={t('properties.lane.noneRoad')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('properties.lane.noneRoad')}</SelectItem>
              {Object.values(roads).map((road) => (
                <SelectItem key={road.id} value={road.id}>
                  {road.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </CollapsibleSection>

      {/* Connections Section */}
      {(lane.predecessorIds.length > 0 ||
        lane.successorIds.length > 0 ||
        lane.leftNeighborIds.length > 0 ||
        lane.rightNeighborIds.length > 0) && (
        <CollapsibleSection title={t('properties.lane.section.connections')} defaultOpen>
          {lane.predecessorIds.length > 0 && (
            <IdList label={t('properties.lane.predecessors')} ids={lane.predecessorIds} />
          )}
          {lane.successorIds.length > 0 && (
            <IdList label={t('properties.lane.successors')} ids={lane.successorIds} />
          )}
          {lane.leftNeighborIds.length > 0 && (
            <IdList label={t('properties.lane.leftNeighbors')} ids={lane.leftNeighborIds} />
          )}
          {lane.rightNeighborIds.length > 0 && (
            <IdList label={t('properties.lane.rightNeighbors')} ids={lane.rightNeighborIds} />
          )}
        </CollapsibleSection>
      )}

      <Button variant="destructive" className="w-full mt-2" size="sm" onClick={handleDelete}>
        {t('properties.lane.deleteLane')}
      </Button>
    </div>
  )
}

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2.5 pb-2 pl-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      {children}
    </div>
  )
}

function IdList({ label, ids }: { label: string; ids: string[] }) {
  const { setSelected } = useUIStore()

  const handleClick = (clickedId: string) => {
    setSelected([clickedId])
  }

  return (
    <div className="mb-1">
      <div className="text-[10px] text-muted-foreground uppercase font-medium mb-0.5">{label}</div>
      {ids.map((connId) => (
        <div
          key={connId}
          className="text-[11px] text-foreground pl-2 break-all flex items-center gap-1.5 leading-relaxed cursor-pointer hover:text-primary transition-colors"
          onClick={() => handleClick(connId)}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          <span className="font-mono">{connId}</span>
        </div>
      ))}
    </div>
  )
}
