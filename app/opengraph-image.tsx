import { ImageResponse } from "next/og";

export const alt = "TruLot — Know what a property can become.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f3f0e8",
          color: "#12251f",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "0.22em",
          }}
        >
          TRULOT
        </div>
        <div
          style={{
            display: "flex",
            maxWidth: 900,
            fontSize: 76,
            fontWeight: 500,
            lineHeight: 1.05,
            letterSpacing: "-0.045em",
          }}
        >
          Know what a property can become.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 22,
            color: "#486158",
            letterSpacing: "0.04em",
          }}
        >
          Parcel intelligence · San Diego
        </div>
      </div>
    ),
    size,
  );
}
