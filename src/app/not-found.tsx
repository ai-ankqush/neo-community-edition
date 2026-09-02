import Link from "next/link";

// Rendered at request time, not prerendered at build. The root layout wraps every page in
// Clerk's <ClerkProvider>, and statically prerendering /_not-found at build throws
// "Missing publishableKey" on any deploy without the Clerk key set. force-dynamic avoids that.
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] text-[var(--text)]">
      <p className="mb-2 text-6xl font-bold text-cyan-brand">404</p>
      <h1 className="mb-4 text-2xl font-bold">Page not found</h1>
      <p className="mb-8 max-w-md text-center text-[var(--muted)]">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/"
        className="rounded-md bg-cyan-brand px-6 py-2.5 font-semibold text-navy"
      >
        Go home
      </Link>
    </main>
  );
}
