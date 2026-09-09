import { motion } from 'framer-motion';

export default function AmbientBackground({ focus = 'center' }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[var(--nx-bg)]" />
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 50% -20%, var(--nx-ambient-a), transparent),
            radial-gradient(ellipse 60% 40% at 100% 50%, var(--nx-ambient-b), transparent),
            radial-gradient(ellipse 50% 35% at 0% 80%, var(--nx-ambient-c), transparent)
          `,
        }}
      />
      <motion.div
        className="absolute -top-[20%] left-[15%] h-[55vh] w-[55vh] rounded-full blur-[100px]"
        style={{ background: 'var(--nx-orb-1)' }}
        animate={{ x: [0, 40, -20, 0], y: [0, 30, 10, 0], scale: [1, 1.08, 0.95, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-[30%] -right-[10%] h-[45vh] w-[45vh] rounded-full blur-[90px]"
        style={{ background: 'var(--nx-orb-2)' }}
        animate={{ x: [0, -50, 20, 0], y: [0, -25, 35, 0], scale: [1, 0.92, 1.05, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-[15%] left-[25%] h-[40vh] w-[50vh] rounded-full blur-[80px]"
        style={{ background: 'var(--nx-orb-3)' }}
        animate={{ x: [0, 30, -40, 0], y: [0, -20, 15, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      {focus === 'composer' && (
        <div
          className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 h-[420px] w-[min(720px,90vw)] rounded-full blur-[120px] opacity-60"
          style={{ background: 'var(--nx-spotlight)' }}
        />
      )}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(var(--nx-grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--nx-grid) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--nx-bg)_72%)]" />
    </div>
  );
}
