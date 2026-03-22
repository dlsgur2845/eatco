interface StatusCardProps {
  label: string
  count: number
  variant: 'critical' | 'warning' | 'safe'
  icon: string
}

const variantStyles = {
  critical: 'border-tertiary-container text-tertiary-container',
  warning: 'border-secondary-container text-secondary-container',
  safe: 'border-primary-container text-primary',
}

export default function StatusCard({ label, count, variant, icon }: StatusCardProps) {
  return (
    <div
      className={`bg-surface-container-lowest rounded-[2rem] p-8 shadow-sm border-l-4 relative overflow-hidden group ${variantStyles[variant]}`}
    >
      <div className="relative z-10">
        <p className="font-body text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-4">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="font-headline font-bold text-5xl">{count}</span>
          <span className="font-headline font-bold text-xl text-on-surface">개</span>
        </div>
      </div>
      <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
        <span className="material-symbols-outlined text-8xl">{icon}</span>
      </div>
    </div>
  )
}
