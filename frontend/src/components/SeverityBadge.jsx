import React from 'react';

export default function SeverityBadge({ severity }) {
  return <span className={`severity-badge severity-${String(severity).toLowerCase().replace(/\s+/g, '-')}`}><i />{severity}</span>;
}