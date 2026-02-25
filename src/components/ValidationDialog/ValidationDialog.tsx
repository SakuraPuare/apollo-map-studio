import { useState } from 'react'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { validateMap } from '../../validation/mapValidator'
import type { ValidationReport, ValidationIssue } from '../../validation/mapValidator'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const severityBgColors: Record<string, string> = {
  error: 'bg-destructive/10 text-destructive',
  warning: 'bg-[#cca700]/10 text-[#cca700]',
  info: 'bg-muted text-muted-foreground',
}

const severityLabels: Record<string, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
}

export default function ValidationDialog() {
  const { setShowValidationDialog } = useUIStore()
  const { setSelected } = useUIStore()
  const store = useMapStore()
  const [report, setReport] = useState<ValidationReport | null>(null)

  const handleValidate = () => {
    const result = validateMap({
      lanes: store.lanes,
      junctions: store.junctions,
      signals: store.signals,
      stopSigns: store.stopSigns,
      crosswalks: store.crosswalks,
      clearAreas: store.clearAreas,
      speedBumps: store.speedBumps,
      parkingSpaces: store.parkingSpaces,
      roads: store.roads,
    })
    setReport(result)
  }

  const handleClickElement = (id: string) => {
    setSelected([id])
  }

  return (
    <Dialog open onOpenChange={() => setShowValidationDialog(false)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Map Validation Report</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Validate button */}
          <Button onClick={handleValidate} className="w-full">
            {report ? 'Re-validate' : 'Run Validation'}
          </Button>

          {/* Stats summary */}
          {report && (
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="Lanes"
                value={report.stats.totalLanes}
                className="text-accent-foreground"
              />
              <StatCard
                label="Connections"
                value={report.stats.totalConnections}
                className="text-accent-foreground"
              />
              <StatCard
                label="Isolated"
                value={report.stats.isolatedLanes}
                className="text-[#cca700]"
              />
              <StatCard
                label="Errors"
                value={report.stats.errorCount}
                className="text-destructive"
              />
              <StatCard
                label="Warnings"
                value={report.stats.warningCount}
                className="text-[#cca700]"
              />
              <StatCard
                label="Info"
                value={report.stats.infoCount}
                className="text-muted-foreground"
              />
            </div>
          )}

          {/* Result message */}
          {report && report.issues.length === 0 && (
            <div className="bg-background border border-border rounded-md p-4 text-center text-chart-2 text-[13px]">
              No issues found. Map is valid.
            </div>
          )}

          {/* Issues list */}
          {report && report.issues.length > 0 && (
            <div className="max-h-[350px] overflow-y-auto flex flex-col gap-1.5">
              {report.issues.map((issue, i) => (
                <IssueRow
                  key={i}
                  issue={issue}
                  onClick={() => handleClickElement(issue.elementId)}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatCard({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div className="bg-background border border-border rounded-md py-2 px-2.5 text-center">
      <div className={cn('text-lg font-bold', className)}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

function IssueRow({ issue, onClick }: { issue: ValidationIssue; onClick: () => void }) {
  return (
    <div className="bg-background border border-border rounded p-1.5 px-2.5 flex items-start gap-2 text-xs">
      {/* Severity badge */}
      <span
        className={cn(
          'text-[9px] px-1.5 py-px rounded-sm shrink-0 font-semibold mt-px',
          severityBgColors[issue.severity]
        )}
      >
        {severityLabels[issue.severity]}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-accent-foreground mb-0.5">{issue.message}</div>
        <button
          onClick={onClick}
          className="bg-transparent border-none text-primary text-[10px] p-0 cursor-pointer break-all text-left hover:underline"
          title="Click to select this element"
        >
          {issue.elementId}
        </button>
      </div>

      {/* Category */}
      <span className="text-[10px] text-[#5a5a5a] shrink-0 mt-px">{issue.category}</span>
    </div>
  )
}
