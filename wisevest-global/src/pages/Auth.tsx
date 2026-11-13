import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { auth, kyc, ApiError } from '../api'
import { useStore } from '../store'
import { Button, Check, Field, Logo, useToast } from '../components/ui'
import { cx } from '../components/ui'
import { isSupabaseConfigured } from '../lib/supabase'

function Frame({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className={cx('w-full rounded-3xl border border-line bg-surface bg-brand-soft p-6 md:p-8', wide ? 'max-w-[520px]' : 'max-w-[440px]')}>
        <div className="mb-6 text-center"><Logo /></div>
        {children}
      </div>
    </div>
  )
}

export function Login() {
  const navigate = useNavigate()
  const user = useStore((s) => s.user)
  const authError = useStore((s) => s.authError)
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { const u = await auth.login(email, pw); navigate(u.role === 'admin' ? '/admin' : '/app') }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }
  const demo = async (r: 'client' | 'admin') => { await auth.loginDemo(r); navigate(r === 'admin' ? '/admin' : '/app') }
  return (
    <Frame>
      <h1 className="text-2xl font-bold">Sign in</h1>
      {authError && <p className="err" role="alert">{authError}</p>}
      <form onSubmit={submit} noValidate>
        <Field label="Email address" htmlFor="e"><input id="e" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" htmlFor="p" error={err}><input id="p" type="password" autoComplete="current-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Button type="submit" block loading={busy}>Sign in</Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted">New here? <Link to="/register" className="text-neon">Create an account</Link></p>
      {!isSupabaseConfigured && <div className="mt-6 space-y-2 border-t border-line pt-5">
        <p className="fine text-center">Demo accounts (mock data, nothing is sent anywhere)</p>
        <Button variant="ghost" block onClick={() => demo('client')}>Continue as demo investor</Button>
        <Button variant="ghost" className="!mt-2 w-full" onClick={() => demo('admin')}>Continue as demo admin</Button>
      </div>}
    </Frame>
  )
}

const pwScore = (v: string) =>
  (v.length >= 10 ? 1 : 0) + (/[a-z]/.test(v) && /[A-Z]/.test(v) ? 1 : 0) + (/\d/.test(v) ? 1 : 0) + (/[^A-Za-z0-9]/.test(v) ? 1 : 0)

function FileDrop({ label, accept, file, onFile, error, setError, pdf }: { label: string; accept: string; file: File | null; onFile: (f: File | null) => void; error: string; setError: (e: string) => void; pdf?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  const take = (f?: File) => {
    if (!f) return
    const ok = f.type.startsWith('image/') || (pdf && f.type === 'application/pdf')
    if (!ok) return setError('Unsupported file type.')
    if (f.size > 5 * 1024 * 1024) return setError('File is larger than 5 MB.')
    setError(''); onFile(f)
  }
  return (
    <div>
      <button type="button" onClick={() => ref.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer.files[0]) }}
        className="w-full rounded-2xl border-[1.5px] border-dashed border-line bg-bg px-4 py-7 text-center transition hover:border-neon">
        <b>{file ? file.name : label}</b>
        <small className="mt-1 block text-muted">{file ? `${Math.round(file.size / 1024)} KB · tap to replace` : accept}</small>
      </button>
      <input ref={ref} type="file" hidden accept={pdf ? 'image/*,.pdf' : 'image/*'} capture={pdf ? undefined : 'user'} onChange={(e) => take(e.target.files?.[0])} />
      <div className="err" role="alert">{error}</div>
    </div>
  )
}

const countries = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'United Kingdom', 'United Arab Emirates', 'Canada', 'Germany', 'Singapore', 'Other']
const labels = ['Create account', 'Verify email', 'Personal details', 'ID document', 'Selfie check', 'Review and submit']

export function Register() {
  return isSupabaseConfigured ? <SupabaseRegister /> : <DemoRegister />
}

