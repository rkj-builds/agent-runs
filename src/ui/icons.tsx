import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", className: "icon", "aria-hidden": true } as const;

export const Spinner = (p: P) => (
  <svg {...base} {...p} className={`icon spin ${p.className ?? ""}`}>
    <circle cx="8" cy="8" r="5.5" opacity="0.25" />
    <path d="M13.5 8A5.5 5.5 0 0 0 8 2.5" />
  </svg>
);
export const Check = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M5.5 8.2l1.7 1.7 3.3-3.6" />
  </svg>
);
export const Cross = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6 6l4 4M10 6l-4 4" />
  </svg>
);
export const Clock = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 5v3.2l2 1.3" />
  </svg>
);
export const Hand = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
  </svg>
);
export const Pause = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M6.6 6v4M9.4 6v4" />
  </svg>
);
export const Alert = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 2.2l6 10.6H2z" />
    <path d="M8 6.5v2.8M8 11.1v.1" />
  </svg>
);
export const Out = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 3.5h6.5V10M12.5 3.5L4 12" />
  </svg>
);
export const Chevron = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 4l4 4-4 4" />
  </svg>
);
export const Quiet = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 8h1.5M6.5 8H8M10 8h1.5M13 8h0" />
  </svg>
);
