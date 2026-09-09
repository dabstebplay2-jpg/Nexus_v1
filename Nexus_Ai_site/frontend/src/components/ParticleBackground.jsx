export default function ParticleBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="absolute top-1/3 -right-32 h-80 w-80 rounded-full bg-violet-600/10 blur-3xl" />
      <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-blue-600/5 blur-3xl" />
    </div>
  );
}
