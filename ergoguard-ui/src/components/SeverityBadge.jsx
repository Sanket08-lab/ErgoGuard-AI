export default function SeverityBadge({ level }) {
  const cls = (level || 'Low').toLowerCase()
  return <span className={`severity ${cls}`}><i/>{level || 'Low'}</span>
}