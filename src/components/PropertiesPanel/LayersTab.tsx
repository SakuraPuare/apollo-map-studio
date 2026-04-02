import { useUIStore } from '@/store/uiStore'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

const LAYER_GROUPS = [
  { key: 'lanes', label: 'Lanes', color: '#4fc3f7' },
  { key: 'boundaries', label: 'Boundaries', color: '#81c784' },
  { key: 'junctions', label: 'Junctions', color: '#ffb74d' },
  { key: 'signals', label: 'Signals', color: '#e57373' },
  { key: 'crosswalks', label: 'Crosswalks', color: '#ba68c8' },
  { key: 'stopSigns', label: 'Stop Signs', color: '#ff8a65' },
  { key: 'clearAreas', label: 'Clear Areas', color: '#fff176' },
  { key: 'speedBumps', label: 'Speed Bumps', color: '#a1887f' },
  { key: 'parkingSpaces', label: 'Parking Spaces', color: '#90a4ae' },
  { key: 'connections', label: 'Connections', color: '#007acc' },
]

export default function LayersTab() {
  const { layerVisibility, toggleLayer, setLayerVisible } = useUIStore()

  const allVisible = LAYER_GROUPS.every((l) => layerVisibility[l.key] !== false)
  const noneVisible = LAYER_GROUPS.every((l) => layerVisibility[l.key] === false)

  const showAll = () => LAYER_GROUPS.forEach((l) => setLayerVisible(l.key, true))
  const hideAll = () => LAYER_GROUPS.forEach((l) => setLayerVisible(l.key, false))

  return (
    <div className="flex flex-col gap-1 p-3">
      <div className="flex gap-1.5 mb-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={showAll}
          disabled={allVisible}
        >
          Show All
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={hideAll}
          disabled={noneVisible}
        >
          Hide All
        </Button>
      </div>

      {LAYER_GROUPS.map((layer) => {
        const visible = layerVisibility[layer.key] !== false
        return (
          <div
            key={layer.key}
            className="flex items-center justify-between py-1.5 px-1 rounded hover:bg-accent/50 cursor-pointer"
            onClick={() => toggleLayer(layer.key)}
          >
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: visible ? layer.color : '#555' }}
              />
              <span className="text-xs text-foreground">{layer.label}</span>
            </div>
            <Switch
              checked={visible}
              onCheckedChange={() => toggleLayer(layer.key)}
              className="scale-75"
            />
          </div>
        )
      })}
    </div>
  )
}