function SupabaseRegister() {
  const navigate = useNavigate()
  const user = useStore((state) => state.user)
  const authReady = useStore((state) => state.authReady)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  if (!authReady) return <Frame><p className="text-sm text-muted" role="status">Restoring sign-in session…</p></Frame>
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/app'} replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (name.trim().length < 2) return setError('Enter your full name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError('Enter a valid email address.')
    if (password.length < 10 || pwScore(password) < 3) return setError('Use 10+ characters with a mix of letters, numbers and symbols.')
    if (!acceptedTerms) return setError('Please accept to continue.')

    setBusy(true)
    try {
      const user = await auth.register(email, name, password)
      if (user) {
        navigate('/app')
        return
      }
      setMessage('Account created. Check your email to confirm your address, then sign in. Identity verification and investment features are not connected yet.')
    } catch (issue) {
      setError(issue instanceof ApiError ? issue.message : 'Could not create your account.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mb-4 mt-2 text-sm text-muted">Sign up with secure email authentication. Identity verification is a separate step and is not connected yet.</p>
      {message ? (
        <div className="rounded-xl border border-neon/30 bg-brand-soft p-4 text-sm" role="status">
          <p>{message}</p>
          <Button variant="ghost" block onClick={() => navigate('/login')}>Go to sign in</Button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          <Field label="Full legal name" htmlFor="full-name" error={error.startsWith('Enter your full name') ? error : ''}>
            <input id="full-name" autoComplete="name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Email address" htmlFor="signup-email" error={error.startsWith('Enter a valid email') ? error : ''}>
            <input id="signup-email" type="email" autoComplete="email" className="input" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Password" htmlFor="signup-password" error={error.startsWith('Use 10+') ? error : ''}>
            <input id="signup-password" type="password" autoComplete="new-password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
          <Check checked={acceptedTerms} onChange={setAcceptedTerms}>I agree to the Terms of Service and Privacy Policy.</Check>
          {error && <p className="err" role="alert">{error}</p>}
          <Button type="submit" block loading={busy}>Create account</Button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-muted">Already registered? <Link to="/login" className="text-neon">Sign in</Link></p>
    </Frame>
  )
}

function DemoRegister() {
  const navigate = useNavigate()
  const toast = useToast()
  const user = useStore((s) => s.user)
  const [step, setStep] = useState(user?.role === 'client' ? 2 : 0)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ email: user?.email ?? '', pw: '', pw2: '', terms: false, fn: '', ln: '', dob: '', country: '', addr: '', idt: '' })
  const [code, setCode] = useState('')
  const [idFile, setIdFile] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [dec, setDec] = useState([false, false, false])
  const [errs, setErrs] = useState<Record<string, string>>({})
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))
  if (user && user.role === 'admin') return <Navigate to="/admin" replace />

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (step === 0) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = 'Enter a valid email address.'
      if (f.pw.length < 10 || pwScore(f.pw) < 3) e.pw = 'Use 10+ characters with a mix of letters, numbers and symbols.'
      if (!f.pw2 || f.pw2 !== f.pw) e.pw2 = 'Passwords do not match.'
      if (!f.terms) e.terms = 'Please accept to continue.'
    }
    if (step === 1 && !/^\d{6}$/.test(code)) e.code = 'Enter the full 6-digit code.'
    if (step === 2) {
      if (!f.fn.trim()) e.fn = 'Required.'
      if (!f.ln.trim()) e.ln = 'Required.'
      if (!f.dob) e.dob = 'Required.'
      else {
        const b = new Date(f.dob), t = new Date()
        let age = t.getFullYear() - b.getFullYear()
        if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) age--
        if (age < 18) e.dob = 'You must be 18 or older to invest.'
      }
      if (!f.country) e.country = 'Select your country.'
      if (f.addr.trim().length < 8) e.addr = 'Enter your full address.'
    }
    if (step === 3) { if (!f.idt) e.idt = 'Select a document type.'; if (!idFile) e.idFile = 'Upload your document photo.' }
    if (step === 4 && !selfie) e.selfie = 'Add a selfie to continue.'
    if (step === 5 && !dec.every(Boolean)) e.dec = 'Please confirm all declarations.'
    return e
  }

  const next = async () => {
    const e = validate(); setErrs(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      if (step === 5) {
        if (!idFile || !selfie) throw new ApiError('Upload your identity document and selfie.')
        if (!user) await auth.register(f.email.trim(), `${f.fn.trim()} ${f.ln.trim()}`, f.pw)
        await kyc.submit({ name: `${f.fn.trim()} ${f.ln.trim()}`, country: f.country, docType: f.idt, identityDocument: idFile, selfie })
        toast('Verification submitted'); navigate('/app'); return
      }
      setStep(step + 1)
    } catch (x) { setErrs({ form: x instanceof ApiError ? x.message : 'Something went wrong.' }) }
    finally { setBusy(false) }
  }

  const score = pwScore(f.pw)
  const meter = ['#ff6b8a', '#ffb454', '#c084fc', '#39ff88']
  return (
    <Frame wide>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-surface2"><div className="h-full bg-brand transition-all" style={{ width: `${((step + 1) / 6) * 100}%` }} /></div>
      <p className="fine">Step {step + 1} of 6</p>
      <h1 className="mb-1 text-2xl font-bold">{labels[step]}</h1>

      {step === 0 && (<>
        <Field label="Email address" htmlFor="em" error={errs.email}><input id="em" type="email" autoComplete="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Password" htmlFor="pw" error={errs.pw}>
          <input id="pw" type="password" autoComplete="new-password" className="input" value={f.pw} onChange={(e) => set('pw', e.target.value)} placeholder="At least 10 characters" />
          <div className="mt-2 flex gap-1.5">{[0, 1, 2, 3].map((i) => <i key={i} className="h-1 flex-1 rounded-full bg-surface2" style={i < score ? { background: meter[score - 1] } : undefined} />)}</div>
        </Field>
        <Field label="Confirm password" htmlFor="pw2" error={errs.pw2}><input id="pw2" type="password" autoComplete="new-password" className="input" value={f.pw2} onChange={(e) => set('pw2', e.target.value)} /></Field>
        <Check checked={f.terms} onChange={(v) => set('terms', v)}>I agree to the Terms of Service and Privacy Policy.</Check>
        <div className="err">{errs.terms}</div>
      </>)}

      {step === 1 && (<>
        <p className="text-sm text-muted">We sent a 6-digit code to <b className="text-ink">{f.email}</b>. Demo mode: any 6 digits work.</p>
        <OtpInput onChange={setCode} />
        <div className="err text-center" role="alert">{errs.code}</div>
      </>)}

      {step === 2 && (<>
        <p className="text-sm text-muted">Enter your details exactly as they appear on your ID.</p>
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="First name" htmlFor="fn" error={errs.fn}><input id="fn" autoComplete="given-name" className="input" value={f.fn} onChange={(e) => set('fn', e.target.value)} /></Field>
          <Field label="Last name" htmlFor="ln" error={errs.ln}><input id="ln" autoComplete="family-name" className="input" value={f.ln} onChange={(e) => set('ln', e.target.value)} /></Field>
        </div>
        <Field label="Date of birth" htmlFor="dob" error={errs.dob}><input id="dob" type="date" className="input" value={f.dob} onChange={(e) => set('dob', e.target.value)} /></Field>
        <Field label="Country of residence" htmlFor="cty" error={errs.country}>
          <select id="cty" className="input" value={f.country} onChange={(e) => set('country', e.target.value)}><option value="">Select country</option>{countries.map((c) => <option key={c}>{c}</option>)}</select>
        </Field>
        <Field label="Residential address" htmlFor="addr" error={errs.addr}><input id="addr" autoComplete="street-address" className="input" value={f.addr} onChange={(e) => set('addr', e.target.value)} /></Field>
      </>)}

      {step === 3 && (<>
        <p className="text-sm text-muted">Choose a government-issued document that is valid and in your name.</p>
        <Field label="Document type" htmlFor="idt" error={errs.idt}>
          <select id="idt" className="input" value={f.idt} onChange={(e) => set('idt', e.target.value)}><option value="">Select document</option>{['International passport', 'National ID card', 'Driver’s licence'].map((d) => <option key={d}>{d}</option>)}</select>
        </Field>
        <FileDrop label="Tap to upload your document" accept="JPG, PNG or PDF · max 5 MB" file={idFile} onFile={setIdFile} error={errs.idFile ?? ''} setError={(m) => setErrs({ idFile: m })} pdf />
        <p className="fine rounded-xl border border-line bg-bg p-3"><b className="text-ink">For a fast review:</b> all four corners visible, no glare, readable text, and not expired.</p>
      </>)}

      {step === 4 && (<>
        <p className="text-sm text-muted">Take a clear photo of your face so we can match it to your ID.</p>
        <FileDrop label="Tap to take or upload a selfie" accept="JPG or PNG · max 5 MB" file={selfie} onFile={setSelfie} error={errs.selfie ?? ''} setError={(m) => setErrs({ selfie: m })} />
        <p className="fine rounded-xl border border-line bg-bg p-3"><b className="text-ink">Tips:</b> face the light, remove glasses and hats, keep your whole face in frame.</p>
      </>)}

      {step === 5 && (<>
        <dl className="rounded-2xl border border-line bg-bg px-4 py-1 text-sm">
          {[['Email', f.email], ['Name', `${f.fn} ${f.ln}`], ['Date of birth', f.dob], ['Country', f.country], ['Address', f.addr], ['ID document', `${f.idt} (${idFile?.name})`], ['Selfie', selfie?.name ?? '']].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-line py-2.5 last:border-0"><dt className="text-muted">{k}</dt><dd className="break-all text-right">{v}</dd></div>
          ))}
        </dl>
        {['The information and documents I provided are true, and they belong to me.', 'I understand that investments, including crypto assets, carry risk and I may lose some or all of my capital.', 'I am investing my own funds and they do not come from illegal activity.'].map((t, i) => (
          <Check key={t} checked={dec[i]} onChange={(v) => setDec(dec.map((d, j) => (j === i ? v : d)))}>{t}</Check>
        ))}
        <div className="err" role="alert">{errs.dec}</div>
      </>)}

      <div className="err" role="alert">{errs.form}</div>
      <div className="mt-2 flex gap-3">
        {step > 0 && !(step === 2 && user) && <Button variant="ghost" block className="!w-2/5" onClick={() => { setErrs({}); setStep(step - 1) }}>Back</Button>}
        <Button block loading={busy} className={step > 0 && !(step === 2 && user) ? '!w-3/5' : ''} onClick={next}>{step === 5 ? 'Submit for review' : step === 1 ? 'Verify' : 'Continue'}</Button>
      </div>
      {step === 0 && <p className="mt-4 text-center text-sm text-muted">Already registered? <Link to="/login" className="text-neon">Sign in</Link></p>}
    </Frame>
  )
}

