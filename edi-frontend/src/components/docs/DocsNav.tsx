'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Only this needs to be a Client Component -- it reads the current path to mark
// the active link. Keeping it separate lets the docs layout stay a Server
// Component, which is what allows the pages under it to export metadata.
const NAV: { group: string; items: { href: string; label: string }[] }[] = [
    {
        group: 'Start',
        items: [
            { href: '/', label: 'What EDI is' },
            { href: '/quickstart', label: 'Quickstart' },
            { href: '/asking', label: 'What you can ask' },
        ],
    },
    {
        group: 'Configure',
        items: [
            { href: '/models', label: 'Choosing a model' },
            { href: '/self-hosting', label: 'Self-hosting' },
        ],
    },
    {
        group: 'Reference',
        items: [
            { href: '/architecture', label: 'How it works' },
            { href: '/http-api', label: 'HTTP API' },
        ],
    },
];

export default function DocsNav() {
    const pathname = usePathname();

    return (
        <nav className="edi-docs-nav hidden w-52 shrink-0 lg:block">
            <div className="sticky top-24 space-y-6">
                {NAV.map((section) => (
                    <div key={section.group}>
                        <div className="edi-kicker-doc mb-2 px-3">{section.group}</div>
                        <div className="space-y-0.5">
                            {section.items.map((item) => (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    data-active={pathname === item.href}
                                >
                                    {item.label}
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </nav>
    );
}
