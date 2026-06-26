type ZaloIconProps = {
  className?: string;
};

export default function ZaloIcon({ className }: ZaloIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.491 0C5.635 0 .089 4.313.089 9.615c0 2.617 1.443 4.974 3.707 6.527L2.25 24l5.589-2.803c1.721.478 3.549.737 5.431.737 6.856 0 12.402-4.313 12.402-9.615C23.672 4.313 18.347 0 12.491 0" />
    </svg>
  );
}
