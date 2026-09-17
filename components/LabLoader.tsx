"use client";

import dynamic from "next/dynamic";

/**
 * The lab restores edited options, threshold and history from localStorage on
 * first render. Rendering it client-only means the initial state can read
 * storage directly, with no server/client hydration mismatch to paper over.
 */
const RouterLab = dynamic(() => import("@/components/RouterLab"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6" aria-busy>
      <div className="h-7 w-44 rounded-md bg-panel-2" />
      <div className="mt-2 h-4 w-96 max-w-full rounded bg-panel-2" />
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,11fr)_minmax(0,10fr)]">
        <div className="panel h-72" />
        <div className="panel h-72" />
      </div>
    </div>
  ),
});

export default function LabLoader() {
  return <RouterLab />;
}
