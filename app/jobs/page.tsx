"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type Job = {
  id?: string;
  address?: string;
  role?: string;
  stage?: string;
  development_stage?: string;
  timing?: string;
  reason?: string;
  priority_score?: number;
  parcel_url?: string;
  apn?: string;
  slug?: string;
  location?: {
    address?: string;
  };
};

type AlertState = "idle" | "submitting" | "success" | "error";

const roleOptions = ["Civil / grading", "Structural / framing", "MEP", "General contractor", "Developer / investor"];
const stageOptions = ["INACTIVE", "EARLY", "ACTIVE", "SCALING", "STALLED", "COMPLETE"];
const timingOptions = ["now", "near-term", "future"];

function getAddress(job: Job): string {
  return job.address ?? job.location?.address ?? "Address unavailable";
}

function getStage(job: Job): string {
  return job.stage ?? job.development_stage ?? "Unknown";
}

function parcelHref(job: Job): string | null {
  if (job.apn) return `/parcel/${job.apn}`;
  if (job.parcel_url) return job.parcel_url.replace(/\/parcel\/([^/]+)\/.+$/, "/parcel/$1");
  return null;
}

function badgeClasses(value: string): string {
  const v = value.toLowerCase();
  if (v === "active" || v === "now") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (v === "scaling") return "border-violet-200 bg-violet-50 text-violet-700";
  if (v === "early" || v === "near-term") return "border-amber-200 bg-amber-50 text-amber-700";
  if (v === "stalled") return "border-red-200 bg-red-50 text-red-700";
  if (v === "complete") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-slate-100 text-slate-500";
}

