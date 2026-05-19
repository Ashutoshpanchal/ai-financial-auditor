export function CardSkeleton({ className = "" }: { className?: string }) {
  return <div className={`de-skeleton de-fade-in ${className}`} aria-hidden />;
}
