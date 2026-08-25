/**
 * Small inline icon set for src/components/social/**. Same convention as
 * the App Shell's icon set (src/components/shell/icons.tsx): every icon is
 * decorative, `aria-hidden="true"`, and the control it sits inside carries
 * its own accessible name — plain inline SVG, no icon font, no new
 * dependency. Not imported from the shell's set to keep this module
 * independent of App Shell's file scope.
 */
import type { SVGProps } from 'react';

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

/** A simple raised-hand glyph standing in for a "clap" — three upright fingers over a palm. */
export function ClapIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M8 12V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M11 11V4a1.5 1.5 0 0 1 3 0v7" />
      <path d="M14 11V6a1.5 1.5 0 0 1 3 0v9" />
      <path d="M17 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-2a6 6 0 0 1-5.2-3l-2.1-3.6a1.5 1.5 0 0 1 2.5-1.6L8 15" />
    </IconBase>
  );
}
