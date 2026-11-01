# Freelance Job Hunter Agent

Aplikasi pribadi (single-user): kumpulkan lowongan freelance web/AI → skor LLM →
draf proposal + CV PDF → review di dasbor → kirim via email / assisted → lacak
status. Mode `review` (default) atau `autopilot` (7 gerbang + dry-run + kill switch).

## Setup

```powershell
npm install
Copy-Item .env.example .env   # isi LLM_API_KEY, SMTP_*, TELEGRAM_*, DASHBOARD_PASSWORD
npm run db:migrate
npm run dev                   # http://localhost:3000
```

LLM default: 9router lokal (`LLM_BASE_URL=http://localhost:20128/v1`,
model `muse/spark-1.3`), kompatibel OpenAI SDK — ganti via `.env`.

## Menjalankan

- `npm run dev` — dasbor (Bahasa Indonesia).
- `npm run worker:once` — fetch sumber + pipeline sekali (Remotive, RemoteOK,
  We Work Remotely RSS, HN hiring, Freelancer.com bila `FREELANCER_TOKEN` ada).
- Worker terjadwal: fetch tiap 07:00, inbox tiap 15 mnt, digest 18:00, follow-up 09:00
  (Asia/Makassar). Bot Telegram long-polling untuk `/stop` + tombol Setujui/Lewati.
- `npm test` — 24 test (Vitest). `npx tsc --noEmit` — typecheck strict.

## Alur kerja

1. Input lowongan di `/jobs/new` (tempel URL/teks) atau tunggu fetch otomatis.
2. Sistem: ekstraksi → dedupe (URL + hash) → filter keyword → skor LLM (≥70 lanjut).
3. Buat draf di `/queue` (proposal, subjek, CV HTML → PDF), edit inline, Setujui/Lewati.
4. Kirim di `/applications`: email (hanya status `approved`, cap 5/hari 2/jam, cek MX)
   atau assisted (Salin + Buka URL; platform `manual_only` tidak pernah otomatis).
5. Inbox IMAP mengklasifikasi balasan; `interview`/`question` → notifikasi Telegram
   segera. Tidak pernah balas otomatis untuk `needsHuman`.

## Mengaktifkan autopilot dengan aman

1. Lengkapi SEMUA TODO di `data/profile.json` (email, rate, link, availability) —
   gerbang 4 menolak profil berisi TODO.
2. Di `/settings` klik **Aktifkan Autopilot** (butuh konfirmasi; selalu mulai `dryRun`).
3. 3 hari: email hanya masuk tabel `outbox` (dasbor), tidak ada yang terkirim.
4. Periksa outbox → klik **Akhiri Dry-run** (konfirmasi eksplisit) untuk kirim sungguhan.
5. Hanya lamaran yang lolos SEMUA 7 gerbang yang terkirim: (1) applyMethod email +
   contactEmail valid, (2) skor ≥85 tanpa red flag, (3) fact-check LLM lolos +
   150-250 kata, (4) profil tanpa TODO, (5) tak ada lamaran ke kontak sama <30 hari,
   (6) dalam cap + jam kirim 08:00-17:00 Asia/Makassar, (7) domain tidak diblokir + MX OK.
6. Kill switch: tombol **Jeda Semua** di dasbor atau `/stop` di Telegram (seketika).
   Jeda otomatis: 3 gagal kirim beruntun, bounce SMTP, kuota LLM habis.
7. Follow-up: maksimal 1 email, setelah 5 hari tanpa balasan, lalu `no_response`.

## Menambah sumber baru

Implementasikan `JobSource { id, fetch(): Promise<RawJob[]> }` di `worker/sources/`,
daftarkan di `ALL_SOURCES`. Hormati `robots.txt`/ToS/rate limit; gunakan
`politeDelay()`. Platform yang melarang scraping (LinkedIn/Upwork/Fiverr) =
`manual_only`: intake tempel saja, tanpa fetch otomatis.

## Atribusi sumber

- Remotive: tautkan balik URL lowongan + sebut "Remotive"; maks ~4 req/hari.
- Remote OK: link follow + sebut "Remote OK".
