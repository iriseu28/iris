import { useState } from 'react'

function InlineEdit({ value, onSave, type = 'text', displayValue, placeholder, className = '', ariaLabel, validate }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [validationError, setValidationError] = useState('')

  function cancel() {
    setDraft(value || '')
    setValidationError('')
    setEditing(false)
  }

  function save() {
    const error = validate?.(draft)
    if (error) {
      setValidationError(error)
      return
    }
    setValidationError('')
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
    return <div className="inline-edit-wrap">
      <Input
        autoFocus
        className={`inline-edit-input ${className}`}
        type={type === 'textarea' ? undefined : type}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={Boolean(validationError)}
        draggable={false}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => { setDraft(event.target.value); setValidationError('') }}
        onKeyDown={handleKeyDown}
        onBlur={save}
      />
      {validationError && <span className="inline-edit-error" role="alert">{validationError}</span>}
    </div>
  }

  return <button
    type="button"
    className={`inline-edit-value ${className}`}
    onClick={(event) => { event.stopPropagation(); setDraft(value || ''); setValidationError(''); setEditing(true) }}
    onMouseDown={(event) => event.stopPropagation()}
    aria-label={ariaLabel || `Edit ${displayValue || value || placeholder}`}
  >
    {displayValue || value || placeholder}
  </button>
}

export default InlineEdit
