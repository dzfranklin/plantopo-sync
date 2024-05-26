import Link from "next/link";

export default function HomePage() {
  const entries = [
    { title: "Simulated playground", href: "/simulated" },
    { title: "Playground using localhost", href: "/local" },
    { title: "Backoff visualizer", href: "/backoff" },
  ];
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <ul className="flex flex-col gap-4">
        {entries.map((entry, i) => (
          <li key={i}>
            <Link
              href={entry.href}
              key={entry.href}
              className="underline hover:text-blue-600"
            >
              {entry.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