function Badge({ value }: { value?: string }) {
  if (!value) return null;
  return <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[12px] font-semibold uppercase leading-5 ${badgeClasses(value)}`}>{value}</span>;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [role, setRole] = useState("");
  const [stage, setStage] = useState("");
  const [timing, setTiming] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [alertRole, setAlertRole] = useState(roleOptions[0]);
  const [location, setLocation] = useState("San Diego");
  const [alertState, setAlertState] = useState<AlertState>("idle");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "50" });
    if (role) params.set("role", role);
    if (stage) params.set("stage", stage);

    setLoading(true);
    fetch(`/api/jobs-feed?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Unable to load jobs"))))
      .then((payload) => {
        const rows = Array.isArray(payload) ? payload : payload.jobs_flat ?? payload.jobs ?? payload.data ?? [];
        setJobs(rows);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setJobs([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [role, stage]);

  const filteredJobs = useMemo(() => {
    return jobs
      .filter((job) => (timing ? job.timing === timing : true))
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0));
  }, [jobs, timing]);

  const groupedJobs = useMemo(() => {
    const groups = new Map<string, Job[]>();
    for (const job of filteredJobs) {
      const key = job.role ?? "Unassigned";
      groups.set(key, [...(groups.get(key) ?? []), job]);
    }
    return Array.from(groups.entries());
  }, [filteredJobs]);

  async function submitAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlertState("submitting");

    const res = await fetch("/api/alerts/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: alertRole, location }),
    });

    if (res.ok) {
      setAlertState("success");
      setEmail("");
    } else {
      setAlertState("error");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-6 text-slate-900">
      <div className="mx-auto max-w-[1180px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 pb-4">
          <div>
            <h1 className="text-[28px] font-bold leading-8 text-slate-950">JOBS THIS WEEK - SAN DIEGO</h1>
            <p className="mt-1 text-[14px] leading-5 text-slate-600">Ranked by current permit and stage signals.</p>
          </div>
          <button className="border border-slate-900 bg-slate-900 px-4 py-2 text-[14px] font-bold text-white" onClick={() => setModalOpen(true)} type="button">
            Get alerts like this
          </button>
        </header>

        <section className="flex flex-wrap gap-3 border-b border-slate-200 pb-4">
          <Filter label="Role" value={role} options={roleOptions} onChange={setRole} />
          <Filter label="Stage" value={stage} options={stageOptions} onChange={setStage} />
          <Filter label="Timing" value={timing} options={timingOptions} onChange={setTiming} />
        </section>

        <section className="space-y-6">
          {loading ? <p className="text-[14px] leading-5 text-slate-600">Loading jobs...</p> : null}
          {!loading && groupedJobs.length === 0 ? <p className="text-[14px] leading-5 text-slate-600">No jobs match these filters.</p> : null}
          {groupedJobs.map(([group, rows]) => (
            <div key={group} className="space-y-2">
              <h2 className="border-b border-slate-300 pb-1 text-[13px] font-bold uppercase leading-5 text-slate-700">{group}</h2>
              <div className="overflow-x-auto border-y border-slate-200 bg-white">
                <div className="min-w-[920px] divide-y divide-slate-200">
                  {rows.map((job, index) => {
                    const href = parcelHref(job);
                    const address = getAddress(job);
                    return (
                      <div key={job.id ?? `${group}-${index}`} className="grid min-h-11 grid-cols-[minmax(220px,1.4fr)_150px_100px_110px_minmax(240px,1.2fr)] items-center gap-3 px-3 py-2 text-[14px] leading-5">
                        <div className="min-w-0 font-bold text-slate-950">
                          {href ? <a className="hover:underline" href={href}>{address}</a> : address}
                        </div>
                        <div className="text-slate-700">{job.role ?? "Unassigned"}</div>
                        <Badge value={getStage(job)} />
                        <Badge value={job.timing} />
                        <div className="min-w-0 text-slate-700">{job.reason}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </section>

        <div className="border-t border-slate-300 pt-4 text-right">
          <button className="border border-slate-900 bg-white px-4 py-2 text-[14px] font-bold text-slate-950" onClick={() => setModalOpen(true)} type="button">
            Get alerts like this
          </button>
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md border border-slate-300 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-[16px] font-bold leading-6 text-slate-950">Get alerts like this</h2>
                <p className="text-[14px] leading-5 text-slate-600">New jobs as they appear.</p>
              </div>
              <button className="text-[14px] font-bold text-slate-500" onClick={() => setModalOpen(false)} type="button">Close</button>
            </div>

            {alertState === "success" ? (
              <div className="space-y-4">
                <p className="text-[14px] font-bold leading-5 text-emerald-700">You'll receive new jobs as they appear</p>
                <button className="border border-slate-900 bg-slate-900 px-4 py-2 text-[14px] font-bold text-white" onClick={() => setModalOpen(false)} type="button">Done</button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submitAlert}>
                <Field label="Email">
                  <input className="w-full border border-slate-300 px-3 py-2 text-[14px] leading-5 outline-none focus:border-slate-900" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </Field>
                <Field label="Role">
                  <select className="w-full border border-slate-300 px-3 py-2 text-[14px] leading-5 outline-none focus:border-slate-900" value={alertRole} onChange={(event) => setAlertRole(event.target.value)}>
                    {roleOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </Field>
                <Field label="Location">
                  <input className="w-full border border-slate-300 px-3 py-2 text-[14px] leading-5 outline-none focus:border-slate-900" value={location} onChange={(event) => setLocation(event.target.value)} />
                </Field>
                {alertState === "error" ? <p className="text-[14px] leading-5 text-red-700">Subscription failed. Try again.</p> : null}
                <button className="w-full border border-slate-900 bg-slate-900 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-60" disabled={alertState === "submitting"} type="submit">
                  {alertState === "submitting" ? "Submitting..." : "Submit"}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] font-bold uppercase leading-5 text-slate-500">
      {label}
      <select className="border border-slate-300 bg-white px-3 py-2 text-[14px] font-normal normal-case leading-5 text-slate-800 outline-none focus:border-slate-900" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold uppercase leading-5 text-slate-500">{label}</span>
      {children}
    </label>
  );
}