function OtpInput({ onChange }: { onChange: (v: string) => void }) {
  const [vals, setVals] = useState(Array(6).fill(''))
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const update = (next: string[]) => { setVals(next); onChange(next.join('')) }
  const input = (i: number, v: string) => {
    const d = v.replace(/\D/g, '').slice(-1)
    const n = [...vals]; n[i] = d; update(n)
    if (d && refs.current[i + 1]) refs.current[i + 1]?.focus()
  }
  const key = (i: number, e: KeyboardEvent) => { if (e.key === 'Backspace' && !vals[i] && refs.current[i - 1]) refs.current[i - 1]?.focus() }
  const paste = (e: ClipboardEvent) => {
    const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!t) return
    e.preventDefault()
    const n = Array(6).fill('').map((_, i) => t[i] ?? ''); update(n)
    refs.current[Math.min(t.length, 5)]?.focus()
  }
  return (
    <div className="my-6 flex justify-center gap-2.5" onPaste={paste}>
      {vals.map((v, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el }} value={v} type="password" inputMode="numeric" maxLength={1} aria-label={`Digit ${i + 1}`}
          onChange={(e) => input(i, e.target.value)} onKeyDown={(e) => key(i, e)}
          className="input !w-11 !px-0 text-center font-head text-2xl md:!w-12" />
      ))}
    </div>
  )
}
