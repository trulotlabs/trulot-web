import type { Metadata } from "next";
import Image from "next/image";
import trulotMark from "@/public/trulot-mark.png";
import EarlyAccessForm from "./components/EarlyAccessForm";

const description =
  "TruLot is building parcel intelligence to help people understand what a property can become before they build, buy, sell, or invest.";

export const metadata: Metadata = {
  title: {
    absolute: "TruLot | Parcel Intelligence for Property Decisions",
  },
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "TruLot",
    title: "Know what a property can become.",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Know what a property can become.",
    description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://trulot.com/#organization",
      name: "TruLot",
      url: "https://trulot.com",
      description,
      areaServed: {
        "@type": "City",
        name: "San Diego",
      },
      knowsAbout: [
        "Parcel intelligence",
        "Property intelligence",
        "Real estate development decisions",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://trulot.com/#website",
      url: "https://trulot.com",
      name: "TruLot",
      publisher: {
        "@id": "https://trulot.com/#organization",
      },
    },
  ],
};

export default function Home() {
  return (
    <main className="prelaunch-shell">
      <div className="parcel-lines" aria-hidden="true" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className="prelaunch-header">
        <span className="wordmark" aria-label="TruLot">
          <Image
            className="wordmark-mark"
            src={trulotMark}
            alt=""
            aria-hidden="true"
            priority
          />
          TRULOT
        </span>
      </header>

      <section className="prelaunch-content" aria-labelledby="prelaunch-title">
        <p className="eyebrow">Parcel intelligence</p>
        <h1 id="prelaunch-title">Know what a property can become.</h1>

        <div className="prelaunch-copy">
          <p>
            TruLot is building a new kind of parcel intelligence, connecting the
            records, rules, history, and evidence behind a property to help answer
            the questions that matter before you build, buy, sell, or invest.
          </p>
          <p>Every parcel has a story. We&apos;re making it useful.</p>
        </div>

        <EarlyAccessForm />
      </section>

      <footer className="prelaunch-footer">
        <span>San Diego</span>
        <span aria-hidden="true">·</span>
        <span>Coming first</span>
      </footer>
    </main>
  );
}
