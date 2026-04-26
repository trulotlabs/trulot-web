import SearchBox from './components/SearchBox';

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <span className="inline-block text-xs font-semibold tracking-widest uppercase text-emerald-700 mb-4">
          San Diego · Beta
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight max-w-2xl mb-3">
          TruLot
        </h1>
        <p className="text-lg text-slate-500 max-w-lg mb-10">
          Parcel intelligence for San Diego developers.<br />
          Not AI slop — just the truth about every lot.
        </p>

        {/* Search */}
        <SearchBox />

        {/* Example nudge */}
        <p className="mt-6 text-xs text-slate-400">
          Try{' '}
          <a href="/parcel/5442140600/639-67th-st" className="text-emerald-600 hover:underline">
            639 67th St
          </a>
          {' '}or{' '}
          <a href="/parcel/5432020900/830-60th-st" className="text-emerald-600 hover:underline">
            830 60th St
          </a>
        </p>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} TruLot · Parcel data for San Diego County
      </footer>
    </div>
  );
}
