import { connection } from 'next/server';
import { Suspense } from 'react';
import { Dashboard } from '@/components/dashboard';

// The dashboard's date ranges are anchored to the current time, so the page is rendered per request
// rather than prerendered at build time.
async function RequestTimeDashboard() {
  await connection();
  return <Dashboard />;
}

export default function Home() {
  return (
    <Suspense fallback={<div className="app" />}>
      <RequestTimeDashboard />
    </Suspense>
  );
}
