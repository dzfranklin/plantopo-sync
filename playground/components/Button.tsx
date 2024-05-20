import cls from "@/cls";

export default function Button({
  children,
  onClick,
  disabled,
  small,
  primary,
}: {
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  small?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={cls(
        "rounded py-1 shadow-sm ring-1 ring-inset disabled:opacity-50 disabled:cursor-not-allowed",
        small ? "px-1.5 text-xs" : "px-2 text-sm font-semibold",
        primary
          ? "bg-blue-500 text-white hover:bg-blue-600 ring-blue-600"
          : "bg-white text-gray-900 hover:bg-gray-100 ring-gray-300"
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
