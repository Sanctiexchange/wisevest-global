import { useState } from 'react'
import { Link } from 'react-router-dom'
import { money, signed } from '../lib/format'
import { Segmented, Tag } from '../components/ui'

const cats = [
  { name: 'Bitcoin', icon: '₿', text: 'Exposure to Bitcoin-linked strategies managed by the company, such as holding, mining and structured products.', tags: ['High volatility', 'Liquid windows'], pts: ['Strategy and custody explained', 'Reported performance, not promises', 'Flexible entry sizes'] },
  { name: 'Energy', icon: '⚡', text: 'Projects in power generation and energy infrastructure, with defined timelines and documented assets.', tags: ['Medium term', 'Asset-backed'], pts: ['Site, permits and partners listed', 'Milestone-based updates', 'Clear exit terms'] },
  { name: 'Real estate', icon: '🏢', text: 'Property developments and income-producing assets, with title documents and independent valuations available.', tags: ['Long term', 'Tangible'], pts: ['Title and valuation documents', 'Construction progress reports', 'Defined payout schedule'] },
]

const scenarios = ['Loss −15%', 'Low +5%', 'Base +12%', 'High +25%'] as const
const rates: Record<(typeof scenarios)[number], number> = { 'Loss −15%': -0.15, 'Low +5%': 0.05, 'Base +12%': 0.12, 'High +25%': 0.25 }

function Calculator() {
  const [amount, setAmount] = useState(5000)
  const [years, setYears] = useState(2)
  const [sc, setSc] = useState<(typeof scenarios)[number]>('Base +12%')
  const value = amount * Math.pow(1 + rates[sc], years)
  const delta = value - amount
  return (
    <div className="grid gap-7 rounded-3xl border border-line bg-surface bg-brand-soft p-6 md:grid-cols-2 md:p-8">
      <div>
        <label className="lbl !mt-0" htmlFor="amt">Amount: <b className="text-ink">{money(amount)}</b></label>
        <input id="amt" type="range" min={100} max={100000} step={100} value={amount} onChange={(e) => setAmount(+e.target.value)} className="w-full accent-[#BBEC04]" />
        <label className="lbl">Scenario (illustrative annual return)</label>
        <Segmented options={scenarios} value={sc} onChange={setSc} />
        <label className="lbl" htmlFor="yrs">Duration: <b className="text-ink">{years} {years > 1 ? 'years' : 'year'}</b></label>
        <input id="yrs" type="range" min={1} max={5} value={years} onChange={(e) => setYears(+e.target.value)} className="w-full accent-[#BBEC04]" />
      </div>
      <div className="flex flex-col justify-center rounded-2xl border border-line bg-bg p-6">
        <span className="fine">Illustrative value after term</span>
        <div className="font-head text-4xl font-bold">{money(value)}</div>
        <div className={delta >= 0 ? 'text-neon' : 'text-danger'}>{signed(delta)} ({delta >= 0 ? '+' : '−'}{Math.abs((delta / amount) * 100).toFixed(1)}%)</div>
        <p className="fine mt-3">Compounded annually, before fees and taxes. Real results can be lower than shown, including loss of some or all capital.</p>
      </div>
    </div>
  )
}

