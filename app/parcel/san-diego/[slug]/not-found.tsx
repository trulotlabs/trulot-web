export default function ParcelNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        Parcel not found
      </p>
      <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
        We do not have a public parcel record for this page yet.
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600">
        The requested San Diego parcel page could not be matched to the current
        parcel views. Try searching by address or APN from the homepage.
      </p>
    </main>
  );
}
