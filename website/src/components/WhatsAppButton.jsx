import { SITE } from "@/lib/site"

const NUMBER = SITE.phoneHref.replace("tel:+", "")

/** The round green WhatsApp button in the bottom-left corner of every page, as on the WordPress site. */
export default function WhatsAppButton() {
  return (
    <a
      href={`https://wa.me/${NUMBER}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-5 left-5 z-50 flex size-14 items-center justify-center rounded-full bg-[#25d366] text-white shadow-[0_10px_25px_-8px_rgba(0,0,0,0.45)] transition hover:scale-105"
    >
      <svg viewBox="0 0 32 32" className="size-7" fill="currentColor" aria-hidden>
        <path d="M16.04 3C9 3 3.3 8.7 3.3 15.74c0 2.25.6 4.45 1.72 6.38L3.2 29l7.06-1.8a12.7 12.7 0 0 0 5.78 1.4h.01c7.03 0 12.74-5.7 12.74-12.74A12.66 12.66 0 0 0 16.04 3Zm0 23.4h-.01a10.6 10.6 0 0 1-5.4-1.48l-.39-.23-4.19 1.07 1.12-4.08-.25-.42a10.57 10.57 0 0 1-1.62-5.62c0-5.85 4.76-10.6 10.62-10.6 2.83 0 5.5 1.1 7.5 3.11a10.53 10.53 0 0 1 3.1 7.5c0 5.85-4.76 10.6-10.6 10.6Zm5.81-7.94c-.32-.16-1.89-.93-2.18-1.04-.29-.11-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.19.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.12 1.09-1.12 2.66 0 1.57 1.14 3.08 1.3 3.3.16.21 2.25 3.43 5.45 4.81.76.33 1.36.53 1.82.67.77.24 1.46.21 2.01.13.61-.09 1.89-.77 2.16-1.52.27-.75.27-1.39.19-1.52-.08-.13-.29-.21-.61-.37Z" />
      </svg>
    </a>
  )
}
