import "./globals.css";

export const metadata = { title: "Job Hunter", description: "Freelance Job Hunter Agent" };

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-zinc-50 text-zinc-900">
        <nav className="border-b bg-white">
          <div className="mx-auto flex max-w-5xl gap-4 px-4 py-3 text-sm">
            <a href="/" className="font-semibold">Job Hunter</a>
            <a href="/jobs">Lowongan</a>
            <a href="/jobs/new">Input Baru</a>
            <a href="/queue">Antrean</a>
            <a href="/applications">Lamaran</a>
            <a href="/profile">Profil</a>
            <a href="/settings">Pengaturan</a>
          </div>
        </nav>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
