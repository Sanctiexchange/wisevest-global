import { useState } from 'react'
import { ApiError, support } from '../api'
import { Button, Field, Modal } from './ui'

const SUPPORT_TOPICS = [
  'Account and profile',
  'Identity verification',
  'Deposit or withdrawal',
  'Investment',
  'Other',
] as const

export default function SupportModal() {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [requestId, setRequestId] = useState('')

  const close = () => {
    setOpen(false)
    setTopic('')
    setMessage('')
    setError('')
    setRequestId('')
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const request = await support.createRequest(topic, message)
      setRequestId(request.id)
    } catch (issue) {
      setError(issue instanceof ApiError ? issue.message : 'Could not submit your support request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Help and support"
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-[80] grid h-12 w-12 place-items-center rounded-full bg-[#BBEC04] text-[#0B3D3B] shadow-lg transition hover:scale-105 md:bottom-6"
      >
        <svg width="26" height="26" viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path d="M25.5 3.645H10.5C6 3.645 3 6.645 3 11.145v9c0 4.5 3 7.5 7.5 7.5h6l6.675 4.44c.99.66 2.325-.045 2.325-1.245v-3.195c4.5 0 7.5-3 7.5-7.5v-9c0-4.5-3-7.5-7.5-7.5ZM23.25 16.875h-10.5a1.125 1.125 0 0 1 0-2.25h10.5a1.125 1.125 0 0 1 0 2.25Z" fill="currentColor" />
        </svg>
      </button>

      <Modal open={open} onClose={close}>
        {requestId ? (
          <div className="text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-neon text-2xl text-white">✓</div>
            <h2 className="text-xl font-bold">Request submitted</h2>
            <p className="mt-2 text-sm text-muted">Your message has been saved in this demo.</p>
            <p className="mt-2 text-xs text-muted">Reference: {requestId}</p>
            <Button block onClick={close}>Done</Button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold">Help &amp; Support</h2>
            <p className="mt-1 text-sm text-muted">Tell us what you need help with and our support team will follow up.</p>
            <form className="mt-2" onSubmit={(event) => { void submit(event) }}>
              <Field label="Topic" htmlFor="support-topic">
                <select
                  id="support-topic"
                  className="input"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  required
                >
                  <option value="">Choose a topic</option>
                  {SUPPORT_TOPICS.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="How can we help?" htmlFor="support-message" error={error}>
                <textarea
                  id="support-message"
                  className="input min-h-28 resize-y"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={1000}
                  minLength={10}
                  placeholder="Describe the issue (at least 10 characters)"
                  required
                />
              </Field>
              <div className="fine text-right">{message.length}/1000</div>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="ghost" className="!px-4 !py-2 text-sm" onClick={close}>Cancel</Button>
                <Button type="submit" className="!px-4 !py-2 text-sm" loading={busy}>Send request</Button>
              </div>
              <p className="mt-3 fine">Demo mode: requests are saved locally and are not sent to a support team.</p>
            </form>
          </>
        )}
      </Modal>
    </>
  )
}
