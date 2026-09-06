import { useEffect, useState } from 'react'

function InlineEdit({ value, onSave, type = 'text', displayValue, placeholder, className = '', ariaLabel }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')

  useEffect(() => {
    if (!editing) setDraft(value || '')
  }, [editing, value])

  function cancel() {
    setDraft(value || '')
    setEditing(false)
  }

  function save() {
    if (draft !== (value || '')) onSave(draft)
    setEditing(false)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
    }
    if (event.key === 'Enter' && type !== 'textarea') {
      event.preventDefault()
      save()
    }
  }

  if (editing) {
    const Input = type === 'textarea' ? 'textarea' : 'input'
    return <Input
      autoFocus
      className={`inline-edit-input ${className}`}
      type={type === 'textarea' ? undefined : type}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      draggable={false}
      onMouseDown={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={save}
    />
  }

  return <button
    type="button"
    className={`inline-edit-value ${className}`}
    onClick={(event) => { event.stopPropagation(); setEditing(true) }}
    onMouseDown={(event) => event.stopPropagation()}
    aria-label={ariaLabel || `Edit ${displayValue || value || placeholder}`}
  >
    {displayValue || value || placeholder}
  </button>
}

export default InlineEdit
