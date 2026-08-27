import Link from 'next/link';
import type { Metadata } from 'next';

import DocsNav from '@/components/docs/DocsNav';

export const metadata: Metadata = {
    title: {
        template: '%s · EDI.ai',
        default: 'EDI.ai',
    },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="edi-docs-shell">
            <header
                className="sticky top-0 z-20 backdrop-blur-md"
                style={{
                    borderBottom: '1px solid var(--edi-hairline)',
                    background: 'rgba(8,8,10,0.72)',
                }}
            >
                <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3.5">
                    <Link href="/" className="font-semibold tracking-tight text-white">
                        EDI<span style={{ color: 'var(--edi-signal)' }}>.ai</span>
                    </Link>
                    <span className="edi-kicker-doc">Docs</span>
                    {/* The site is the documentation; the app is the repository.
                        Nothing here opens a spreadsheet, so the one thing a
                        reader can act on from the header is the clone. */}
                    <a
                        href="https://github.com/illeniall239/EDI"
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-[13px] text-white/55 transition-colors hover:text-white"
                    >
                        GitHub →
                    </a>
                </div>
            </header>

            <div className="mx-auto flex max-w-6xl gap-10 px-6 py-10">
                <DocsNav />
                <main className="edi-doc min-w-0 flex-1 pb-24">{children}</main>
            </div>
        </div>
    );
}
