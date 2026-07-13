export const formatVolume = (num) => {
  if (!num) return '0'
  if (num >= 1.0e9) return (num / 1.0e9).toFixed(1) + 'B'
  if (num >= 1.0e6) return (num / 1.0e6).toFixed(1) + 'M'
  if (num >= 1.0e3) return (num / 1.0e3).toFixed(1) + 'K'
  return num.toString()
}

export const formatDate = (isoString) => {
  if (!isoString) return '--'
  const date = new Date(isoString)
  return date.toLocaleString()
}

export const getShortRunId = (runId) => {
  if (!runId) return ''
  if (runId.length <= 15) return runId
  return runId.substring(0, 12) + '...'
}
