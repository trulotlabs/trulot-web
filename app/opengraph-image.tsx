import { ImageResponse } from "next/og";

const trulotMark = [
  "data:image/png;base64,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",
].join("");

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
            alignItems: "center",
            gap: 18,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "0.22em",
          }}
        >
          <img
            src={trulotMark}
            width="34"
            height="34"
            alt=""
            style={{ objectFit: "contain" }}
          />
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
