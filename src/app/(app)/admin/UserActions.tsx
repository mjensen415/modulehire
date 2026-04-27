'use client'

export function PlanSelect({ userId, currentPlan }: { userId: string; currentPlan: string }) {
  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newPlan = e.target.value
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: newPlan }),
    })
    window.location.reload()
  }

  return (
    <select defaultValue={currentPlan} className="admin-select" onChange={handleChange}>
      <option value="free">free</option>
      <option value="starter">starter</option>
      <option value="pro">pro</option>
    </select>
  )
}

export function AdminToggleButton({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  async function handleClick() {
    await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_admin: !isAdmin }),
    })
    window.location.reload()
  }

  return (
    <button className="btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={handleClick}>
      {isAdmin ? 'Remove admin' : 'Make admin'}
    </button>
  )
}

export function PurgeButton({ userId, email }: { userId: string; email: string }) {
  async function handleClick() {
    if (!confirm(`Purge all data for ${email}?`)) return
    await fetch(`/api/admin/users/${userId}/purge`, { method: 'DELETE' })
    window.location.reload()
  }

  return (
    <button
      className="btn-ghost"
      style={{ fontSize: 11, padding: '3px 8px', color: 'var(--rose)' }}
      onClick={handleClick}
    >
      Purge
    </button>
  )
}
