import { useState } from 'react'
import { useMapStore } from '../../store/mapStore'
import { useUIStore } from '../../store/uiStore'
import { Overlay, Dialog } from '../ExportDialog/ExportDialog'
import { validateMap } from '../../validation/mapValidator'
import type { ValidationReport, ValidationIssue } from '../../validation/mapValidator'

const severityColors: Record<string, string> = {
  error: '#f87171',
  warning: '#fbbf24',
  info: '#94a3b8',
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
    <Overlay>
      <Dialog title="Map Validation Report" onClose={() => setShowValidationDialog(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Validate button */}
          <button
            onClick={handleValidate}
            style={{
              background: '#1d4ed8',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 12,
              cursor: 'pointer',
              color: '#f1f5f9',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2563eb'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#1d4ed8'
            }}
          >
            {report ? 'Re-validate' : 'Run Validation'}
          </button>

          {/* Stats summary */}
          {report && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
              }}
            >
              <StatCard label="Lanes" value={report.stats.totalLanes} color="#f1f5f9" />
              <StatCard label="Connections" value={report.stats.totalConnections} color="#f1f5f9" />
              <StatCard label="Isolated" value={report.stats.isolatedLanes} color="#fbbf24" />
              <StatCard label="Errors" value={report.stats.errorCount} color="#f87171" />
              <StatCard label="Warnings" value={report.stats.warningCount} color="#fbbf24" />
              <StatCard label="Info" value={report.stats.infoCount} color="#94a3b8" />
            </div>
          )}

          {/* Result message */}
          {report && report.issues.length === 0 && (
            <div
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: 16,
                textAlign: 'center',
                color: '#4ade80',
                fontSize: 13,
              }}
            >
              No issues found. Map is valid.
            </div>
          )}

          {/* Issues list */}
          {report && report.issues.length > 0 && (
            <div
              style={{
                maxHeight: 300,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
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
      </Dialog>
    </Overlay>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: '8px 10px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: '#64748b', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function IssueRow({ issue, onClick }: { issue: ValidationIssue; onClick: () => void }) {
  const color = severityColors[issue.severity]
  return (
    <div
      style={{
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 4,
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        fontSize: 11,
      }}
    >
      {/* Severity badge */}
      <span
        style={{
          fontSize: 9,
          color,
          background: `${color}15`,
          padding: '1px 5px',
          borderRadius: 3,
          flexShrink: 0,
          fontWeight: 600,
          marginTop: 1,
        }}
      >
        {severityLabels[issue.severity]}
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e2e8f0', marginBottom: 2 }}>{issue.message}</div>
        <button
          onClick={onClick}
          style={{
            background: 'none',
            border: 'none',
            color: '#3b82f6',
            fontSize: 9,
            padding: 0,
            cursor: 'pointer',
            wordBreak: 'break-all',
            textAlign: 'left',
          }}
          title="Click to select this element"
        >
          {issue.elementId}
        </button>
      </div>

      {/* Category */}
      <span
        style={{
          fontSize: 9,
          color: '#475569',
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {issue.category}
      </span>
    </div>
  )
}
