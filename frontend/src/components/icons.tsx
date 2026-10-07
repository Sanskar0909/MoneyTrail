import type { ReactNode } from 'react';

/**
 * A handful of 16px stroke icons, drawn inline so there is no icon library to load. They are all
 * decorative: whatever they sit next to says the same thing in words.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function ArrowLeftIcon() {
  return (
    <Icon>
      <path d="M13 8H3m4-4L3 8l4 4" />
    </Icon>
  );
}

export function ArrowRightIcon() {
  return (
    <Icon>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="m3 8.5 3.2 3.2L13 4.8" />
    </Icon>
  );
}

export function ZoomInIcon() {
  return (
    <Icon>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3M7 5v4M5 7h4" />
    </Icon>
  );
}

export function ZoomOutIcon() {
  return (
    <Icon>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3M5 7h4" />
    </Icon>
  );
}

export function ExternalIcon() {
  return (
    <Icon>
      <path d="M9.5 2.5h4v4M13.5 2.5 8 8M11.5 9.5v4h-9v-9h4" />
    </Icon>
  );
}

export function DownloadIcon() {
  return (
    <Icon>
      <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
    </Icon>
  );
}