export default function Landing() {
  return (
    <>
      <header className="relative overflow-hidden pb-20 pt-24">
        <div className="pointer-events-none absolute -right-14 -top-20 h-96 w-96 rounded-full bg-violet/35 blur-[90px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-neon/20 blur-[90px]" />
        <div className="relative mx-auto max-w-[1120px] px-5">
          <p className="mb-3 text-sm font-semibold text-neon">Bitcoin, energy and real estate projects</p>
          <h1 className="text-[clamp(2.4rem,7vw,4.6rem)] font-bold leading-[1.05]">Invest in real projects, <span className="grad-text">anywhere in the world.</span></h1>
          <p className="mt-5 max-w-[620px] text-lg text-muted">WiseVest Global gives verified clients access to company-managed investment projects, with transparent documents, clear risk disclosure and crypto funding. Bank payments are coming soon.</p>
          <div className="mt-7 flex flex-wrap gap-3.5">
            <Link to="/projects" className="rounded-full bg-brand px-6 py-3 font-semibold text-[#05050a] shadow-glow">Explore investments</Link>
            <Link to="/register" className="rounded-full border border-line px-6 py-3 font-semibold hover:border-violet">Create account</Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-2.5">
            {['Project documents before you invest', 'Identity-verified accounts', 'BTC, USDT and USDC', 'Live project updates'].map((t) => (
              <span key={t} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[0.82rem] text-muted"><b className="mr-1.5 text-neon">●</b>{t}</span>
            ))}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1120px] px-5 py-16">
        <h2 className="text-3xl font-bold md:text-4xl">Three markets. One dashboard.</h2>
        <p className="mb-7 mt-2 max-w-xl text-muted">Each project page shows the asset, structure, timeline, fees and risks before you commit a single dollar.</p>
        <div className="grid gap-5 md:grid-cols-3">
          {cats.map((c) => (
            <article key={c.name} className="rounded-xl2 border border-line bg-surface p-7 transition hover:-translate-y-1 hover:border-violet">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-2xl">{c.icon}</div>
              <h3 className="text-xl font-bold">{c.name}</h3>
              <p className="mt-2 text-muted">{c.text}</p>
              {c.tags.map((t) => <Tag key={t}>{t}</Tag>)}
              <ul className="mt-3 list-disc pl-5 text-sm text-muted">{c.pts.map((p) => <li key={p}>{p}</li>)}</ul>
              <Link to={`/projects?category=${encodeURIComponent(c.name)}`} className="mt-5 inline-block rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-violet">View projects</Link>
            </article>
          ))}
        </div>
      </section>

      <section id="calculator" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-16">
        <h2 className="text-3xl font-bold md:text-4xl">See the range, <span className="grad-text">not just the best case.</span></h2>
        <p className="mb-7 mt-2 max-w-xl text-muted">Explore illustrative outcomes across scenarios, including a loss. These figures are examples, not forecasts or guarantees.</p>
        <Calculator />
      </section>

      <section id="how" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-16">
        <h2 className="mb-7 text-3xl font-bold md:text-4xl">From signup to portfolio in four steps.</h2>
        <ol className="grid gap-5 md:grid-cols-4">
          {[['Create and verify', 'Open an account and complete identity verification so your funds and withdrawals are protected.'], ['Choose a project', 'Compare projects, then read the documents and the risk summary.'], ['Fund your way', 'Pay with Bitcoin or stablecoins. Bank payments are coming soon.'], ['Track and withdraw', 'Follow updates in your dashboard and request withdrawals under stated terms.']].map(([t, d], i) => (
            <li key={t} className="rounded-xl2 border border-line bg-surface p-6">
              <div className="grad-text font-head text-4xl font-bold">{i + 1}</div>
              <h3 className="mt-1 font-bold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <h3 className="mb-3 mt-10 font-bold">Payment options</h3>
        <div className="flex flex-wrap gap-3">
          {['₿ Bitcoin', '◎ USDT', '◎ USDC', '🏦 Bank transfer · Coming soon'].map((p) => <span key={p} className="rounded-2xl border border-line bg-surface px-5 py-3 font-semibold">{p}</span>)}
        </div>
      </section>

      <section id="trust" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 py-16">
        <h2 className="mb-7 text-3xl font-bold md:text-4xl">Confidence comes from transparency.</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {[['📄', 'Documented projects', 'Every listing links to its legal structure, assets, fees and timeline.'], ['🛡️', 'Verified accounts', 'Identity and AML checks, two-factor login and withdrawal confirmations.'], ['⚠️', 'Honest risk disclosure', 'All investments carry risk. We show it upfront so you invest only what you can afford to lose.']].map(([i, t, d]) => (
            <div key={t} className="rounded-xl2 border border-line bg-surface p-6">
              <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-2xl">{i}</div>
              <h3 className="font-bold">{t}</h3>
              <p className="mt-1 text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
