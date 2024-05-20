export default function PlaygroundShell({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="flex px-2 pt-2 gap-2 sticky top-0 bg-white items-baseline">
        {header}
      </div>
      <div className="px-2 pb-2">{children}</div>
    </div>
  );
}
