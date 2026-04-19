export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-20 text-center">
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-emerald-700 mb-4">
          San Diego · Beta
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight max-w-2xl">
          TruLot — Parcel intelligence<br className="hidden sm:block" /> for developers
        </h1>
        <p className="mt-4 text-lg text-slate-500 max-w-xl">
          Not AI slop. Just the truth about every parcel in San Diego.
        </p>

        {/* Email capture */}
        <div className="mt-10 w-full max-w-sm">
          <p className="text-sm text-slate-500 mb-3">Get notified when we launch publicly</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              placeholder="your@email.com"
              className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-300"
            />
            {/* TODO: wire to waitlist table */}
            <button
              type="button"
              className="px-5 py-2.5 bg-emerald-700 text-white font-semibold text-sm rounded-lg hover:bg-emerald-800 transition-colors"
            >
              Notify me
            </button>
          </div>
        </div>

        {/* Example parcel */}
        <div className="mt-12 p-5 bg-white border border-slate-200 rounded-xl text-left max-w-sm w-full">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">Example parcel</p>
          <a
            href="/parcel/5470501600/740-47th-st"
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800 underline underline-offset-2"
          >
            740 47th St, San Diego — 13-unit ADU project, active construction →
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} TruLot · Parcel data for San Diego County
      </footer>
    </div>
  );
}
