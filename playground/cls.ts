export default function cls(...args: (string | boolean | undefined)[]) {
  return args.filter(Boolean).join(" ");
}
