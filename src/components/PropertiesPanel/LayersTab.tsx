import { useTranslation } from 'react-i18next'
import { useUIStore } from '@/store/uiStore'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

const LAYER_GROUPS = [
  { key: 'lanes', labelKey: 'layers.lanes', color: '#4fc3f7' },
  { key: 'boundaries', labelKey: 'layers.boundaries', color: '#81c784' },
  { key: 'junctions', labelKey: 'layers.junctions', color: '#ffb74d' },
  { key: 'signals', labelKey: 'layers.signals', color: '#e57373' },
  { key: 'crosswalks', labelKey: 'layers.crosswalks', color: '#ba68c8' },
  { key: 'stopSigns', labelKey: 'layers.stopSigns', color: '#ff8a65' },
  { key: 'clearAreas', labelKey: 'layers.clearAreas', color: '#fff176' },
  { key: 'speedBumps', labelKey: 'layers.speedBumps', color: '#a1887f' },
  { key: 'parkingSpaces', labelKey: 'layers.parkingSpaces', color: '#90a4ae' },
  { key: 'connections', labelKey: 'layers.connections', color: '#007acc' },
]

export default function LayersTab() {
  const { t } = useTranslation()
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
          {t('layers.showAll')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={hideAll}
          disabled={noneVisible}
        >
          {t('layers.hideAll')}
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
              <span className="text-xs text-foreground">{t(layer.labelKey)}</span>
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
