import { useMemo, memo } from 'react'
import { formatVolume, formatDate, getShortRunId } from '../utils/helpers'

const RunRow = memo(({ run, onClick }) => {
  const handleRowClick = () => {
    onClick(run.job_id, run.job_name, run.source, run.id)
  }

  const volume = useMemo(() => formatVolume(run.rows_read + run.rows_written), [run.rows_read, run.rows_written])
  const shortId = useMemo(() => getShortRunId(run.id), [run.id])
  const dateStr = useMemo(() => formatDate(run.start_time), [run.start_time])

  return (
    <tr 
      className="clickable-row" 
      onClick={handleRowClick}
      title="Click to view history and details"
    >
      <td className="bold text-white">{run.job_name}</td>
      <td>
        <span className={`source-badge ${run.source}`}>{run.source}</span>
      </td>
      <td className="mono">{shortId}</td>
      <td className="bold">{run.duration.toFixed(1)}s</td>
      {run.status === 'SUCCESS' ? (
        <td>{volume}</td>
      ) : (
        <td>
          <div className="truncate-error" title={run.error_message}>
            {run.error_message || 'Execution Failure'}
          </div>
        </td>
      )}
      <td className="date-time">{dateStr}</td>
    </tr>
  )
})
RunRow.displayName = 'RunRow'

export default RunRow
