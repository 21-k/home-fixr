import { ImageResponse } from "next/og";

// Social link-preview card, rendered at build time by next/og.
//
// Note for future edits: this is Satori, not a browser. Flexbox only (no CSS
// grid), inline styles only (no Tailwind classes), and every element that
// contains more than one child needs an explicit `display: flex`. Spacing uses
// margins rather than `gap` to stay on the well-supported path.

export const alt =
  "Home Fixr — mentorship for the skilled trades. Experienced electricians, plumbers, and HVAC technicians mentoring apprentices.";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

const BRAND = "#3b82f6"; // brand-500 (globals.css)
const BRAND_DEEP = "#1d4ed8"; // brand-700

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#18181b",
          backgroundImage: `radial-gradient(circle at 85% 15%, ${BRAND_DEEP} 0%, transparent 55%)`,
          fontFamily: "sans-serif",
          color: "white",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: BRAND,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            HF
          </div>
          <div style={{ marginLeft: 18, fontSize: 32, fontWeight: 600 }}>Home Fixr</div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              maxWidth: 900,
            }}
          >
            Mentorship for the skilled trades
          </div>
          <div
            style={{
              marginTop: 24,
              fontSize: 30,
              lineHeight: 1.4,
              color: "#d4d4d8",
              maxWidth: 860,
            }}
          >
            Experienced electricians, plumbers, and HVAC technicians mentoring
            apprentices.
          </div>
        </div>

        {/* Footer: trade chips + domain */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            {["Plumbing", "HVAC", "Electrical"].map((t) => (
              <div
                key={t}
                style={{
                  display: "flex",
                  marginRight: 12,
                  padding: "10px 20px",
                  borderRadius: 999,
                  border: "1px solid #3f3f46",
                  fontSize: 24,
                  color: "#e4e4e7",
                }}
              >
                {t}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: BRAND }}>
            home-fixr.com
          </div>
        </div>
      </div>
    ),
    size,
  );
}
