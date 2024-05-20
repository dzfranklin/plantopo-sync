import cls from "@/cls";
import Highlight from "react-highlight";

export function JSONComponent({
  value,
  oneLine,
}: {
  value: unknown;
  oneLine?: boolean;
}) {
  return (
    <Highlight
      className={cls(
        "json",
        oneLine
          ? "text-xs inline-block m-0 p-0 bg-inherit"
          : "text-sm mx-5 my-2 p-2"
      )}
    >
      {JSON.stringify(value, null, oneLine ? undefined : 2)}
    </Highlight>
  );
}
